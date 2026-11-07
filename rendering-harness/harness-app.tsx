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
      // Wait for actual rendering to complete
      // Check for: KaTeX rendering, Prism highlighting, images loaded
      const checkRenderComplete = () => {
        const container = document.querySelector('[data-render-container]');
        if (!container) return false;
        
        // Check if KaTeX is done (no .katex-display-processing or pending renders)
        const katexProcessing = container.querySelectorAll('.katex-display-processing, .katex-processing');
        if (katexProcessing.length > 0) return false;
        
        // Check if Prism has run (code blocks should have .token classes or be empty)
        const codeBlocks = container.querySelectorAll('pre code[class*="language-"]');
        for (const block of codeBlocks) {
          const hasTokens = block.querySelectorAll('.token').length > 0;
          const isEmpty = block.textContent?.trim() === '';
          if (!hasTokens && !isEmpty) return false;
        }
        
        // Check all images are loaded
        const images = container.querySelectorAll('img');
        for (const img of images) {
          if (!img.complete) return false;
        }
        
        return true;
      };
      
      // Poll for completion with exponential backoff
      let attempts = 0;
      const maxAttempts = 30;
      const checkInterval = () => {
        if (checkRenderComplete()) {
          const container = document.querySelector('[data-render-container]');
          if (container) {
            container.setAttribute('data-render-complete', 'true');
          }
          setRenderComplete(true);
        } else if (attempts < maxAttempts) {
          attempts++;
          const delay = Math.min(100 * Math.pow(1.2, attempts), 2000);
          setTimeout(checkInterval, delay);
        } else {
          // Timeout - mark complete anyway but with a warning attribute
          console.warn('Render timeout after', attempts, 'attempts');
          const container = document.querySelector('[data-render-container]');
          if (container) {
            container.setAttribute('data-render-complete', 'true');
            container.setAttribute('data-render-timeout', 'true');
          }
          setRenderComplete(true);
        }
      };
      
      // Start checking after a small initial delay
      setTimeout(checkInterval, 100);
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
