#!/usr/bin/env node
/**
 * Test the harness with fixture data (no API key required)
 */

import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FixtureResponse {
  modelId: string;
  modelName: string;
  prompt: string;
  response: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
}

interface TestResult {
  modelId: string;
  modelName: string;
  promptName: string;
  response: string;
  usage: any;
  actualCost: number;
  timestamp: string;
  screenshotPath: string;
}

/**
 * Start Vite dev server
 */
async function startViteServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const vite = spawn('npm', ['run', 'dev'], {
      cwd: __dirname,
      stdio: 'pipe',
      detached: false,
    });
    
    let output = '';
    let resolved = false;
    
    vite.stdout?.on('data', (data) => {
      output += data.toString();
      if (!resolved && output.includes('Local:') && output.includes('5174')) {
        console.log('✓ Vite dev server started on port 5174');
        resolved = true;
        // Give it a moment to fully initialize
        setTimeout(() => resolve(vite), 2000);
      }
    });
    
    vite.stderr?.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && msg.includes('EADDRINUSE')) {
        console.log('✓ Vite dev server already running on port 5174');
        resolved = true;
        resolve(vite);
      }
    });
    
    vite.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    
    // Timeout after 60s
    setTimeout(() => {
      console.log('Waiting for Vite to start (this may take a moment)...');
    }, 5000);
    
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Vite server failed to start within 60s'));
      }
    }, 60000);
  });
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxAttempts = 60): Promise<void> {
  console.log('Waiting for Vite server to be ready...');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://127.0.0.1:5174/');
      if (response.ok) {
        console.log('✓ Vite server is ready');
        return;
      }
    } catch (e) {
      if (i % 10 === 0 && i > 0) {
        console.log(`  Still waiting... (${i}s)`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Server did not become ready within 60 seconds');
}

/**
 * Render a response using the harness
 */
async function renderResponse(
  page: any,
  modelId: string,
  response: string,
  outputPath: string
): Promise<void> {
  const encodedContent = encodeURIComponent(response);
  const url = `http://127.0.0.1:5174/?modelId=${encodeURIComponent(modelId)}&content=${encodedContent}`;
  
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait for rendering to complete
  await page.waitForFunction(
    () => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return false;
      return container.hasAttribute('data-render-complete');
    },
    { timeout: 30000 }
  );
  
  // Take screenshot
  const element = await page.$('[data-render-container]');
  if (element) {
    await element.screenshot({ path: outputPath });
  }
}

/**
 * Generate review HTML
 */
async function generateReviewPage(
  results: TestResult[],
  outputDir: string,
  runDate: string
): Promise<void> {
  const reviewPath = path.join(outputDir, 'review.html');
  
  const byPrompt = new Map<string, TestResult[]>();
  for (const result of results) {
    if (!byPrompt.has(result.promptName)) {
      byPrompt.set(result.promptName, []);
    }
    byPrompt.get(result.promptName)!.push(result);
  }
  
  const totalCost = results.reduce((sum, r) => sum + r.actualCost, 0);
  
  const escapeHtml = (text: string) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Model Rendering QA Review (Fixture Test)</title>
  <style>
    body { 
      font-family: system-ui, -apple-system, sans-serif; 
      margin: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .notice {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .prompt-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .model-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .model-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      background: #fafafa;
    }
    .model-card h4 {
      margin-top: 0;
    }
    .screenshot {
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin: 10px 0;
    }
    .raw-response {
      background: #f5f5f5;
      padding: 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      max-height: 200px;
      overflow-y: auto;
      margin: 10px 0;
      white-space: pre-wrap;
    }
    .feedback {
      margin-top: 10px;
    }
    textarea {
      width: 100%;
      min-height: 80px;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: inherit;
    }
    .export-btn {
      background: #007bff;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    .export-btn:hover {
      background: #0056b3;
    }
    .meta {
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>Model Rendering QA Review (Fixture Test)</h1>
  
  <div class="notice">
    <strong>⚠️ Test Run with Fixtures</strong><br>
    This test used hand-written fixture responses (no actual API calls).
    To test with real models, set OPENROUTER_API_KEY and run the main harness.
  </div>
  
  <div class="summary">
    <h2>Summary</h2>
    <p><strong>Run Date:</strong> ${runDate}</p>
    <p><strong>Models Tested:</strong> ${new Set(results.map(r => r.modelId)).size} (fixture data)</p>
    <p><strong>Total Results:</strong> ${results.length}</p>
    <p><strong>Fixture Cost (simulated):</strong> $${totalCost.toFixed(4)}</p>
    <button class="export-btn" onclick="exportFeedback()">Export All Feedback as JSON</button>
  </div>
  
  ${Array.from(byPrompt.entries()).map(([promptName, promptResults]) => `
    <div class="prompt-section">
      <h2>${promptName}</h2>
      <div class="model-grid">
        ${promptResults.map(result => {
          const screenshotFilename = path.basename(result.screenshotPath);
          return `
          <div class="model-card">
            <h4>${result.modelName}</h4>
            <div class="meta">
              Model ID: ${result.modelId}<br>
              Tokens: ${result.usage.totalTokens} (${result.usage.promptTokens} in / ${result.usage.completionTokens} out)<br>
              Cost: $${result.actualCost.toFixed(4)}<br>
              Time: ${new Date(result.timestamp).toLocaleString()}
            </div>
            
            <img src="${screenshotFilename}" 
                 class="screenshot" 
                 alt="Rendered output"
                 onerror="this.style.display='none'">
            
            <details>
              <summary>Raw Response</summary>
              <div class="raw-response">${escapeHtml(result.response.substring(0, 1000))}${result.response.length > 1000 ? '...' : ''}</div>
            </details>
            
            <div class="feedback">
              <label>Feedback:</label>
              <textarea 
                data-feedback-model="${result.modelId}"
                data-feedback-prompt="${promptName}"
                placeholder="Note any rendering issues, bugs, or observations..."></textarea>
            </div>
          </div>
        `;
        }).join('')}
      </div>
    </div>
  `).join('')}
  
  <script>
    function exportFeedback() {
      const feedback = {};
      document.querySelectorAll('textarea[data-feedback-model]').forEach(textarea => {
        const modelId = textarea.dataset.feedbackModel;
        const promptName = textarea.dataset.feedbackPrompt;
        const value = textarea.value.trim();
        
        if (value) {
          if (!feedback[modelId]) {
            feedback[modelId] = {};
          }
          feedback[modelId][promptName] = value;
        }
      });
      
      const json = JSON.stringify(feedback, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rendering-feedback-${runDate}.json';
      a.click();
    }
  </script>
</body>
</html>`;
  
  await fs.writeFile(reviewPath, html);
}

async function main() {
  console.log('=== Model Rendering QA Harness (Fixture Test) ===\n');
  
  // Load fixtures
  console.log('Loading fixture responses...');
  const fixturesPath = path.join(__dirname, 'fixtures/sample-responses.json');
  const fixturesContent = await fs.readFile(fixturesPath, 'utf-8');
  const fixtures: FixtureResponse[] = JSON.parse(fixturesContent);
  console.log(`Loaded ${fixtures.length} fixture responses\n`);
  
  // Setup output directory
  const runDate = new Date().toISOString().split('T')[0];
  const outputDir = path.join(__dirname, 'runs', `${runDate}-fixture-test`);
  await fs.mkdir(outputDir, { recursive: true });
  
  // Start Vite server
  console.log('Starting Vite dev server...');
  const viteProcess = await startViteServer();
  await waitForServer();
  console.log('');
  
  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const results: TestResult[] = [];
  
  try {
    for (const fixture of fixtures) {
      console.log(`\nRendering ${fixture.modelName} - ${fixture.prompt}...`);
      
      const screenshotPath = path.join(
        outputDir,
        `${fixture.modelId.replace(/\//g, '_')}_${fixture.prompt}.png`
      );
      
      await renderResponse(page, fixture.modelId, fixture.response, screenshotPath);
      console.log(`  ✓ Screenshot saved`);
      
      results.push({
        modelId: fixture.modelId,
        modelName: fixture.modelName,
        promptName: fixture.prompt,
        response: fixture.response,
        usage: fixture.usage,
        actualCost: fixture.cost,
        timestamp: new Date().toISOString(),
        screenshotPath,
      });
    }
  } finally {
    await page.close();
    await browser.close();
    
    // Stop Vite
    viteProcess.kill();
  }
  
  // Generate review page
  console.log('\nGenerating review page...');
  await generateReviewPage(results, outputDir, runDate);
  
  console.log('\n=== Test Complete ===');
  console.log(`Results saved to: ${outputDir}`);
  console.log(`Review page: ${path.join(outputDir, 'review.html')}`);
  console.log('\nOpen review.html in a browser to inspect the rendered outputs.');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
