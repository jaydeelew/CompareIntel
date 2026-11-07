#!/usr/bin/env node
/**
 * Model Rendering QA Harness
 * 
 * Tests model rendering across different prompts using the real frontend LatexRenderer.
 * 
 * Usage:
 *   npm run harness                                    # Run with defaults
 *   npm run harness -- --dry-run                       # Estimate cost only
 *   npm run harness -- --models gpt-4o,claude-sonnet   # Test specific models
 *   npm run harness -- --max-usd 5.0                   # Set cost cap
 */

import fs from 'fs/promises';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MAX_TOKENS = 2048;
const THINKING_MODEL_OUTPUT_MULTIPLIER = 3; // Conservative 3x for thinking models

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  is_thinking_model?: boolean;
}

interface OpenRouterModel {
  id: string;
  pricing: {
    prompt: string;
    completion: string;
  };
}

interface PricingInfo {
  inputCostPerToken: number;
  outputCostPerToken: number;
}

interface TestResult {
  modelId: string;
  modelName: string;
  promptName: string;
  promptText: string;
  response: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number; // Actual cost from OpenRouter usage.cost if available
  };
  actualCost: number;
  timestamp: string;
  error?: string;
  featureCoverage?: FeatureCoverageResult;
}

interface HarnessConfig {
  dryRun: boolean;
  modelIds: string[];
  maxUsd: number;
  maxTokens: number;
  outputDir: string;
  runDate: string;
  textModelsOnly: boolean;
  cumulativeCostUsd: number; // Track actual spending
}

/**
 * Load models from registry
 */
async function loadModelRegistry(textOnly: boolean = true): Promise<ModelEntry[]> {
  const registryPath = path.join(__dirname, '../backend/data/models_registry.json');
  const content = await fs.readFile(registryPath, 'utf-8');
  const registry = JSON.parse(content);
  
  const models: ModelEntry[] = [];
  for (const [provider, providerModels] of Object.entries(registry.models_by_provider)) {
    if (Array.isArray(providerModels)) {
      for (const model of providerModels) {
        // Filter for text/language models only if requested
        if (textOnly && model.category === 'Image') {
          continue;
        }
        models.push({
          id: model.id,
          name: model.name,
          provider: provider as string,
          is_thinking_model: model.is_thinking_model || false,
        });
      }
    }
  }
  
  return models;
}

/**
 * Fetch pricing from OpenRouter public API
 */
async function fetchOpenRouterPricing(): Promise<Map<string, PricingInfo>> {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`);
  }
  
  const data = await response.json();
  const pricingMap = new Map<string, PricingInfo>();
  
  for (const model of data.data as OpenRouterModel[]) {
    pricingMap.set(model.id, {
      inputCostPerToken: parseFloat(model.pricing.prompt),
      outputCostPerToken: parseFloat(model.pricing.completion),
    });
  }
  
  return pricingMap;
}

/**
 * Load test prompts
 */
async function loadPrompts(): Promise<Map<string, string>> {
  const promptsDir = path.join(__dirname, 'prompts');
  const files = await fs.readdir(promptsDir);
  const prompts = new Map<string, string>();
  
  for (const file of files) {
    if (file.endsWith('.md')) {
      const content = await fs.readFile(path.join(promptsDir, file), 'utf-8');
      const name = file.replace('.md', '');
      prompts.set(name, content);
    }
  }
  
  return prompts;
}

/**
 * Estimate cost for a single request
 */
function estimateRequestCost(
  modelId: string,
  promptTokens: number,
  maxTokens: number,
  pricing: PricingInfo | undefined,
  isThinkingModel: boolean
): number {
  if (!pricing) {
    console.warn(`  Warning: No pricing info for ${modelId}, using $0`);
    return 0;
  }
  
  const outputTokens = maxTokens * (isThinkingModel ? THINKING_MODEL_OUTPUT_MULTIPLIER : 1);
  const inputCost = promptTokens * pricing.inputCostPerToken;
  const outputCost = outputTokens * pricing.outputCostPerToken;
  
  return inputCost + outputCost;
}

/**
 * Rough token estimation (chars / 4)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(
  modelId: string,
  prompt: string,
  maxTokens: number,
  pricing: Map<string, PricingInfo>
): Promise<{ response: string; usage: any; cost: number }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://compareintel.com',
      'X-Title': 'CompareIntel Rendering Harness',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      usage: { include: true },
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${error}`);
  }
  
  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';
  const usage = data.usage;
  
  // Use OpenRouter's actual cost if provided, otherwise estimate from pricing
  let cost = 0;
  if (usage?.cost) {
    // OpenRouter returned actual cost
    cost = usage.cost;
  } else if (usage && usage.prompt_tokens && usage.completion_tokens) {
    // Estimate from pricing map when cost not provided
    const modelPricing = pricing.get(modelId);
    if (modelPricing) {
      cost = (usage.prompt_tokens * modelPricing.inputCostPerToken) +
             (usage.completion_tokens * modelPricing.outputCostPerToken);
    }
  }
  
  return { response: content, usage, cost };
}

/**
 * Start Vite dev server
 */
async function startViteServer(): Promise<ChildProcess | null> {
  // Check if server is already running
  try {
    const response = await fetch('http://localhost:5174/');
    if (response.ok) {
      console.log('✓ Vite dev server already running on port 5174');
      return null; // Server already running, no process to manage
    }
  } catch (e) {
    // Server not running, start it
  }
  
  return new Promise((resolve, reject) => {
    console.log('Starting Vite dev server...');
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
        resolved = true;
        // Give it a moment to fully initialize
        setTimeout(() => {
          console.log('✓ Vite dev server started on port 5174');
          resolve(vite);
        }, 2000);
      }
    });
    
    vite.stderr?.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && msg.includes('EADDRINUSE')) {
        resolved = true;
        console.log('✓ Vite dev server already running on port 5174');
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
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:5174/');
      if (response.ok) {
        return;
      }
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Server did not become ready within 60 seconds');
}

interface FeatureCoverageResult {
  hasDisplayMath: boolean;
  hasInlineMath: boolean;
  hasCodeBlocks: boolean;
  hasTables: boolean;
  hasLinks: boolean;
  hasNestedLists: boolean;
  mathErrors: string[];
  preservedCurrency: boolean;
  preservedCodeDollars: boolean;
  linkDestinations: string[];
  tableCellCount: number;
  codeBlockLanguages: string[];
}

/**
 * Analyze DOM for feature coverage
 */
async function analyzeFeatureCoverage(page: Page): Promise<FeatureCoverageResult> {
  return await page.evaluate(() => {
    const container = document.querySelector('[data-render-container]');
    if (!container) {
      throw new Error('Render container not found');
    }

    const result = {
      hasDisplayMath: false,
      hasInlineMath: false,
      hasCodeBlocks: false,
      hasTables: false,
      hasLinks: false,
      hasNestedLists: false,
      mathErrors: [],
      preservedCurrency: false,
      preservedCodeDollars: false,
      linkDestinations: [],
      tableCellCount: 0,
      codeBlockLanguages: [],
    };

    // Check for display math (katex-display class)
    const displayMath = container.querySelectorAll('.katex-display');
    result.hasDisplayMath = displayMath.length > 0;

    // Check for inline math
    const inlineMath = container.querySelectorAll('.katex:not(.katex-display)');
    result.hasInlineMath = inlineMath.length > 0;

    // Check for KaTeX errors
    const mathErrors = container.querySelectorAll('.katex-error');
    result.mathErrors = Array.from(mathErrors).map(e => e.textContent || '').slice(0, 5);

    // Check for code blocks
    const codeBlocks = container.querySelectorAll('pre code');
    result.hasCodeBlocks = codeBlocks.length > 0;
    result.codeBlockLanguages = Array.from(codeBlocks)
      .map(block => {
        const classes = Array.from(block.classList);
        const langClass = classes.find(c => c.startsWith('language-'));
        return langClass ? langClass.replace('language-', '') : 'plain';
      })
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    // Check for tables
    const tables = container.querySelectorAll('table');
    result.hasTables = tables.length > 0;
    result.tableCellCount = container.querySelectorAll('td, th').length;

    // Check for links
    const links = container.querySelectorAll('a[href]');
    result.hasLinks = links.length > 0;
    result.linkDestinations = Array.from(links)
      .map(a => (a as HTMLAnchorElement).href)
      .filter(href => !href.startsWith('javascript:'))
      .slice(0, 10); // First 10 links

    // Check for nested lists (3+ levels)
    const nestedLists = container.querySelectorAll('ul ul ul, ol ol ol, ul ol ul, ol ul ol');
    result.hasNestedLists = nestedLists.length > 0;

    // Check for preserved currency ($5, $10, etc.) - look for literal $ in text nodes outside math
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip if inside KaTeX or code blocks
        let parent = node.parentElement;
        while (parent && parent !== container) {
          if (parent.classList.contains('katex') || 
              parent.tagName === 'CODE' || 
              parent.tagName === 'PRE') {
            return NodeFilter.FILTER_REJECT;
          }
          parent = parent.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let foundCurrency = false;
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent || '';
      if (/\$\d+/.test(text)) {
        foundCurrency = true;
        break;
      }
    }
    result.preservedCurrency = foundCurrency;

    // Check for $ in code blocks (should be preserved as literal)
    for (const block of codeBlocks) {
      if (block.textContent?.includes('$')) {
        result.preservedCodeDollars = true;
        break;
      }
    }

    return result;
  });
}

/**
 * Render a response using the real frontend LatexRenderer
 */
async function renderResponse(
  page: Page,
  modelId: string,
  response: string,
  outputPath: string
): Promise<FeatureCoverageResult> {
  // Navigate to harness with model ID and content as query params
  const encodedContent = encodeURIComponent(response);
  const url = `http://localhost:5174/?modelId=${encodeURIComponent(modelId)}&content=${encodedContent}`;
  
  // Navigate without waiting for network idle (renderer-driven readiness)
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  
  // Wait for rendering to complete via data-render-complete attribute
  await page.waitForFunction(
    () => {
      const container = document.querySelector('[data-render-container]');
      return container?.hasAttribute('data-render-complete');
    },
    { timeout: 30000 }
  );
  
  // Analyze feature coverage
  const coverage = await analyzeFeatureCoverage(page);
  
  // Take screenshot of the rendered content
  const element = await page.$('[data-render-container]');
  if (element) {
    await element.screenshot({ path: outputPath });
  }
  
  return coverage;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render-only mode: re-screenshot existing results without calling API
 */
async function renderOnlyMode(runDir: string): Promise<void> {
  console.log(`\n=== Render-Only Mode ===`);
  console.log(`Run directory: ${runDir}\n`);
  
  const fullPath = path.isAbsolute(runDir) ? runDir : path.join(__dirname, runDir);
  
  // Check if directory exists
  try {
    await fs.access(fullPath);
  } catch (error) {
    console.error(`ERROR: Directory not found: ${fullPath}`);
    process.exit(1);
  }
  
  // Find all JSON files (saved responses)
  const files = await fs.readdir(fullPath);
  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('results'));
  
  if (jsonFiles.length === 0) {
    console.error('ERROR: No saved response JSON files found in directory');
    process.exit(1);
  }
  
  console.log(`Found ${jsonFiles.length} saved responses\n`);
  
  // Start Vite server
  const viteProcess = await startViteServer();
  await waitForServer();
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results: TestResult[] = [];
  
  try {
    for (const jsonFile of jsonFiles) {
      const jsonPath = path.join(fullPath, jsonFile);
      const content = await fs.readFile(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      
      console.log(`Rendering ${data.modelName || data.modelId} - ${data.promptName}...`);
      
      // Generate screenshot path
      const screenshotPath = path.join(fullPath, jsonFile.replace('.json', '.png'));
      
      try {
        const coverage = await renderResponse(page, data.modelId, data.response, screenshotPath);
        console.log(`  ✓ Screenshot saved: ${path.basename(screenshotPath)}`);
        
        results.push({
          modelId: data.modelId,
          modelName: data.modelName,
          promptName: data.promptName,
          promptText: data.promptText || '',
          response: data.response,
          usage: data.usage,
          actualCost: data.cost || 0,
          timestamp: data.timestamp,
          featureCoverage: coverage,
        });
      } catch (error) {
        console.error(`  ✗ Error rendering: ${error}`);
      }
    }
  } finally {
    await page.close();
    await browser.close();
    
    // Stop Vite server if we started it
    if (viteProcess) {
      viteProcess.kill();
    }
  }
  
  // Regenerate review page with fresh state
  const runDate = path.basename(fullPath);
  const config: HarnessConfig = {
    dryRun: false,
    modelIds: [...new Set(results.map(r => r.modelId))],
    maxUsd: 0,
    maxTokens: 0,
    outputDir: fullPath,
    runDate,
    textModelsOnly: true,
    cumulativeCostUsd: results.reduce((sum, r) => sum + r.actualCost, 0),
  };
  
  // Save updated results manifest with fresh feature coverage
  const resultsPath = path.join(fullPath, 'results.json');
  await fs.writeFile(resultsPath, JSON.stringify({
    runDate,
    config,
    results,
    freshRendered: new Date().toISOString(),
  }, null, 2));
  
  await generateReviewPage(results, config);
  
  console.log('\n=== Render-Only Complete ===');
  console.log(`Screenshots regenerated: ${results.length}`);
  console.log(`Review page updated: ${path.join(fullPath, 'review.html')}`);
}

/**
 * Generate static HTML review page
 */
async function generateReviewPage(
  results: TestResult[],
  config: HarnessConfig
): Promise<void> {
  const reviewPath = path.join(config.outputDir, 'review.html');
  
  // Group results by model and prompt
  const byPrompt = new Map<string, TestResult[]>();
  for (const result of results) {
    if (!byPrompt.has(result.promptName)) {
      byPrompt.set(result.promptName, []);
    }
    byPrompt.get(result.promptName)!.push(result);
  }
  
  const totalCost = results.reduce((sum, r) => sum + r.actualCost, 0);
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Model Rendering QA Review</title>
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
    .feature-coverage {
      font-size: 0.85em;
      margin: 10px 0;
      padding: 8px;
      background: #f0f0f0;
      border-radius: 4px;
    }
    .feature-coverage .feature {
      display: inline-block;
      margin: 2px 4px;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .feature-coverage .feature.yes {
      background: #d4edda;
      color: #155724;
    }
    .feature-coverage .feature.no {
      background: #f8d7da;
      color: #721c24;
    }
    .feature-coverage .math-error {
      color: #d32f2f;
      font-weight: bold;
      display: block;
      margin-top: 4px;
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
    .error {
      color: red;
      background: #fee;
      padding: 10px;
      border-radius: 4px;
    }
    .meta {
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>Model Rendering QA Review</h1>
  
  <div class="summary">
    <h2>Summary</h2>
    <p><strong>Run Date:</strong> ${config.runDate}</p>
    <p><strong>Models Tested:</strong> ${config.modelIds.length}</p>
    <p><strong>Prompts:</strong> ${byPrompt.size}</p>
    <p><strong>Total Results:</strong> ${results.length}</p>
    <p><strong>Total Cost:</strong> $${totalCost.toFixed(4)}</p>
    <button class="export-btn" onclick="exportFeedback()">Export All Feedback as JSON</button>
  </div>
  
  ${Array.from(byPrompt.entries()).map(([promptName, promptResults]) => `
    <div class="prompt-section">
      <h2>${promptName}</h2>
      <div class="model-grid">
        ${promptResults.map(result => `
          <div class="model-card">
            <h4>${result.modelName}</h4>
            <div class="meta">
              Model ID: ${result.modelId}<br>
              ${result.usage ? `Tokens: ${result.usage.total_tokens || result.usage.totalTokens || '?'} (${result.usage.prompt_tokens || result.usage.promptTokens || '?'} in / ${result.usage.completion_tokens || result.usage.completionTokens || '?'} out)<br>` : ''}
              Cost: $${result.actualCost.toFixed(4)}<br>
              Time: ${new Date(result.timestamp).toLocaleString()}
            </div>
            
            ${result.error ? `
              <div class="error">Error: ${result.error}</div>
            ` : `
              <img src="${result.modelId.replace(/\//g, '_')}_${promptName}.png" 
                   class="screenshot" 
                   alt="Rendered output"
                   onerror="this.style.display='none'">
              
              ${result.featureCoverage ? `
                <div class="feature-coverage">
                  <strong>Feature Coverage:</strong>
                  <div>
                    <span class="feature ${result.featureCoverage.hasDisplayMath ? 'yes' : 'no'}">Display Math</span>
                    <span class="feature ${result.featureCoverage.hasInlineMath ? 'yes' : 'no'}">Inline Math</span>
                    <span class="feature ${result.featureCoverage.hasCodeBlocks ? 'yes' : 'no'}">Code Blocks</span>
                    <span class="feature ${result.featureCoverage.hasTables ? 'yes' : 'no'}">Tables</span>
                    <span class="feature ${result.featureCoverage.hasLinks ? 'yes' : 'no'}">Links</span>
                    <span class="feature ${result.featureCoverage.hasNestedLists ? 'yes' : 'no'}">Nested Lists</span>
                    <span class="feature ${result.featureCoverage.preservedCurrency ? 'yes' : 'no'}">Currency</span>
                    <span class="feature ${result.featureCoverage.preservedCodeDollars ? 'yes' : 'no'}">Code $</span>
                  </div>
                  ${result.featureCoverage.mathErrors && result.featureCoverage.mathErrors.length > 0 ? `
                    <span class="math-error">⚠ KaTeX Errors: ${result.featureCoverage.mathErrors.length}</span>
                  ` : ''}
                  ${result.featureCoverage.linkDestinations && result.featureCoverage.linkDestinations.length > 0 ? `
                    <div style="margin-top: 4px; font-size: 0.9em;">Links: ${result.featureCoverage.linkDestinations.slice(0, 3).join(', ')}${result.featureCoverage.linkDestinations.length > 3 ? '...' : ''}</div>
                  ` : ''}
                </div>
              ` : ''}
              
              <details>
                <summary>Raw Response</summary>
                <div class="raw-response">${escapeHtml(result.response.substring(0, 1000))}${result.response.length > 1000 ? '...' : ''}</div>
              </details>
            `}
            
            <div class="feedback">
              <label>Feedback:</label>
              <textarea 
                data-feedback-model="${result.modelId}"
                data-feedback-prompt="${promptName}"
                placeholder="Note any rendering issues, bugs, or observations..."></textarea>
            </div>
          </div>
        `).join('')}
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
      a.download = 'rendering-feedback-${config.runDate}.json';
      a.click();
    }
  </script>
</body>
</html>`;
  
  await fs.writeFile(reviewPath, html);
  console.log(`Review page generated: ${reviewPath}`);
}

/**
 * Main harness execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const renderOnly = args.includes('--render-only');
  const modelsArg = args.find(arg => arg.startsWith('--models='));
  const maxUsdArg = args.find(arg => arg.startsWith('--max-usd='));
  const maxTokensArg = args.find(arg => arg.startsWith('--max-tokens='));
  const renderDirArg = args.find(arg => arg.startsWith('--render-dir='));
  
  const maxUsd = maxUsdArg ? parseFloat(maxUsdArg.split('=')[1]) : 10.0;
  const maxTokens = maxTokensArg ? parseInt(maxTokensArg.split('=')[1]) : DEFAULT_MAX_TOKENS;
  
  console.log('=== Model Rendering QA Harness ===\n');
  
  // Handle render-only mode
  if (renderOnly) {
    const renderDir = renderDirArg ? renderDirArg.split('=')[1] : '';
    if (!renderDir) {
      console.error('ERROR: --render-only requires --render-dir=<path>');
      console.error('Example: --render-only --render-dir=runs/2026-11-04');
      process.exit(1);
    }
    
    await renderOnlyMode(renderDir);
    return;
  }
  
  // Load data
  console.log('Loading model registry...');
  const allModels = await loadModelRegistry(true); // Load text/language models only
  console.log(`Found ${allModels.length} text models in registry\n`);
  
  console.log('Loading test prompts...');
  const prompts = await loadPrompts();
  console.log(`Found ${prompts.size} test prompts\n`);
  
  // Filter models
  let selectedModels = allModels;
  if (modelsArg) {
    const requestedIds = modelsArg.split('=')[1].split(',');
    selectedModels = allModels.filter(m => requestedIds.includes(m.id));
    console.log(`Filtered to ${selectedModels.length} requested models\n`);
  }
  
  // Fetch pricing
  console.log('Fetching OpenRouter pricing...');
  const pricing = await fetchOpenRouterPricing();
  console.log(`Fetched pricing for ${pricing.size} models\n`);
  
  // Calculate estimates
  console.log('=== Cost Estimation ===');
  let totalEstimatedCost = 0;
  const modelEstimates = [];
  
  for (const model of selectedModels) {
    const modelPricing = pricing.get(model.id);
    let modelCost = 0;
    
    for (const [promptName, promptText] of prompts) {
      const promptTokens = estimateTokens(promptText);
      const cost = estimateRequestCost(
        model.id,
        promptTokens,
        maxTokens,
        modelPricing,
        model.is_thinking_model || false
      );
      modelCost += cost;
    }
    
    totalEstimatedCost += modelCost;
    modelEstimates.push({ model, cost: modelCost, hasPricing: !!modelPricing });
  }
  
  console.log(`\nModels without pricing info: ${modelEstimates.filter(e => !e.hasPricing).length}`);
  console.log(`Estimated cost per model (avg): $${(totalEstimatedCost / selectedModels.length).toFixed(4)}`);
  console.log(`Total estimated cost: $${totalEstimatedCost.toFixed(4)}`);
  console.log(`Cost cap: $${maxUsd.toFixed(2)}\n`);
  
  if (totalEstimatedCost > maxUsd) {
    console.error(`ERROR: Estimated cost ($${totalEstimatedCost.toFixed(4)}) exceeds cap ($${maxUsd.toFixed(2)})`);
    console.error('Use --max-usd to increase the cap or --models to test fewer models.');
    process.exit(1);
  }
  
  if (dryRun) {
    console.log('=== Dry Run Complete ===');
    console.log('\nTo run the harness for real, remove --dry-run flag.\n');
    
    // Print model list with estimates
    console.log('Models to test:');
    for (const { model, cost, hasPricing } of modelEstimates.sort((a, b) => b.cost - a.cost)) {
      const pricingNote = hasPricing ? '' : ' (no pricing)';
      console.log(`  ${model.id}: $${cost.toFixed(4)}${pricingNote}`);
    }
    
    return;
  }
  
  // Check for API key
  if (!OPENROUTER_API_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY environment variable not set');
    console.error('The harness cannot run without an API key.');
    console.error('Use --dry-run to see cost estimates without running.');
    process.exit(1);
  }
  
  // Run the harness
  console.log('\n=== Running Harness ===\n');
  
  const runDate = new Date().toISOString().split('T')[0];
  const outputDir = path.join(__dirname, 'runs', runDate);
  await fs.mkdir(outputDir, { recursive: true });
  
  const config: HarnessConfig = {
    dryRun: false,
    modelIds: selectedModels.map(m => m.id),
    maxUsd,
    maxTokens,
    outputDir,
    runDate,
    textModelsOnly: true,
    cumulativeCostUsd: 0,
  };
  
  // Start Vite server
  const viteProcess = await startViteServer();
  await waitForServer();
  
  const browser = await chromium.launch();
  const results: TestResult[] = [];
  let actualTotalCost = 0;
  
  // Create a single page for all renders (faster than creating new pages each time)
  const page = await browser.newPage();
  
  try {
    for (const model of selectedModels) {
      console.log(`\nTesting ${model.name} (${model.id})...`);
      
      for (const [promptName, promptText] of prompts) {
        console.log(`  Prompt: ${promptName}`);
        
        try {
          // Pre-request budget guard: Estimate cost and check against remaining budget
          const estimatedPromptTokens = estimateTokens(promptText);
          const estimatedOutputTokens = maxTokens * (model.is_thinking_model ? THINKING_MODEL_OUTPUT_MULTIPLIER : 1);
          const modelPricing = pricing.get(model.id);
          
          let estimatedRequestCost = 0;
          if (modelPricing) {
            estimatedRequestCost = 
              (estimatedPromptTokens * modelPricing.inputCostPerToken) +
              (estimatedOutputTokens * modelPricing.outputCostPerToken);
          } else {
            // Conservative fallback when pricing unavailable (assume $1 per 1M tokens)
            estimatedRequestCost = ((estimatedPromptTokens + estimatedOutputTokens) / 1_000_000);
            console.log(`    ⚠ No pricing data for ${model.id}, using conservative estimate`);
          }
          
          const remainingBudget = maxUsd - actualTotalCost;
          
          if (estimatedRequestCost > remainingBudget) {
            console.log(`    ⚠ Skipping: Estimated cost $${estimatedRequestCost.toFixed(4)} exceeds remaining budget $${remainingBudget.toFixed(4)}`);
            results.push({
              modelId: model.id,
              modelName: model.name,
              promptName,
              promptText,
              response: '',
              actualCost: 0,
              timestamp: new Date().toISOString(),
              error: `Budget guard: estimated cost $${estimatedRequestCost.toFixed(4)} > remaining $${remainingBudget.toFixed(4)}`,
            });
            continue;
          }
          
          // Call OpenRouter
          const { response, usage, cost } = await callOpenRouter(
            model.id,
            promptText,
            maxTokens,
            pricing
          );
          
          actualTotalCost += cost;
          config.cumulativeCostUsd = actualTotalCost;
          
          const totalTokens = usage?.total_tokens || (usage?.prompt_tokens + usage?.completion_tokens) || 0;
          console.log(`    ✓ Got response (${totalTokens} tokens, $${cost.toFixed(4)})`);
          
          // Save raw response
          const rawPath = path.join(outputDir, `${model.id.replace(/\//g, '_')}_${promptName}.json`);
          await fs.writeFile(rawPath, JSON.stringify({
            modelId: model.id,
            modelName: model.name,
            promptName,
            promptText,
            response,
            usage,
            cost,
            timestamp: new Date().toISOString(),
          }, null, 2));
          
          // Render screenshot and analyze coverage
          const screenshotPath = path.join(outputDir, `${model.id.replace(/\//g, '_')}_${promptName}.png`);
          const coverage = await renderResponse(page, model.id, response, screenshotPath);
          console.log(`    ✓ Rendered screenshot (coverage: ${Object.entries(coverage).filter(([k, v]) => typeof v === 'boolean' && v).length} features)`);
          
          results.push({
            modelId: model.id,
            modelName: model.name,
            promptName,
            promptText,
            response,
            usage,
            actualCost: cost,
            timestamp: new Date().toISOString(),
            featureCoverage: coverage,
          });
          
        } catch (error) {
          console.error(`    ✗ Error: ${error}`);
          results.push({
            modelId: model.id,
            modelName: model.name,
            promptName,
            promptText,
            response: '',
            actualCost: 0,
            timestamp: new Date().toISOString(),
            error: String(error),
          });
        }
        
        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } finally {
    await page.close();
    await browser.close();
    
    // Stop Vite server if we started it
    if (viteProcess) {
      viteProcess.kill();
    }
  }
  
  // Generate review page
  await generateReviewPage(results, config);
  
  // Save results summary
  const summaryPath = path.join(outputDir, 'results.json');
  await fs.writeFile(summaryPath, JSON.stringify({
    runDate,
    config,
    results,
    actualTotalCost,
    estimatedTotalCost: totalEstimatedCost,
  }, null, 2));
  
  console.log('\n=== Harness Complete ===');
  console.log(`Actual cost: $${actualTotalCost.toFixed(4)}`);
  console.log(`Estimated cost: $${totalEstimatedCost.toFixed(4)}`);
  console.log(`Difference: $${Math.abs(actualTotalCost - totalEstimatedCost).toFixed(4)}`);
  console.log(`\nResults saved to: ${outputDir}`);
  console.log(`Review page: ${path.join(outputDir, 'review.html')}`);
}

main().catch(console.error);
