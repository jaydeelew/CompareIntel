# Model Rendering QA Harness

A testing harness for evaluating model-specific rendering configurations in CompareIntel. Tests how different LLM models format their responses (LaTeX, Markdown, code blocks) and renders them using the site's real `LatexRenderer` component.

## Overview

This harness:
1. Sends predefined test prompts to selected models via OpenRouter
2. Renders each response using the actual frontend `LatexRenderer` component
3. Captures screenshots via Playwright
4. Generates an interactive HTML review page for visual QA

## Prerequisites

- Node.js 18+ and npm
- `OPENROUTER_API_KEY` environment variable set
- CompareIntel frontend dependencies installed (`cd ../frontend && npm install`)

## Installation

```bash
cd rendering-harness
npm install
```

## Usage

### Dry Run (Cost Estimation)

Estimate cost without actually running:

```bash
npm run harness -- --dry-run
```

This shows:
- Total estimated cost for all registry models
- Per-model cost breakdown
- Models missing pricing data

### Run on Selected Models

Test a few models (e.g., for PR validation):

```bash
export OPENROUTER_API_KEY="your-key-here"
npm run harness -- --models=openai/gpt-4o,anthropic/claude-sonnet-4.6,google/gemini-2.5-flash,deepseek/deepseek-v4-pro --max-usd=5.0
```

### Re-render Existing Results

Re-screenshot saved responses without calling the API:

```bash
npm run harness -- --render-only --render-dir=runs/2026-11-04
```

This is useful for:
- Testing renderer changes without re-running expensive API calls
- Fixing screenshot issues (e.g., fonts, Prism themes)
- Regenerating the review page after manual edits

### Run on All Models

Test all models in the registry:

```bash
export OPENROUTER_API_KEY="your-key-here"
npm run harness -- --max-usd=50.0
```

### Options

- `--dry-run`: Show cost estimates without running (no API key needed)
- `--models=<ids>`: Comma-separated list of model IDs to test
- `--max-usd=<amount>`: Maximum allowed cost (default: 10.0)
- `--max-tokens=<n>`: Max output tokens per request (default: 2048)
- `--render-only`: Re-screenshot existing results without API calls
- `--render-dir=<path>`: Directory containing saved JSON responses (required with --render-only)

## Test Prompts

The harness includes 5 test prompts under `prompts/`:

1. **math-basics**: Inline/display math, matrices, equations, money ($5 + $10)
2. **markdown-formatting**: Headers, bold/italic, nested lists, tables, blockquotes
3. **code-blocks**: Python, JavaScript, inline code with math-like content
4. **mixed-markdown-latex**: Combined markdown formatting with math expressions
5. **complex-scenarios**: Edge cases (math in lists/tables, horizontal rules, etc.)

## Output

Results are saved to `runs/<date>/`:

- `<model>_<prompt>.png`: Screenshot of rendered output
- `<model>_<prompt>.json`: Raw response + metadata (usage, cost)
- `review.html`: Interactive review page with feedback textareas
- `results.json`: Full run summary (config, all results, costs)

## Review Workflow

1. Run the harness
2. Open `runs/<date>/review.html` in a browser
3. Review each model × prompt combination visually
4. Note rendering issues in the feedback textareas
5. Click "Export All Feedback as JSON" to save observations

## Cost Management

- Pricing is fetched from OpenRouter's public `/api/v1/models` endpoint
- Thinking models (e.g., o3, deepseek-v4-pro) use 3x output token multiplier
- The script refuses to run if estimated cost exceeds `--max-usd`
- Use `--dry-run` to see estimates before spending

## Architecture

- **run-harness.ts**: Main script (OpenRouter calls, Vite server management, Playwright screenshots)
- **harness-app.tsx**: Vite React app that wraps `LatexRenderer`
- **vite.config.ts**: Vite config (aliases `@` to `frontend/src`)
- **playwright.config.ts**: Playwright config (starts Vite only, no Python backend)

The harness uses the **real** `LatexRenderer` component from `frontend/src/components/LatexRenderer.tsx` with model-specific configs from `frontend/src/config/model_renderer_configs.json`, ensuring screenshots reflect actual production rendering.

### Vite Server Management

The harness automatically:
1. Checks if Vite dev server is already running on port 5174
2. Starts the server if not running
3. Waits for server to be ready (HTTP 200 response)
4. Shuts down server after run completes (only if it started it)

This allows multiple runs without manual server management.

## Known Issues

- **z-ai/glm-5**: In registry but has no renderer config (will use default)
- **google/gemini-2.0-flash**: Has renderer config but not in registry (not tested)

These are noted but not fixed in this PR (by design).

## Troubleshooting

### "OPENROUTER_API_KEY environment variable not set"

Set your API key:

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

### "Estimated cost exceeds cap"

Either:
- Increase cap: `--max-usd=20.0`
- Test fewer models: `--models=model1,model2`
- Reduce output: `--max-tokens=1024`

### Vite server fails to start

Make sure frontend dependencies are installed:

```bash
cd ../frontend && npm install
```

### Screenshots are blank

The harness waits for `data-render-complete` attribute. Check:
1. `harness-app.tsx` calls `initializeRegistry()`
2. Fonts are loaded (`document.fonts.ready`)
3. Prism highlighting completes (1s timeout)

## Development

To manually test the harness renderer:

```bash
npm run dev
# Open http://localhost:5174/?modelId=openai/gpt-4o&content=Hello%20%24x%5E2%24
```

The harness page will render the content with the specified model's config.
