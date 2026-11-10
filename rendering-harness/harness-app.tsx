import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LatexRenderer from '../frontend/src/components/LatexRenderer';
import { initializeRegistry } from '../frontend/src/config/loadModelConfigs';
import { contentExpectsKatex } from './render-ready';
import '../frontend/src/styles/variables.css';
import '../frontend/src/styles/base.css';
import '../frontend/src/styles/models.css';
import '../frontend/src/styles/results.css';

interface RenderRequest {
  modelId: string;
  content: string;
}

function markFailed(reason: string) {
  const root = document.getElementById('root');
  root?.setAttribute('data-render-failed', reason);
  const container = document.querySelector('[data-render-container]');
  container?.setAttribute('data-render-failed', reason);
  container?.removeAttribute('data-render-complete');
}

/** True when visible text is present and KaTeX is not still measuring itself. */
function renderDomReady(container: Element): boolean {
  const text = (container.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;

  const katexProcessing = container.querySelectorAll('.katex-html[style*="visibility: hidden"]');
  if (katexProcessing.length > 0) return false;

  for (const img of Array.from(container.querySelectorAll('img'))) {
    if (!img.complete) return false;
  }
  return true;
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
          // URLSearchParams already decodes. A second decodeURIComponent throws
          // URI malformed on replies that contain a literal `%` (Qwen 05 8192 rerun).
          setRenderData({ modelId, content });
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
    let frame = 0;
    const finishIfReady = () => {
      if (cancelled || settled) return;
      const container = document.querySelector('[data-render-container]');
      if (!container || !renderDomReady(container)) return;
      settled = true;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      container.setAttribute('data-render-complete', 'true');
      container.removeAttribute('data-render-failed');
      document.getElementById('root')?.removeAttribute('data-render-failed');
    };

    const container = document.querySelector('[data-render-container]');
    if (!container) return;

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
    // Sample the DOM every frame until KaTeX and text are actually present.
    // The frame stops as soon as the container is ready. It is not a sleep.
    const tick = () => {
      if (cancelled || settled) return;
      finishIfReady();
      if (!cancelled && !settled) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    finishIfReady();
    return () => {
      cancelled = true;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
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
