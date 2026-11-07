# Model Rendering QA Harness

Automated testing framework for validating LaTeX/markdown rendering across LLM models using the CompareIntel LatexRenderer.

## Features

- **Renderer-driven readiness detection**: Waits for fonts, KaTeX, and Prism instead of networkidle
- **DOM feature coverage analysis**: Validates display math, inline math, code blocks, tables, links, nested lists, currency preservation
- **Pre-request budget guard**: Estimates cost before each API call, stops before exceeding remaining budget
- **Text-only model selection**: Filters to Language category models by default (excludes Image models)
- **Honest cost reporting**: Uses actual `usage.cost` from OpenRouter when available
- **Offline fixture testing**: Playwright tests verify coverage detection without API calls

## Usage

### Fresh Run (with API calls)

```bash
npm run harness -- --max-usd=5.00 --max-tokens=1024
```

### Rerender Existing Responses (no API calls)

```bash
npm run harness -- --render-only --render-dir=runs/2026-11-04
```

### Dry Run (cost estimation only)

```bash
npm run harness -- --dry-run --max-usd=10
```

### Test Specific Models

```bash
npm run harness -- --models=anthropic/claude-sonnet-4.6,openai/gpt-4o --max-usd=2.00
```

## Command Line Options

- `--max-usd=N`: Maximum spend cap (USD)
- `--max-tokens=N`: Max output tokens per request (default: 1024)
- `--dry-run`: Estimate costs without making API calls
- `--render-only`: Re-screenshot existing responses without API calls
- `--render-dir=PATH`: Directory containing saved responses (for `--render-only`)
- `--models=ID1,ID2`: Comma-separated list of model IDs to test

## Test Prompts

Located in `prompts/`:

1. **01-math-basics.md**: Inline/display math, matrices, cases, aligned equations, links, currency
2. **02-markdown-formatting.md**: Headers, text formatting, nested lists, tables, blockquotes
3. **03-code-blocks.md**: Syntax highlighting (Python, JavaScript, Shell), inline code
4. **04-mixed-markdown-latex.md**: Math in lists, tables with math, formatted text with math
5. **05-complex-scenarios.md**: Edge cases (math in lists/tables, horizontal rules, multiple dollar signs)
6. **06-edge-cases-boundaries.md**: Delimiter variants `$$`/`\[`, nested display math in lists, code with math-like syntax, escaped currency `\$`, raw dollar signs

## Feature Coverage

Each rendered response is analyzed for:

- **hasDisplayMath**: `$$...$$` or `\[...\]` equations
- **hasInlineMath**: `$...$` or `\(...\)` equations
- **hasCodeBlocks**: Fenced code blocks with syntax highlighting
- **hasTables**: Markdown tables
- **hasLinks**: Hyperlinks with safe destinations (filters `javascript:`)
- **hasNestedLists**: 3+ level nested lists (ul/ol)
- **preservedCurrency**: Dollar signs in plain text (not rendered as math)
- **preservedCodeDollars**: Literal `$` in code blocks
- **mathErrors**: KaTeX rendering errors (`.katex-error` elements)
- **linkDestinations**: First 10 link URLs
- **tableCellCount**: Number of table cells
- **codeBlockLanguages**: Detected code block languages

## Output

Each run creates a timestamped directory under `runs/`:

- `*.json`: Saved model responses with provenance (timestamp, usage, cost)
- `*.png`: Cropped screenshots of rendered output
- `results.json`: Fresh manifest with feature coverage and metadata
- `review.html`: Interactive review page with feature badges

## Offline Fixture Tests

Run Playwright tests without API calls:

```bash
# Start the dev server first
npm run dev

# In another terminal
npx playwright test test-with-fixtures.test.ts
```

Tests verify:
- Display and inline math detection
- Code block language detection
- Table and link detection
- Currency preservation
- KaTeX error detection
- Nested list detection

## Budget and Cost Tracking

- **Pre-request guard**: Estimates cost before each API call using token counts and pricing map
- **Conservative fallback**: When pricing unavailable, assumes $1 per 1M tokens
- **Cumulative tracking**: Updates `config.cumulativeCostUsd` after each successful request
- **Actual cost**: Uses `usage.cost` from OpenRouter when provided, falls back to estimated pricing

## CI Integration

All tests are fully offline (no API keys or real requests in CI):

```bash
npm test  # Runs Playwright fixture tests
```

## Example Cost Estimate (Nov 6, 2026 pricing)

- 83 text models × 6 prompts = 498 requests
- ~500 input tokens, 512/1024/2048 output tokens
- **Estimated total**: $3.43 (512 out) / $6.34 (1024 out) / $12.18 (2048 out)

**Note**: Always run `--dry-run` first to get current estimates before spending.

## Development

Install dependencies:

```bash
npm install
npx playwright install chromium
```

Start dev server (for local testing):

```bash
npm run dev  # Starts Vite on port 5174
```

## Architecture

- **run-harness.ts**: Main orchestrator (API calls, screenshot capture, cost tracking)
- **harness-app.tsx**: Minimal React wrapper around `LatexRenderer`
- **vite.config.ts**: Dev server with frontend source alias
- **test-with-fixtures.test.ts**: Playwright offline tests

## Troubleshooting

### Vite 500 errors

Ensure frontend dependencies are installed:

```bash
cd ../frontend && npm install
```

### Playwright browser not found

```bash
npx playwright install chromium
```

### Budget guard false positives

Check pricing freshness:

```bash
npm run harness -- --dry-run  # Shows current pricing
```

## Known Limitations

- **Currency detection**: Simple text search (may over-report if math contains `$\d+`)
- **Link safety**: Only filters `javascript:` schemes (not comprehensive XSS check)
- **Readiness detection**: 1.5s timeout (LatexRenderer is mostly synchronous)

## Future Improvements

- Add DOM assertion pass/fail (requested feature = must be present)
- Expand prompts for aligned equations, display math in nested lists
- Add before/after screenshot crops for regression testing
- Support for streaming responses
- Parallel rendering for faster reruns
