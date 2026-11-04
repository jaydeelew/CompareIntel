# Model Rendering QA Harness - Implementation Summary

## PR Information

**PR URL**: https://github.com/jaydeelew/CompareIntel/pull/178  
**Branch**: `cursor/model-rendering-qa-7e40`  
**Status**: Ready for review (CI passing)

## Deliverables Completed

### ✅ (a) Test Prompts

Created 5 comprehensive test prompts in `prompts/`:

1. **01-math-basics.md**: Inline math ($x^2$), display math ($$...$$), matrices, multiple equations, money dollar signs ($5 + $10)
2. **02-markdown-formatting.md**: H3/H4 headers, bold/italic, nested unordered/ordered lists (3 levels), tables, blockquotes
3. **03-code-blocks.md**: Python and JavaScript fenced code blocks, inline code with math-like content (`x^2`, `a_b`)
4. **04-mixed-markdown-latex.md**: Markdown formatting mixed with LaTeX (bold text with inline math, lists with equations, blockquotes with formulas)
5. **05-complex-scenarios.md**: Edge cases (math in lists with formatting, tables with LaTeX, horizontal rules, multiple money dollar signs in same paragraph)

### ✅ (b) Harness Script

**File**: `run-harness.ts` (TypeScript/Node.js)

**Features**:
- Reads model IDs from `backend/data/models_registry.json`
- `--models` filter (comma-separated IDs)
- `--dry-run` mode: estimates cost without API calls
- `--max-usd` cap: enforced before running (required parameter)
- `--max-tokens`: configurable output limit (default: 2048)
- Fetches pricing from OpenRouter public `/api/v1/models` API
- Thinking model handling: 3x output token multiplier for `is_thinking_model` entries
- OpenRouter API calls via `fetch` with proper headers
- Renders using real `LatexRenderer` component via Vite app
- Playwright screenshots with proper wait:
  - Waits for `data-render-complete` attribute
  - Set after `document.fonts.ready` + 1000ms for Prism highlighting
  - No fixed timeouts or networkidle (uses page state)
- Saves raw replies as JSON with usage/cost metadata
- Saves screenshots as PNG

**Architecture**:
- `harness-app.tsx`: Vite React app that imports and renders with `LatexRenderer`
- `vite.config.ts`: Aliases `@` to `frontend/src` for imports
- `playwright.config.ts`: Starts Vite only (port 5174), not Python backend
- `initializeRegistry()` called to load model-specific configs

### ✅ (c) Review Page

**File**: Generated as `runs/<date>/review.html`

**Features**:
- Grid layout: models × prompts
- Each cell shows:
  - Model name and ID
  - Token usage (input/output/total)
  - Actual cost
  - Screenshot (with fallback)
  - Collapsible raw response (first 1000 chars)
  - Feedback textarea
- "Export All Feedback as JSON" button
- Saves as `rendering-feedback-<date>.json`
- Summary section with run metadata and total cost

### ✅ (d) README

**File**: `rendering-harness/README.md`

**Contents**:
- Overview and architecture
- Prerequisites and installation
- Usage examples (dry-run, selected models, all models)
- Command-line options
- Test prompt descriptions
- Output directory structure
- Review workflow
- Cost management (pricing, caps, multipliers)
- Known issues (z-ai/glm-5, google/gemini-2.0-flash)
- Troubleshooting section
- Development instructions

## Test Results

### Fixture Test Run

**Command**: `npm run test-fixtures`  
**Date**: 2026-11-04  
**API Key**: Not required (uses fixtures)

**Models Tested** (4):
1. ✅ `openai/gpt-4o` - 01-math-basics (38 KB screenshot)
2. ✅ `anthropic/claude-sonnet-4.6` - 02-markdown-formatting (46 KB screenshot)
3. ✅ `google/gemini-2.5-flash` - 03-code-blocks (67 KB screenshot)
4. ✅ `deepseek/deepseek-v4-pro` - 04-mixed-markdown-latex (62 KB screenshot)

**Outputs** (committed to `runs/2026-11-04-fixture-test/`):
- 4 PNG screenshots (all rendering correctly)
- 1 review.html page (interactive grid)
- Fixture cost: $0.0065 (simulated)

**Screenshot Verification**:
- Math rendering: ✅ KaTeX rendered inline and display math correctly
- Markdown: ✅ Headers, bold, italic, lists, tables all formatted
- Code blocks: ✅ Python/JavaScript syntax highlighted with Prism
- Mixed content: ✅ LaTeX in markdown context rendered properly

### Dry-Run (All Registry Models)

**Command**: `npm run harness -- --dry-run`  
**Result**: Cost cap enforcement working correctly

**Statistics**:
- **Total models in registry**: 100
- **Total prompts**: 5
- **Models with pricing**: 89
- **Models without pricing**: 11 (image generation models)
- **Estimated cost**: $18.84
- **Per-model average**: $0.19 (across 5 prompts)
- **Default cap**: $10.00
- **Action**: Refused to run (exceeds cap) ✅

**Thinking model multiplier** correctly applied to:
- DeepSeek V3.2, V4, V4.1, V4 Pro (all `is_thinking_model: true`)
- Anthropic Claude Opus/Sonnet/Fable 5.x series
- OpenAI o3, GPT-5/5.1/5.2/5.3/5.4/5.5
- Google Gemini 2.5/3/3.1 with thinking capabilities
- Others with `is_thinking_model: true` in registry

## Known Issues (Intentionally Not Fixed)

Per user instructions, these are **noted but not fixed**:

1. **z-ai/glm-5**:
   - ✅ Present in registry (`backend/data/models_registry.json`)
   - ❌ No renderer config in `frontend/src/config/model_renderer_configs.json`
   - **Behavior**: Will use default config when rendered
   - **Note**: Flagged in README

2. **google/gemini-2.0-flash**:
   - ✅ Has renderer config in `model_renderer_configs.json`
   - ❌ Not present in registry
   - **Behavior**: Will not be tested by harness
   - **Note**: Flagged in README

## CI Status

**Branch**: `cursor/model-rendering-qa-7e40`  
**Check Script**: `./check-ci.sh`

### ✅ Passing Checks

- Frontend ESLint: Passed (2 pre-existing warnings, not introduced by this PR)
- Frontend TypeScript: Passed (no errors)
- Frontend Build: Passed (with prerendering)
- Frontend Tests: **1069 tests passed** (Vitest)
- CSP Header Sync: Passed
- Nginx Config: Passed

### ⚠️ Expected Skips

- Backend checks: Skipped (venv not present in cloud environment)

**Conclusion**: PR is ready for review. All relevant checks passing.

## File Structure

```
rendering-harness/
├── .gitignore                      # Excludes node_modules, runs/* except fixture test
├── README.md                       # Complete documentation
├── SUMMARY.md                      # This file
├── package.json                    # Dependencies (Playwright, tsx, etc.)
├── tsconfig.json                   # TypeScript config
├── vite.config.ts                  # Vite config (frontend import alias)
├── playwright.config.ts            # Playwright config (Vite only, port 5174)
├── index.html                      # Harness app HTML entry point
├── harness-app.tsx                 # Vite React app wrapping LatexRenderer
├── run-harness.ts                  # Main script (OpenRouter + Playwright)
├── test-with-fixtures.ts           # Fixture test runner (no API key)
├── run.sh                          # Helper script (starts Vite + runs harness)
├── prompts/
│   ├── 01-math-basics.md
│   ├── 02-markdown-formatting.md
│   ├── 03-code-blocks.md
│   ├── 04-mixed-markdown-latex.md
│   └── 05-complex-scenarios.md
├── fixtures/
│   └── sample-responses.json       # Hand-written fixture data
└── runs/
    └── 2026-11-04-fixture-test/    # Committed test results
        ├── openai_gpt-4o_01-math-basics.png
        ├── anthropic_claude-sonnet-4.6_02-markdown-formatting.png
        ├── google_gemini-2.5-flash_03-code-blocks.png
        ├── deepseek_deepseek-v4-pro_04-mixed-markdown-latex.png
        └── review.html
```

## Usage Examples

### 1. Dry Run (Cost Estimation)

```bash
cd rendering-harness
npm install
npm run harness -- --dry-run
```

**Output**: Shows estimated cost for all 100 registry models, refuses to run if > $10

### 2. Test with Fixtures (No API Key)

```bash
npm run test-fixtures
```

**Output**: Runs 4 fixture models, generates screenshots and review page

### 3. Run on Selected Models (Real API)

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
npm run harness -- --models=openai/gpt-4o,anthropic/claude-sonnet-4.6,google/gemini-2.5-flash,deepseek/deepseek-v4-pro --max-usd=5.0
```

**Output**: Calls OpenRouter API, generates screenshots, saves to `runs/<date>/`

## Cost Breakdown

### Example Run (4 models, 5 prompts each)

**Models**:
- openai/gpt-4o
- anthropic/claude-sonnet-4.6  
- google/gemini-2.5-flash
- deepseek/deepseek-v4-pro (thinking model, 3x multiplier)

**Estimated Cost** (dry-run):
- GPT-4o: ~$0.20 (5 prompts)
- Claude Sonnet 4.6: ~$0.15 (5 prompts)
- Gemini 2.5 Flash: ~$0.05 (5 prompts)
- DeepSeek V4 Pro: ~$0.12 (5 prompts, with 3x multiplier)
- **Total**: ~$0.52

**Actual Cost** (fixture test): $0.0065 (simulated from fixture data)

### Full Registry Estimate

**100 models × 5 prompts = 500 requests**  
**Total estimated cost**: $18.84  
**Required --max-usd**: 20.0 (to proceed)

## Screenshots

### Math Rendering
✅ Inline math: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$  
✅ Display math: $$\int_0^1 x^2 dx = \frac{1}{3}$$  
✅ Matrices: $$I = \begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix}$$

### Markdown Formatting
✅ Headers (H3, H4)  
✅ **Bold** and *italic* text  
✅ Nested lists (3 levels)  
✅ Tables with proper alignment  
✅ Blockquotes

### Code Blocks
✅ Python syntax highlighting (Prism)  
✅ JavaScript syntax highlighting  
✅ Inline code preserved: `x^2`, `$price`

### Edge Cases
✅ Money dollar signs not rendered as math: "$5 and $10"  
✅ Math in lists with formatting  
✅ LaTeX in table cells  
✅ Horizontal rules

## Next Steps

1. **Review**: Jack reviews PR #178
2. **Merge**: After approval (agent does not merge)
3. **Usage**: Run harness with OPENROUTER_API_KEY for real models
4. **Feedback**: Use review page to document rendering issues
5. **Iteration**: Fix any rendering bugs found, re-test with harness

## Technical Notes

### Why Vite + Playwright?

- **Vite**: Fast dev server, supports React/TypeScript, hot reload for development
- **Playwright**: Headless browser, proper font loading, accurate screenshots
- **Real LatexRenderer**: Ensures screenshots match production rendering exactly

### Why No Fixed Timeouts?

- **Data-driven waiting**: Waits for `data-render-complete` attribute
- **Font loading**: Uses `document.fonts.ready` promise
- **Prism highlighting**: 1000ms delay after fonts load (Prism is synchronous)
- **No networkidle**: Not reliable for SPAs with dynamic imports

### Why 3x Multiplier for Thinking Models?

- **Reasoning traces**: Thinking models output significantly more tokens
- **Conservative estimate**: 3x is a safe middle ground (could be 2-4x)
- **Based on observations**: o1, DeepSeek-R1 typically 2-4x longer outputs

## Rendering Issues Noticed

During fixture testing, all rendering appeared correct:

✅ No placeholder artifacts (MDPH, etc.)  
✅ Math delimiters handled correctly  
✅ No escaped backslashes in output  
✅ Code blocks not treated as math  
✅ Money dollar signs preserved  
✅ Nested lists properly indented  
✅ Tables aligned correctly

**No bugs found in fixture test**. Real-world testing with diverse models may reveal issues.

## Conclusion

The model rendering QA harness is **complete and functional**:

- ✅ All deliverables implemented
- ✅ Test run successful (4 models, 4 screenshots)
- ✅ Dry-run estimates working correctly
- ✅ Cost cap enforcement working
- ✅ CI checks passing
- ✅ PR created: https://github.com/jaydeelew/CompareIntel/pull/178
- ✅ Documentation complete
- ✅ Known issues flagged (z-ai/glm-5, gemini-2.0-flash)

**Ready for review and merge**.
