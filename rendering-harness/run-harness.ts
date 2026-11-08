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
import { validateRenderedHTML, type ValidationResult } from './dom-assertions.js';
import {
  estimateRequestCost,
  estimateTokens,
  preRequestBudgetDecision,
  resolveActualCost,
} from './budget-guard.js';
import { droppedNameExpectations, getExpectedFeatures } from './expected-features.js';
import {
  isTruncatedReply,
  isEmptyVisibleReply,
  overallStatus,
  uniqueCoverageRecords,
  type OverallStatus,
} from './overall-status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MAX_TOKENS = 2048;

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
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number; // Actual cost from OpenRouter usage.cost if available
  };
  actualCost: number;
  timestamp: string;
  error?: string;
  featureCoverage?: FeatureCoverageResult;
  validation?: ValidationResult;
  validationStatus?: OverallStatus;
  truncated?: boolean;
  emptyVisible?: boolean;
  finishReason?: string | null;
  nativeFinishReason?: string | null;
  attempt?: string;
  screenshotRelpath?: string;
  sourceFile?: string;
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
  
  const cost = resolveActualCost(usage, pricing.get(modelId), modelId);
  return { response: content, usage, cost };
}

interface ViteHandle {
  process: ChildProcess
  pid: number
}

let ownedVite: ViteHandle | null = null
let viteCleaned = false

function stopOwnedVite(): void {
  if (viteCleaned) return
  viteCleaned = true
  const handle = ownedVite
  ownedVite = null
  if (!handle?.pid) return
  try {
    process.kill(-handle.pid, 'SIGTERM')
  } catch {
    try {
      handle.process.kill('SIGTERM')
    } catch {
      /* already gone */
    }
  }
}

async function waitForServer(maxAttempts = 60): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://127.0.0.1:5174/')
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Server did not become ready within 15 seconds')
}

/**
 * Start Vite as its own process group so SIGTERM/timeout on the harness
 * can kill the actual vite binary (npm-spawned grandchildren were surviving
 * as PID-1 orphans, then getting reused and later killed mid-run).
 */
async function startViteServer(): Promise<ViteHandle | null> {
  try {
    const response = await fetch('http://127.0.0.1:5174/')
    if (response.ok) {
      console.log('✓ Vite already listening on 5174 (not owned by this process; will not kill it)')
      return null
    }
  } catch {
    /* start our own */
  }

  const viteBin = path.join(__dirname, 'node_modules', '.bin', 'vite')
  console.log('Starting Vite dev server...')
  const child = spawn(viteBin, ['--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env },
  })

  if (child.pid == null) {
    throw new Error('Failed to spawn Vite (no pid)')
  }

  const handle: ViteHandle = { process: child, pid: child.pid }
  ownedVite = handle
  viteCleaned = false

  let output = ''
  const onOut = (buf: Buffer) => {
    output += buf.toString()
  }
  child.stdout?.on('data', onOut)
  child.stderr?.on('data', onOut)
  child.on('exit', (code, signal) => {
    if (!viteCleaned) {
      console.error(`Vite exited unexpectedly (code=${code}, signal=${signal})`)
    }
  })

  try {
    await waitForServer(80)
    console.log(`✓ Vite dev server started on port 5174 (pid ${child.pid})`)
    return handle
  } catch (err) {
    stopOwnedVite()
    throw new Error(`Vite failed to start: ${err}\n--- vite output ---\n${output.slice(-2000)}`)
  }
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
async function analyzeFeatureCoverage(
  page: Page
): Promise<{ coverage: FeatureCoverageResult; renderedHTML: string }> {
  return await page.evaluate(() => {
    const container = document.querySelector('[data-render-container]');
    if (!container) {
      throw new Error('Render container not found');
    }

    const result: {
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
    } = {
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

    // Check for preserved currency ($5, $10, etc.) - simple text check
    const allText = container.textContent || '';
    result.preservedCurrency = /\$\d+/.test(allText);

    // Check for $ in code blocks (should be preserved as literal)
    for (const block of codeBlocks) {
      if (block.textContent?.includes('$')) {
        result.preservedCodeDollars = true;
        break;
      }
    }

    // Get the actual rendered HTML for validation
    const renderedHTML = container.innerHTML;

    return { coverage: result, renderedHTML };
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
): Promise<{ coverage: FeatureCoverageResult; renderedHTML: string }> {
  // Navigate to harness with model ID and content as query params
  const encodedContent = encodeURIComponent(response);
  const url = `http://127.0.0.1:5174/?modelId=${encodeURIComponent(modelId)}&content=${encodedContent}`;

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(
    () => {
      const failed = document.querySelector('[data-render-failed]');
      const complete = document.querySelector('[data-render-complete]');
      return !!(failed || complete);
    },
    { timeout: 30000 }
  );

  const failReason = await page.evaluate(() => {
    const el = document.querySelector('[data-render-failed]');
    return el?.getAttribute('data-render-failed') || null;
  });

  const element = await page.$('[data-render-container]');
  if (element) {
    await element.screenshot({ path: outputPath });
  }

  if (failReason) {
    throw new Error(`Render readiness failed: ${failReason}`);
  }

  const result = await analyzeFeatureCoverage(page);

  return result;
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
async function renderOnlyMode(runDir: string, mergeInto?: string): Promise<void> {
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
  const skipJson = new Set([
    'summary.json',
    'manifest.json',
    'catalog.json',
    'prompts.json',
    'coverage.json',
    'unique-coverage.json',
    'next-batch-preflight.json',
  ]);
  const jsonFiles = files.filter(
    f =>
      f.endsWith('.json') &&
      !f.startsWith('results') &&
      !f.startsWith('unique-') &&
      !skipJson.has(f)
  );
  
  if (jsonFiles.length === 0) {
    console.error('ERROR: No saved response JSON files found in directory');
    process.exit(1);
  }
  
  console.log(`Found ${jsonFiles.length} saved responses\n`);
  
  await startViteServer();
  await waitForServer();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results: TestResult[] = [];

  try {
    for (const jsonFile of jsonFiles) {
      const jsonPath = path.join(fullPath, jsonFile);
      const content = await fs.readFile(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      if (!data.modelId || typeof data.response !== 'string' || !data.promptName) {
        console.log(`Skipping non-reply JSON: ${jsonFile}`);
        continue;
      }

      console.log(`Rendering ${data.modelName || data.modelId} - ${data.promptName}...`);

      const screenshotPath = path.join(fullPath, jsonFile.replace('.json', '.png'));
      const truncated = isTruncatedReply(data);
      const emptyVisible = isEmptyVisibleReply(data.response);

      if (emptyVisible) {
        const status = overallStatus({ truncated, emptyVisible: true });
        console.log(
          `  △ Validation: ${status.toUpperCase()} (empty visible text; reasoning-only / truncated, not pass, not renderer-fail)`
        );
        results.push({
          modelId: data.modelId,
          modelName: data.modelName,
          promptName: data.promptName,
          promptText: data.promptText || '',
          response: data.response,
          usage: data.usage,
          actualCost: data.cost || data.actualCost || 0,
          timestamp: data.timestamp,
          validationStatus: status,
          truncated,
          emptyVisible: true,
          finishReason: data.finishReason ?? null,
          nativeFinishReason: data.nativeFinishReason ?? null,
          attempt: data.attempt || 'original',
          sourceFile: jsonFile,
        });
        continue;
      }

      try {
        const { coverage, renderedHTML } = await renderResponse(
          page,
          data.modelId,
          data.response,
          screenshotPath
        );
        console.log(`  ✓ Screenshot saved: ${path.basename(screenshotPath)}`);

        const expectedFeatures = getExpectedFeatures(data.promptName, data.promptText);
        const dropped = droppedNameExpectations(data.promptName, data.promptText);
        if (dropped.length > 0) {
          console.log(
            `  · Provenance: saved promptText dropped name-defaults [${dropped.join(', ')}]`
          );
        }
        const validation = validateRenderedHTML(
          renderedHTML,
          expectedFeatures,
          data.response
        );
        const status = overallStatus({ truncated, emptyVisible, validation });
        const failedCount = validation.assertions.filter(a => a.status === 'fail').length;
        const notCoveredCount = validation.assertions.filter(a => a.status === 'not-covered').length;
        const mark =
          status === 'pass' ? '✓' : status === 'not-covered' ? '○' : status === 'fail' ? '✗' : '△';
        console.log(
          `  ${mark} Validation: ${status.toUpperCase()}` +
            (emptyVisible ? ' (empty visible, incomplete)' : truncated ? ' (incomplete finishReason, not comprehensive)' : '') +
            (failedCount ? ` (${failedCount} DOM fail assertions)` : '') +
            (notCoveredCount ? ` (${notCoveredCount} not-covered)` : '')
        );

        results.push({
          modelId: data.modelId,
          modelName: data.modelName,
          promptName: data.promptName,
          promptText: data.promptText || '',
          response: data.response,
          usage: data.usage,
          actualCost: data.cost || data.actualCost || 0,
          timestamp: data.timestamp,
          featureCoverage: coverage,
          validation,
          validationStatus: status,
          truncated,
          emptyVisible,
          finishReason: data.finishReason ?? null,
          nativeFinishReason: data.nativeFinishReason ?? null,
          attempt: data.attempt || 'original',
          screenshotRelpath: path.basename(screenshotPath),
          sourceFile: jsonFile,
        });
      } catch (error) {
        console.error(`  ✗ Error rendering: ${error}`);
        const screenshotRelpath = jsonFile.replace('.json', '.png');
        // Truncated / empty replies that time out of Prism (unclosed fence) are
        // incomplete coverage, not renderer-loss. Keep finishReason so unique
        // coverage can overlay a complete rerun.
        const status = overallStatus({
          truncated,
          emptyVisible,
          error: truncated || emptyVisible ? undefined : String(error),
        });
        console.log(
          `  △ Validation: ${status.toUpperCase()}` +
            (truncated || emptyVisible
              ? ' (screenshot/readiness error on incomplete source, not renderer-fail)'
              : '')
        );
        results.push({
          modelId: data.modelId,
          modelName: data.modelName,
          promptName: data.promptName,
          promptText: data.promptText || '',
          response: data.response || '',
          usage: data.usage,
          actualCost: data.cost || data.actualCost || 0,
          timestamp: data.timestamp || new Date().toISOString(),
          error: String(error),
          validationStatus: status,
          truncated,
          emptyVisible,
          finishReason: data.finishReason ?? null,
          nativeFinishReason: data.nativeFinishReason ?? null,
          attempt: data.attempt || 'original',
          screenshotRelpath,
          sourceFile: jsonFile,
        });
      }
    }
  } finally {
    await page.close();
    await browser.close();
    stopOwnedVite();
  }
  
  let published = results;
  let publishDir = fullPath;
  if (mergeInto) {
    const parentDir = path.isAbsolute(mergeInto) ? mergeInto : path.join(__dirname, mergeInto);
    const parentResultsPath = path.join(parentDir, 'results.json');
    const parentRaw = JSON.parse(await fs.readFile(parentResultsPath, 'utf-8')) as {
      results?: TestResult[];
    };
    const parentResults = (parentRaw.results || []).map(record => ({
      ...record,
      attempt: record.attempt || 'original',
      screenshotRelpath:
        record.screenshotRelpath ||
        `${record.modelId.replace(/\//g, '_')}_${record.promptName}.png`,
    }));
    const mergedNew = results.map(record => ({
      ...record,
      screenshotRelpath: path.posix.join(
        path.basename(fullPath),
        record.screenshotRelpath || path.basename(record.sourceFile || '').replace(/\.json$/, '.png')
      ),
    }));
    published = [...parentResults, ...mergedNew];
    publishDir = parentDir;
  }

  const unique = uniqueCoverageRecords(published);
  const runDate = path.basename(publishDir);
  const config: HarnessConfig = {
    dryRun: false,
    modelIds: [...new Set(published.map(r => r.modelId))],
    maxUsd: 0,
    maxTokens: 0,
    outputDir: publishDir,
    runDate,
    textModelsOnly: true,
    cumulativeCostUsd: published.reduce((sum, r) => sum + r.actualCost, 0),
  };

  await fs.writeFile(
    path.join(publishDir, 'results.json'),
    JSON.stringify(
      {
        runDate,
        config,
        results: published,
        uniqueCoverage: unique.map(r => ({
          modelId: r.modelId,
          promptName: r.promptName,
          validationStatus: resultStatus(r),
          truncated: r.truncated,
          finishReason: r.finishReason,
          attempt: r.attempt,
          sourceFile: r.sourceFile,
          screenshotRelpath: r.screenshotRelpath,
          actualCost: r.actualCost,
        })),
        historyRecords: published.length,
        uniqueCells: unique.length,
        freshRendered: new Date().toISOString(),
      },
      null,
      2
    )
  );

  await generateReviewPage(published, config, unique);

  console.log('\n=== Render-Only Complete ===');
  console.log(`Screenshots regenerated this pass: ${results.length}`);
  console.log(`History records: ${published.length}`);
  console.log(`Unique coverage cells: ${unique.length}`);
  console.log(`Review page updated: ${path.join(publishDir, 'review.html')}`);

  console.log('\nHistory (all API records):');
  reportValidationSummary(published);
  console.log('Unique coverage (complete attempt replaces truncated provenance):');
  reportValidationSummary(unique);
  exitIfValidationFailed(unique);
}

function resultStatus(r: TestResult): OverallStatus {
  return overallStatus({
    truncated: Boolean(r.truncated) || isTruncatedReply(r),
    emptyVisible: Boolean(r.emptyVisible) || isEmptyVisibleReply(r.response),
    error: r.error,
    validation: r.validation,
  })
}

function reportValidationSummary(results: TestResult[]): void {
  const passed = results.filter(r => resultStatus(r) === 'pass').length
  const notCovered = results.filter(r => resultStatus(r) === 'not-covered').length
  const truncated = results.filter(r => resultStatus(r) === 'truncated').length
  const incomplete = results.filter(r => resultStatus(r) === 'incomplete').length
  const failed = results.filter(r => resultStatus(r) === 'fail').length
  console.log(`\nValidation Summary:`)
  console.log(`  ✓ Passed: ${passed}`)
  console.log(`  ○ Not covered (source missing feature): ${notCovered}`)
  console.log(`  △ Truncated (non-empty, finish length): ${truncated}`)
  console.log(`  △ Incomplete (empty visible / reasoning-only): ${incomplete}`)
  console.log(`  ✗ Failed (renderer loss / error): ${failed}\n`)
}

function exitIfValidationFailed(results: TestResult[]): void {
  const failed = results.filter(r => resultStatus(r) === 'fail')
  if (failed.length > 0) {
    console.error(`Harness failed with ${failed.length} renderer-loss or render errors`)
    process.exit(1)
  }
}

/**
 * Generate static HTML review page
 */
async function generateReviewPage(
  results: TestResult[],
  config: HarnessConfig,
  unique: TestResult[] = uniqueCoverageRecords(results)
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
    .status {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      vertical-align: middle;
      text-transform: uppercase;
    }
    .status-pass { background: #d4edda; color: #155724; }
    .status-not-covered { background: #fff3cd; color: #856404; }
    .status-truncated { background: #e7e3ff; color: #3d348b; }
    .status-incomplete { background: #ede7f6; color: #4a148c; }
    .status-fail { background: #f8d7da; color: #721c24; }
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
    <p><strong>API history records:</strong> ${results.length}
       &nbsp;<strong>Unique coverage cells:</strong> ${unique.length}</p>
    <p><strong>History:</strong>
       Passed ${results.filter(r => resultStatus(r) === 'pass').length}
       / Not covered ${results.filter(r => resultStatus(r) === 'not-covered').length}
       / Truncated ${results.filter(r => resultStatus(r) === 'truncated').length}
       / Incomplete ${results.filter(r => resultStatus(r) === 'incomplete').length}
       / Failed ${results.filter(r => resultStatus(r) === 'fail').length}</p>
    <p><strong>Unique coverage:</strong>
       Passed ${unique.filter(r => resultStatus(r) === 'pass').length}
       / Not covered ${unique.filter(r => resultStatus(r) === 'not-covered').length}
       / Truncated ${unique.filter(r => resultStatus(r) === 'truncated').length}
       / Incomplete ${unique.filter(r => resultStatus(r) === 'incomplete').length}
       / Failed ${unique.filter(r => resultStatus(r) === 'fail').length}
       (complete attempts replace truncated/empty provenance; originals stay in history; incomplete cells are not concluded)</p>
    <p><strong>Cumulative actual cost (all records):</strong> $${totalCost.toFixed(6)}</p>
    <button class="export-btn" onclick="exportFeedback()">Export All Feedback as JSON</button>
  </div>
  
  ${Array.from(byPrompt.entries()).map(([promptName, promptResults]) => `
    <div class="prompt-section">
      <h2>${promptName}</h2>
      <div class="model-grid">
        ${promptResults.map(result => `
          <div class="model-card">
            <h4>${result.modelName} <span class="status status-${resultStatus(result)}">${resultStatus(result)}</span>${result.attempt && result.attempt !== 'original' ? ` <span class="status status-not-covered">${escapeHtml(result.attempt)}</span>` : ''}</h4>
            <div class="meta">
              Model ID: ${result.modelId}<br>
              Attempt: ${escapeHtml(result.attempt || 'original')}${result.sourceFile ? ` · ${escapeHtml(result.sourceFile)}` : ''}<br>
              ${result.usage ? `Tokens: ${result.usage.total_tokens || result.usage.totalTokens || '?'} (${result.usage.prompt_tokens || result.usage.promptTokens || '?'} in / ${result.usage.completion_tokens || result.usage.completionTokens || '?'} out)<br>` : ''}
              Cost: $${result.actualCost.toFixed(6)}<br>
              Finish: ${escapeHtml(String(result.finishReason || 'unknown'))}${result.nativeFinishReason ? ` / ${escapeHtml(String(result.nativeFinishReason))}` : ''}${result.emptyVisible ? ' — empty visible (reasoning-only), incomplete' : result.truncated ? ' — truncated, not comprehensive' : ''}<br>
              Time: ${new Date(result.timestamp).toLocaleString()}
            </div>
            
            ${result.error ? `
              <div class="error">Error: ${result.error}</div>
            ` : result.emptyVisible ? `
              <div class="error">No visible assistant text (completion tokens were reasoning-only or truncated before content). Incomplete — not a renderer failure.</div>
            ` : `
              <img src="${escapeHtml(result.screenshotRelpath || `${result.modelId.replace(/\//g, '_')}_${promptName}.png`)}" 
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
  const mergeIntoArg = args.find(arg => arg.startsWith('--merge-into='));
  
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
    
    await renderOnlyMode(renderDir, mergeIntoArg ? mergeIntoArg.split('=')[1] : undefined);
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
    let hasNoPricing = false;
    
    for (const [promptName, promptText] of prompts) {
      const promptTokens = estimateTokens(promptText);
      const cost = estimateRequestCost(
        promptTokens,
        maxTokens,
        modelPricing,
        model.is_thinking_model || false
      );
      if (cost === null) {
        hasNoPricing = true;
        break;
      }
      modelCost += cost;
    }
    
    if (!hasNoPricing) {
      totalEstimatedCost += modelCost;
    }
    modelEstimates.push({ model, cost: modelCost, hasPricing: !!modelPricing });
  }
  
  const unpricedModels = modelEstimates.filter(e => !e.hasPricing);
  const pricedModels = modelEstimates.filter(e => e.hasPricing);
  
  console.log(`\n=== Pricing Summary ===`);
  console.log(`Models with pricing: ${pricedModels.length}/${selectedModels.length}`);
  console.log(`Models WITHOUT pricing: ${unpricedModels.length}/${selectedModels.length}`);
  
  if (unpricedModels.length > 0) {
    console.log(`\n⚠️  UNKNOWN PRICING (will be REFUSED):`);
    unpricedModels.forEach(e => console.log(`   - ${e.model.id}`));
  }
  
  if (pricedModels.length > 0) {
    console.log(`\nEstimated cost (${pricedModels.length} priced models only):`);
    console.log(`  Per model (avg): $${(totalEstimatedCost / pricedModels.length).toFixed(4)}`);
    console.log(`  Total: $${totalEstimatedCost.toFixed(4)}`);
    console.log(`  Cost cap: $${maxUsd.toFixed(2)}\n`);
  } else {
    console.log(`\n⚠️  No models have pricing data - all requests will be refused.\n`);
  }
  
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
  
  await startViteServer();
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
          const decision = preRequestBudgetDecision({
            pricing: pricing.get(model.id),
            modelId: model.id,
            promptTokens: estimateTokens(promptText),
            maxTokens,
            isThinkingModel: model.is_thinking_model || false,
            maxUsd,
            spentUsd: actualTotalCost,
          });
          if (decision.action === 'refuse') {
            console.log(`    ⚠ Skipping: ${decision.reason}`);
            results.push({
              modelId: model.id,
              modelName: model.name,
              promptName,
              promptText,
              response: '',
              actualCost: 0,
              timestamp: new Date().toISOString(),
              error: decision.reason,
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
          const { coverage, renderedHTML } = await renderResponse(page, model.id, response, screenshotPath);
          console.log(`    ✓ Rendered screenshot (coverage: ${Object.entries(coverage).filter(([k, v]) => typeof v === 'boolean' && v).length} features)`);
          
          // Validate RENDERED HTML against expected features
          const expectedFeatures = getExpectedFeatures(promptName, promptText);
          const dropped = droppedNameExpectations(promptName, promptText);
          if (dropped.length > 0) {
            console.log(
              `    · Provenance: promptText dropped name-defaults [${dropped.join(', ')}]`
            );
          }
          const validation = validateRenderedHTML(renderedHTML, expectedFeatures, response);
          const failedCount = validation.assertions.filter(a => a.status === 'fail').length;
          const notCoveredCount = validation.assertions.filter(a => a.status === 'not-covered').length;
          const mark =
            validation.status === 'pass' ? '✓' : validation.status === 'not-covered' ? '○' : '✗';
          console.log(
            `    ${mark} Validation: ${validation.status.toUpperCase()}` +
              (failedCount ? ` (${failedCount} renderer-loss)` : '') +
              (notCoveredCount ? ` (${notCoveredCount} not-covered)` : '')
          );

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
            validation,
            validationStatus: validation.status,
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
    
    stopOwnedVite();
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
  
  reportValidationSummary(results);
  exitIfValidationFailed(results);
}

process.once('SIGTERM', () => {
  stopOwnedVite();
  process.exit(143);
});
process.once('SIGINT', () => {
  stopOwnedVite();
  process.exit(130);
});

main().catch(err => {
  console.error(err);
  stopOwnedVite();
  process.exit(1);
});
