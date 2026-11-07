import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LatexRenderer from '../frontend/src/components/LatexRenderer';
import { initializeRegistry } from '../frontend/src/config/loadModelConfigs';
import '../frontend/src/index.css';

interface RenderRequest {
  modelId: string;
  content: string;
}

function HarnessApp() {
  const [ready, setReady] = useState(false);
  const [renderData, setRenderData] = useState<RenderRequest | null>(null);
  const [renderComplete, setRenderComplete] = useState(false);
  
  useEffect(() => {
    // Initialize the model renderer registry
    initializeRegistry().then(() => {
      // Wait for fonts to load
      document.fonts.ready.then(() => {
        setReady(true);
        
        // Listen for render requests from parent
        window.addEventListener('message', (event) => {
          if (event.data.type === 'render') {
            setRenderData({
              modelId: event.data.modelId,
              content: event.data.content,
            });
          }
        });
        
        // Signal ready
        if (window.opener) {
          window.opener.postMessage({ type: 'harness-ready' }, '*');
        }
        
        // Check URL params for inline render request
        const params = new URLSearchParams(window.location.search);
        const modelId = params.get('modelId');
        const content = params.get('content');
        
        if (modelId && content) {
          setRenderData({ modelId, content: decodeURIComponent(content) });
        }
      });
    });
  }, []);
  
  useEffect(() => {
    if (ready && renderData && !renderComplete) {
      // Wait for actual rendering state: KaTeX completion, Prism highlighting
      let attempts = 0;
      const maxAttempts = 50; // 10 seconds max (200ms * 50)
      
      const checkRenderState = () => {
        const container = document.querySelector('[data-render-container]');
        if (!container) {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkRenderState, 200);
          }
          return;
        }
        
        // Check for KaTeX processing states
        const katexProcessing = container.querySelectorAll('.katex-html[style*="visibility: hidden"]');
        if (katexProcessing.length > 0) {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkRenderState, 200);
          }
          return;
        }
        
        // Check if Prism has highlighted code blocks (if any)
        const codeBlocks = container.querySelectorAll('pre code[class*="language-"]');
        let prismReady = true;
        for (const block of codeBlocks) {
          // Prism adds .token classes when highlighting is done
          const tokens = block.querySelectorAll('.token');
          const isEmpty = block.textContent?.trim() === '';
          if (!isEmpty && tokens.length === 0) {
            prismReady = false;
            break;
          }
        }
        
        if (!prismReady) {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkRenderState, 200);
          }
          return;
        }
        
        // Check if images are loaded (if any)
        const images = container.querySelectorAll('img');
        for (const img of images) {
          if (!img.complete) {
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(checkRenderState, 200);
            }
            return;
          }
        }
        
        // All checks passed - mark complete
        container.setAttribute('data-render-complete', 'true');
        setRenderComplete(true);
      };
      
      // Start checking after initial render
      setTimeout(checkRenderState, 100);
    }
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
