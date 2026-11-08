import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LatexRenderer from '../frontend/src/components/LatexRenderer';
import { initializeRegistry } from '../frontend/src/config/loadModelConfigs';
import '../frontend/src/index.css';

interface RenderRequest {
  modelId: string;
  content: string;
}

const SKIP_PRISM_LANGS = new Set(['', 'none', 'plain', 'plaintext', 'text']);

function markFailed(reason: string) {
  const root = document.getElementById('root');
  root?.setAttribute('data-render-failed', reason);
  const container = document.querySelector('[data-render-container]');
  container?.setAttribute('data-render-failed', reason);
  container?.removeAttribute('data-render-complete');
}

function languageFromCode(block: Element): string {
  const cls = Array.from(block.classList).find(c => c.startsWith('language-'));
  return cls ? cls.replace('language-', '').toLowerCase() : '';
}

function HarnessApp() {
  const [ready, setReady] = useState(false);
  const [renderData, setRenderData] = useState<RenderRequest | null>(null);
  const [renderComplete, setRenderComplete] = useState(false);

  useEffect(() => {
    initializeRegistry()
      .then(() => document.fonts.ready)
      .then(() => {
        setReady(true);

        window.addEventListener('message', (event) => {
          if (event.data?.type === 'render') {
            setRenderData({
              modelId: event.data.modelId,
              content: event.data.content,
            });
          }
        });

        if (window.opener) {
          window.opener.postMessage({ type: 'harness-ready' }, '*');
        }

        const params = new URLSearchParams(window.location.search);
        const modelId = params.get('modelId');
        const content = params.get('content');
        if (modelId && content) {
          setRenderData({ modelId, content: decodeURIComponent(content) });
        }
      })
      .catch((err: unknown) => {
        markFailed(`registry-or-fonts: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  useEffect(() => {
    if (!ready || !renderData || renderComplete) return;

    let attempts = 0;
    const maxAttempts = 50;
    let cancelled = false;

    const checkRenderState = () => {
      if (cancelled) return;
      const container = document.querySelector('[data-render-container]');
      if (!container) {
        retry('render-container-missing');
        return;
      }

      const katexProcessing = container.querySelectorAll('.katex-html[style*="visibility: hidden"]');
      if (katexProcessing.length > 0) {
        retry('katex-processing');
        return;
      }

      const codeBlocks = container.querySelectorAll('pre code[class*="language-"]');
      const prism = (window as Window & { Prism?: { languages?: Record<string, unknown> } }).Prism;
      for (const block of Array.from(codeBlocks)) {
        const lang = languageFromCode(block);
        if (SKIP_PRISM_LANGS.has(lang)) continue;
        if (!prism) {
          retry('prism-not-loaded');
          return;
        }
        if (!prism.languages || !prism.languages[lang]) {
          // Unknown language, or Prism has no grammar: do not wait for .token
          continue;
        }
        const isEmpty = block.textContent?.trim() === '';
        if (!isEmpty && block.querySelectorAll('.token').length === 0) {
          retry('prism-highlighting');
          return;
        }
      }

      const images = container.querySelectorAll('img');
      for (const img of Array.from(images)) {
        if (!img.complete) {
          retry('images-loading');
          return;
        }
      }

      container.setAttribute('data-render-complete', 'true');
      container.removeAttribute('data-render-failed');
      document.getElementById('root')?.removeAttribute('data-render-failed');
      setRenderComplete(true);
    };

    const retry = (reason: string) => {
      attempts += 1;
      if (attempts >= maxAttempts) {
        markFailed(reason);
        return;
      }
      window.setTimeout(checkRenderState, 200);
    };

    window.setTimeout(checkRenderState, 50);
    return () => {
      cancelled = true;
    };
  }, [ready, renderData, renderComplete]);

  if (!ready) {
    return <div>Initializing renderer...</div>;
  }

  if (!renderData) {
    return <div>Waiting for render request...</div>;
  }

  return (
    <div
      data-render-container
      style={{
        padding: '20px',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      <LatexRenderer modelId={renderData.modelId}>
        {renderData.content}
      </LatexRenderer>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<HarnessApp />);
