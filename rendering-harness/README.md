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
- `results.json`: Manifest with per-reply `validation.status` (`pass` | `not-covered` | `fail`)
- `review.html`: Review page; screenshot `src` is a relative filename next to the HTML

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

Logic is in `budget-guard.ts` (imported by the runner and by tests):

- **Pre-request guard**: `SharedCostGuard.reserve` + `gate` (dry-run and live use the same formula)
- **Unknown pricing**: refused (no $1/1M fallback)
- **Actual cost**: `usage.cost` only. Missing cost is persisted as unknown (`actualCost`/`resolution` null) and fail-closes later paid calls. Not guessed from catalog tokens, not treated as $0.
- **Thinking / reasoning**: completion cap includes visible + reasoning once, plus 25% margin. Not a blind 3× multiplier.
- **Durable state**: `guard-global-state.json` is global (not per-batch). Interrupted pending POSTs and historical unknowns block every batch until explicit resolution/approval.

See `BUDGET_GUARD_AUDIT.md` for limits (not a provider hard cap).

## CI Integration

All tests are fully offline (no API keys or real requests in CI):

```bash
npm test  # Runs Playwright fixture tests
```

## Example Cost Estimate

Nov 6 scenario (not a cap): $3.43 / $6.34 / $12.18 at 512 / 1024 / 2048 out.

Nov 8 public catalog refresh used a 3× thinking contingency that is **not** the live billing policy. Live/dry-run now reserve completion cap once + 25%.

**Note**: Always run `--dry-run` first. Do not treat either scenario as an approved spend cap.

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
- **harness-app.tsx**: Wraps `LatexRenderer` in the production results DOM (`results-section` / `results-grid` / `result-card` / `message-content`) and imports `variables.css`, `base.css`, and `results.css` (no copied table styles)
- **expected-features.ts**: Prompt-name defaults intersected with saved `promptText` so old replies are not scored against later prompt files
- **vite.config.ts**: Dev server with frontend source alias
- **test-with-fixtures.test.ts**: Playwright offline tests
- **production-styling.test.ts**: Desktop 1280×800 and mobile 390×844 computed-style fixtures for table padding/borders/overflow

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
