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
      // Simple timeout-based readiness (LatexRenderer is mostly synchronous)
      // Wait 1.5 seconds for any async operations (Prism, image loading, etc.)
      const timer = setTimeout(() => {
        const container = document.querySelector('[data-render-container]');
        if (container) {
          container.setAttribute('data-render-complete', 'true');
        }
        setRenderComplete(true);
      }, 1500);
      
      return () => clearTimeout(timer);
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
