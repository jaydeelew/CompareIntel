import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LatexRenderer from '@/components/LatexRenderer';
import { initializeRegistry } from '@/config/loadModelConfigs';
import { contentExpectsKatex } from './render-ready';
import '@/styles/variables.css';
import '@/styles/base.css';
import '@/styles/results.css';

interface RenderRequest {
  modelId: string;
  content: string;
  generation: string;
}

function markFailed(reason: string) {
  const root = document.getElementById('root');
  root?.setAttribute('data-render-failed', reason);
  const container = document.querySelector('[data-render-container]');
  container?.setAttribute('data-render-failed', reason);
  container?.removeAttribute('data-render-complete');
}

function HarnessApp() {
  const [ready, setReady] = useState(false);
  const [renderData, setRenderData] = useState<RenderRequest | null>(null);

  useEffect(() => {
    initializeRegistry()
      .then(() => document.fonts.ready)
      .then(() => {
        setReady(true);

        window.addEventListener('message', (event) => {
          if (event.data?.type === 'render' && typeof event.data.content === 'string') {
            setRenderData({
              modelId: String(event.data.modelId || 'test'),
              content: event.data.content,
              generation: String(event.data.generation || ''),
            });
          }
        });

        document.documentElement.setAttribute('data-harness-listening', 'true');

        if (window.opener) {
          window.opener.postMessage({ type: 'harness-ready' }, '*');
        }

        const params = new URLSearchParams(window.location.search);
        const modelId = params.get('modelId');
        const content = params.get('content');
        if (modelId && content) {
          // URLSearchParams already decodes. A second decodeURIComponent throws
          // URI malformed on replies that contain a literal `%`.
          setRenderData({ modelId, content, generation: '' });
        }
      })
      .catch((err: unknown) => {
        markFailed(`registry-or-fonts: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  useEffect(() => {
    if (!ready || !renderData) return;

    let cancelled = false;
    let settled = false;
    let attempt = 0;

    const nextFrame = () =>
      new Promise<void>(resolve => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });

    const domReady = (container: Element) => {
      const text = (container.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return false;
      if (container.querySelectorAll('.katex-html[style*="visibility: hidden"]').length > 0) return false;
      const images = Array.from(container.querySelectorAll('img'));
      if (images.some(img => !img.complete)) return false;
      return true;
    };

    const finishIfReady = () => {
      if (cancelled || settled) return;
      const container = document.querySelector('[data-render-container]');
      if (!container || !domReady(container)) return;
      const token = ++attempt;
      void (async () => {
        // KaTeX inserts font faces after the first paint. Wait until the
        // font set stays loaded and the same size across two frames.
        for (let cycle = 0; cycle < 40; cycle++) {
          if (cancelled || token !== attempt) return;
          await document.fonts.ready;
          if (cancelled || token !== attempt) return;
          const size = document.fonts.size;
          await nextFrame();
          if (cancelled || token !== attempt) return;
          const current = document.querySelector('[data-render-container]');
          if (!current || !domReady(current)) return;
          if (document.fonts.status === 'loaded' && document.fonts.size === size) {
            settled = true;
            observer.disconnect();
            current.setAttribute('data-render-complete', 'true');
            if (renderData.generation) current.setAttribute('data-render-generation', renderData.generation);
            else current.removeAttribute('data-render-generation');
            current.removeAttribute('data-render-failed');
            document.getElementById('root')?.removeAttribute('data-render-failed');
            return;
          }
        }
        if (!cancelled && token === attempt) markFailed('fonts did not settle');
      })();
    };

    const container = document.querySelector('[data-render-container]');
    if (!container) return;
    container.removeAttribute('data-render-complete');

    const observer = new MutationObserver(() => {
      container.querySelectorAll('img').forEach(img => {
        if (!img.complete) {
          img.addEventListener('load', finishIfReady, { once: true });
          img.addEventListener('error', finishIfReady, { once: true });
        }
      });
      finishIfReady();
    });
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    void document.fonts.ready.then(() => finishIfReady());
    finishIfReady();
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [ready, renderData]);

  if (!ready) {
    return <div>Initializing renderer...</div>;
  }

  if (!renderData) {
    return <div>Waiting for render request...</div>;
  }

  return (
    <div
      data-render-container
      data-expects-katex={contentExpectsKatex(renderData.content) ? 'true' : 'false'}
      className="results-section"
    >
      <div className="results-grid">
        <article className="result-card conversation-card">
          <div className="message-content">
            <LatexRenderer className="result-output" modelId={renderData.modelId}>
              {renderData.content}
            </LatexRenderer>
          </div>
        </article>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<HarnessApp />);
