# Help Me Choose – Decision Support Feature

> **Purpose:** This document tracks the overall goals, progress, and accomplishments of the "Help me choose" feature. It is intended for future chat sessions to see saved progress and continue building toward a top-tier AI model comparison decision-support experience.

## Vision

The "Help me choose" feature provides decision support for model selection. The long-term goal is to compete with top-tier AI model comparison websites by offering:

- Curated recommendations by use case (coding, writing, reasoning, etc.)
- Benchmarks and evidence-based suggestions
- Personalized guidance based on user context
- Clear, actionable model selections

---

## Goals and Progress

### Goal 1: Install button and dropdown UI

**Status:** ✅ Completed  
**Date:** February 2026

**Description:** Add a "Help me choose" button to the left of the Advanced button, on the same horizontal line, with a dropdown similar in appearance to the Advanced settings dropdown.

**Accomplished:**
- Created `HelpMeChoose` component (`frontend/src/components/comparison/HelpMeChoose.tsx`)
- Button styled to match Advanced button
- Dropdown with click-outside-to-close behavior
- CSS classes: `help-me-choose`, `help-me-choose-toggle`, `help-me-choose-content`, etc.
- Layout: `models-section-buttons-row` grid with both Help me choose and Advanced
- Both buttons use `display: contents` + `grid-row: 1` so they stay on the same line regardless of which dropdown is open
- Exported from `frontend/src/components/comparison/index.ts`

---

### Goal 2: Evidence-based model recommendations by category

**Status:** ✅ Completed  
**Date:** February 2026  
**Updated:** March 2026 (horizontal layout, evidence tooltips, Grok/xAI models, explicit source citations)

**Description:** Define default model selections for various categories based on published benchmarks and reliable sources. Each category must have at least 2 models (2–3 recommended).

**Inclusion rule:** Only models with well-respected, publicly available benchmarks or user-ratings (SWE-Bench, LMSys Arena, MMLU-Pro, OpenRouter pricing, etc.) are included. Models without verifiable data are excluded until such data exists.

**Accomplished:**
- Created `frontend/src/data/helpMeChooseRecommendations.ts` with `HELP_ME_CHOOSE_CATEGORIES`
- Six categories displayed **horizontally** in the dropdown, each with models ordered best-to-worst:
  - **Most cost-effective:** DeepSeek Chat v3.1, Gemini 2.5 Flash, DeepSeek R1, Mistral Small, Phi-4, GPT-4o Mini, Step 3.5 Flash, Claude 3.5 Haiku — OpenRouter $/1M tokens
  - **Fastest responses:** Gemini 2.0 Flash, Gemini 2.5 Flash, Grok 4.1 Fast, Claude 3.5 Haiku, Claude Haiku 4.5, GPT-4o Mini, Mistral Small — AILatency, Artificial Analysis, LMSys Arena
  - **Best for coding:** Claude Opus 4.5 (80.9%), Claude Opus 4.6 (80.8%), Gemini 3.1 Pro (80.6%), MiniMax M2.5 (80.2%), GPT-5.2 (80.0%), …, Grok 4 (70.6%) — SWE-Bench Verified, OpenLM
  - **Best for writing:** Claude Opus 4.6, Claude Opus 4.5, GPT-5.2, DeepSeek R1, Claude Sonnet 4.6, Claude 3.7 Sonnet, GPT-5.1, Gemini 2.5 Pro — Creative Writing Arena, Mazur Writing Score
  - **Best for reasoning:** o3, o3-mini, Gemini 3.1 Pro (MMLU-Pro 90.1%), DeepSeek R1, Claude Opus 4.6, GPT-5.2 Pro, Grok 4.1 Fast, Claude Opus 4.5, Gemini 2.5 Pro, Qwen3-Max Thinking, Qwen3-Next Thinking — MMLU-Pro, LMSys Arena
  - **Best for web search:** Claude Sonnet 4.6, GPT-5.1, Gemini 2.5 Pro, Claude Opus 4.6, Claude Haiku 4.5, Gemini 2.5 Flash, GPT-5.2, Command R+ — Provider docs
- **Evidence tooltips:** Each model shows benchmark/citation with source on hover (`title` attribute). Format: "Source (url): Score/metric."
- **Explicit source citations:** Every evidence string names the benchmark and source (e.g., "SWE-Bench Verified (swebench.com): 80.9%")
- Models may appear in multiple categories; selection is deduplicated
- Model IDs must match `backend/data/models_registry.json`
- See **Evidence Sources** section below for benchmark references

---

### Goal 3: Immediate model selection (no Apply button)

**Status:** ✅ Completed  
**Date:** February 2026  
**Updated:** March 2026 (removed Apply button; selections apply immediately)

**Description:** When a user checks/unchecks a model in the dropdown, the model is toggled immediately — same as the main "Select Models to Compare" area.

**Accomplished:**
- Each model has a checkbox; `onToggleModel(modelId)` called on change for immediate selection
- Apply button removed; intro text: "Select models below — changes apply immediately, same as the main model selection."
- `handleModelToggle` in `useModelManagement` uses `String()` normalization for reliable ID comparison (fixes close-button bug for models selected via Help me choose)
- Close (X) button on model cards works for models selected from either Help me choose or the main selection area
- Click-outside handler in HelpMeChoose ignores clicks inside `modelsSectionRef` to prevent the dropdown from closing when clicking model card X buttons

---

### Goal 4: Planning document for feature roadmap

**Status:** ✅ Completed  
**Date:** February 2026

**Description:** Create a document that defines goals, tracks completion, and describes accomplishments so future sessions can continue building.

**Accomplished:**
- This document (`docs/features/HELP_ME_CHOOSE.md`)
- Each goal has: Status, Date, Description, Accomplished

---

### Goal 5: Tier restrictions and UX polish

**Status:** ✅ Completed  
**Date:** February 2026  
**Updated:** March 2026 (horizontal layout, responsive, button stability)

**Description:** Disable recommendations unavailable to unregistered/free tiers; align Help me choose styling and behavior with Advanced and the model selection area.

**Accomplished:**
- **Tier restrictions:** Models restricted for the user's tier are disabled (same logic as model selection: `tier_access`, `trial_unlocked`)
- **Tooltips:** Hover over disabled models shows tier-appropriate message (sign up for free account / paid tiers coming soon)
- **Styling:** Disabled models use same theme as restricted models (opacity, cursor, lock icon)
- **Mutual exclusivity:** Only one of Help me choose / Advanced can be open at a time (parent `modelsDropdownOpen` state)
- **Dropdown background:** Help me choose content matches Advanced (light/dark theme gradients when expanded)
- **Toggle emphasis:** Both buttons appear bold when expanded (`font-weight: var(--font-semibold)`)
- **Button stability:** Both toggle buttons use `display: contents` + `grid-row: 1` so neither moves when any dropdown opens. Advanced content uses `grid-column: 1 / -1; justify-self: end` to expand in-flow below the buttons.
- **Help me choose dropdown width:** Full width matching the model-provider dropdowns (`width: 100%`, no `max-width` cap)
- **Horizontal layout (March 2026):** Categories displayed as columns across the dropdown; models listed under each category header.
- **Responsive:** At 768px and below, categories stack vertically; `max-height: 70vh` with scroll. Touch targets ≥44px on `pointer: coarse` (mobile/touchscreen).
- **Done Selecting card:** Hidden when Help me choose dropdown is expanded (`isHelpMeChooseExpanded` prop in `useDoneSelectingCard`).

---

### Goal 6: Multi-select recommendations

**Status:** ✅ Completed  
**Date:** March 2026

**Description:** Allow users to check multiple models across categories (with deduplication and `maxModelsLimit` cap).

**Accomplished:** Individual model checkboxes across all categories. Selections apply immediately via `onToggleModel`. Deduplicated by model ID.

---

### Goal 7: Benchmark citations and evidence

**Status:** ✅ Completed  
**Date:** March 2026

**Description:** Add links or citations to benchmarks (LMSys, SWE-Bench, etc.) so users can see why models are recommended.

**Accomplished:** Each model has a tooltip (`title`) with evidence text including the benchmark name, score, and source. Data in `helpMeChooseRecommendations.ts` per `HelpMeChooseModelEntry.evidence`. All entries now include explicit source attribution.

---

### Goal 8: Methodology page

**Status:** ✅ Completed  
**Date:** March 2026

**Description:** Create a public-facing page explaining the ranking methodology, linked from the footer.

**Accomplished:**
- Created `frontend/src/components/pages/HelpMeChooseMethodology.tsx` at route `/help-me-choose-methodology`
- Page covers: inclusion criteria, evidence sources by category (with links), ordering rules, categorization logic, update process
- Added "Help Me Choose Methodology" link to the site footer (`Footer.tsx`)
- Added route in `App.tsx` with lazy loading
- Added URL to `sitemap.xml`

---

### Goal 9: Automated benchmark research on model addition

**Status:** ✅ Completed  
**Date:** March 2026

**Description:** When a new model is added via the admin panel, automatically research its benchmarks and add it to the appropriate Help Me Choose categories.

**Accomplished:**
- Created `backend/scripts/research_model_benchmarks.py`:
  - Fetches model data from registry and OpenRouter
  - Determines category placements based on: pricing (cost-effective), model ID patterns (fast, coding), description keywords (reasoning), `supports_web_search` flag
  - Parses `helpMeChooseRecommendations.ts`, adds the model to qualifying categories, writes back
  - Generates evidence strings citing the source
  - Supports `--dry-run` mode and standalone CLI usage
- Integrated into both admin model-adding endpoints in `backend/app/routers/admin/models_management.py`:
  - Non-streaming (`/models/add`): runs as subprocess after renderer setup
  - Streaming (`/models/add-stream`): runs as async subprocess with SSE progress ("Researching benchmarks for Help Me Choose...")
  - Fails gracefully (logs warning, does not block model addition)
- Created comprehensive test suite: `backend/tests/unit/test_research_model_benchmarks.py` (39 tests):
  - Unit tests: cost calculation, category determination, TS parsing, model existence checks, add/duplicate prevention, round-trip serialization
  - Integration tests: full research-and-update flow with mocked externals (code model → coding, web search → web-search, not-in-registry → skipped, duplicates, free → multiple categories, dry-run)
  - Validation tests: real `helpMeChooseRecommendations.ts` file (parses, all 10 categories exist, each has ≥2 models, all evidence non-empty, all model IDs exist in registry)

---

### Goal 10: Show which recommendation matches current selection

**Status:** ✅ Completed  
**Date:** March 2026

**Description:** Visually indicate which recommendation(s) best match the user's current model selection (e.g., checked state or highlight).

**Accomplished:**
- **Model-level emphasis:** Selected models in the dropdown use stronger styling: primary-tinted background, medium font weight. Hover state darkens the tint.
- **Category header highlight:** Category headers that contain selected models are colored with the primary accent.
- **Scroll-to-match:** When the dropdown opens with models selected, it scrolls smoothly to bring the first selected model (in DOM order) into view.

---

### Goal 12: Sync with models registry

**Status:** ✅ Completed  
**Date:** March 2026

**Description:** Validate or auto-update recommendation model IDs against the live models registry; handle deprecated or renamed models.

**Accomplished:**
- Created `backend/scripts/sync_help_me_choose_with_registry.py`:
  - **Validate mode (default):** Checks that all model IDs in `helpMeChooseRecommendations.ts` exist in `models_registry.json`; exits 1 if any are missing
  - **Fix mode (`--fix`):** Removes models not in registry; applies `MODEL_ID_ALIASES` for renamed models (old_id → new_id)
  - **Dry run (`--dry-run`):** With `--fix`, shows changes without writing
- Integrated into CI: `Sync Help Me Choose with registry` step runs in backend-test job
- CI path filter: `frontend/src/data/**` added to backend trigger so sync runs when recommendations change
- Unit tests: `backend/tests/unit/test_sync_help_me_choose_with_registry.py` (6 tests)
- Free-tier ordering validation: `test_free_tier_categories_have_unregistered_models_first` enforces that cost-effective and fast categories list unregistered-tier models first (≥2) so unregistered users receive ≥2 recommendations

---

## Methodology Page

A public-facing page at `/help-me-choose-methodology` (linked in the footer as "Help Me Choose Methodology") explains:
- Inclusion criteria (only models with well-respected, publicly available benchmarks)
- Evidence sources by category (with clickable links to SWE-Bench, LMSys, OpenRouter, etc.)
- How ordering and categorization work
- How recommendations are updated

---

## Evidence Sources

Recommendations are based on the following benchmarks and sources. Update this section when re-evaluating model selections.

| Category | Primary sources | Key metrics |
|----------|-----------------|-------------|
| **Coding** | [SWE-Bench Verified](https://www.swebench.com/verified.html) (500 human-filtered GitHub issues), [OpenLM SWE-bench+](https://openlm.ai/swe-bench/), [LMSys Coding Arena](https://lmarena.ai/) | % Resolved, Elo on code-specific evals |
| **Writing** | [Creative Writing Arena](https://kearai.com/leaderboard/creative-writing), Mazur Writing Score | Human preference, voice, character consistency |
| **Reasoning** | [MMLU-Pro](https://awesomeagents.ai/leaderboards/mmlu-pro-leaderboard/) (12k+ harder questions), chain-of-thought evals, [LMSys Chatbot Arena](https://lmarena.ai/leaderboard/) | STEM accuracy, multi-step reasoning, Elo |
| **Cost-effective** | [OpenRouter pricing](https://openrouter.ai/docs/overview/models), [Artificial Analysis](https://artificialanalysis.ai/) Quality Score | $/1M tokens, quality-per-dollar |
| **Web search** | Provider docs (`supports_web_search`), retrieval benchmarks | Citation quality, grounded answers |
| **Fastest** | [AILatency](https://www.ailatency.com/), [Artificial Analysis](https://artificialanalysis.ai/), [LMSys Chatbot Arena](https://lmarena.ai/) | Time-to-first-token, throughput, Elo |
| **Multilingual** | Provider docs, [LMSys Arena](https://lmarena.ai/) | Language coverage, multilingual benchmarks |
| **Long context** | [Michelangelo Long-Context 1M](https://llmdb.com/benchmarks/mrcr-1m), provider docs | Context window size, MRCR score (0–100) |
| **Legal** | [LegalBench](https://www.vals.ai/benchmarks/legal_bench-09-08-2025) | Legal reasoning accuracy, six task categories |
| **Medical** | [MedQA](https://www.vals.ai/benchmarks/medqa-08-12-2025) | USMLE-style medical QA, clinical reasoning |

**General rankings:** [LMSys Chatbot Arena](https://lmarena.ai/leaderboard/) (pairwise human preference, Elo) provides overall model quality; specialized leaderboards (Coding, Creative Writing) refine by use case.

---

## Future Goals (To Be Completed)

### Goal 13: Image/vision models (deferred)

**Status:** ⬜ Pending (deferred)

**Description:** Add a category for image/vision-capable models when ready to implement.

**Status:** ✅ Completed  
**Date:** March 2026

**Description:** Add categories such as: multilingual, long context, specific domains (legal, medical, etc.). Image/vision models are deferred until ready to implement.

**Accomplished:**
- **Multilingual:** Models with strong performance across many languages (Llama 3.1 405B, Mistral Large, Command A, Qwen 3.5, Claude Opus 4.6, Gemini 2.5 Pro) — provider docs, LMSys Arena
- **Long context:** Models with large context windows 128K–1M+ tokens (Gemini 2.5 Pro, Claude Opus 4.6, Gemini 3 Pro, Gemini 2.0 Flash, Kimi K2.5, Command A) — Michelangelo Long-Context 1M (llmdb.com), provider docs
- **Legal:** Models for legal reasoning, contract analysis (Gemini 3 Pro 87.04%, Gemini 3 Flash 86.86%, GPT-5.2 86.02%, Claude Opus 4.6) — LegalBench (vals.ai)
- **Medical:** Models for medical QA, clinical reasoning (o3, GPT-5.2, GPT-5 Mini, Claude Opus 4.6, Grok 4) — MedQA (vals.ai)
- Updated `helpMeChooseRecommendations.ts` with four new categories
- Updated `HelpMeChooseMethodology.tsx` with evidence sources table rows
- Updated `research_model_benchmarks.py`: CATEGORY_IDS, determine_categories (multilingual, long-context auto-detection)
- Legal/medical categories: no auto-detection (added manually based on benchmark scores)
- Image/vision models deferred per original scope

---

## Additional Findings and Resolutions

The following items were identified during review. Resolutions are tracked here for future implementation.

| Finding | Resolution | Status |
|---------|------------|--------|
| **Parser test failure** | `parse_recommendations_ts` in `research_model_benchmarks.py` may fail to parse multiline evidence strings (e.g. `evidence:\n  '...'`) or mixed quote styles (e.g. `evidence: "Anthropic's..."`). This causes `test_each_category_has_models` to fail. | ✅ Fixed March 2026: regex now handles multiline evidence, single/double quotes, trailing commas, escaped quotes |
| **Footer link label** | Document specifies "Help Me Choose Methodology" but Footer uses "Help Me Choose". Align for consistency. | ✅ Fixed March 2026: Footer link text updated to "Help Me Choose Methodology" |
| **Free-tier ordering validation** | Recommendation rule: "Most cost-effective" and "Fastest responses" must list unregistered-tier models first so unregistered users receive ≥2 models. Add validation to enforce. | ✅ Fixed March 2026: `test_free_tier_categories_have_unregistered_models_first` in `test_research_model_benchmarks.py` |

---

## Suggested Order of Work

When implementing the remaining goals and resolutions, use this order:

1. ~~**Fix parser**~~ — ✅ Done March 2026. `parse_recommendations_ts` now handles multiline evidence, single/double quotes, trailing commas, escaped quotes. All tests pass.
2. ~~**Goal 12: Sync with models registry**~~ — ✅ Done March 2026. `sync_help_me_choose_with_registry.py` script, CI integration, free-tier ordering validation.
3. ~~**Goal 11: Category expansion**~~ — ✅ Done March 2026. Multilingual, long context, legal, medical categories added.

---

## Technical Reference

| Item | Location |
|------|----------|
| Component | `frontend/src/components/comparison/HelpMeChoose.tsx` |
| Recommendations data | `frontend/src/data/helpMeChooseRecommendations.ts` |
| Styles | `frontend/src/styles/models.css` (`.help-me-choose*`, `.models-section-buttons-row`, `.advanced-settings*`) |
| Hook logic | `frontend/src/hooks/useModelManagement.ts` (`handleModelToggle`, `handleApplyRecommendation`) |
| Integration | `frontend/src/components/main-page/ModelsArea.tsx`, `frontend/src/pages/MainPage.tsx` |
| Models registry | `backend/data/models_registry.json` |
| Methodology page | `frontend/src/components/pages/HelpMeChooseMethodology.tsx` (route: `/help-me-choose-methodology`) |
| Benchmark research script | `backend/scripts/research_model_benchmarks.py` |
| Registry sync script | `backend/scripts/sync_help_me_choose_with_registry.py` |
| Admin integration | `backend/app/routers/admin/models_management.py` (both `add_model` and `add_model_stream`) |
| Tests | `backend/tests/unit/test_research_model_benchmarks.py`, `backend/tests/unit/test_sync_help_me_choose_with_registry.py` |
| Done Selecting hook | `frontend/src/hooks/useDoneSelectingCard.ts` (`isHelpMeChooseExpanded` prop) |

**Recommendation rule:** Each category must have at least 2 models. Order indicates preference (best first). Model IDs must exist in the registry. Only models with publicly verifiable benchmark data are included. Free-tier-available categories (Most cost-effective, Fastest responses) must list unregistered-tier models first so unregistered users receive ≥2 models.

---

## How to Update This Document

When completing a goal:

1. Change status from ⬜ Pending to ✅ Completed
2. Add **Date** and **Accomplished** details
3. Move the goal from "Future Goals" to "Goals and Progress" if desired, or leave in place with updated status

When adding new goals:

1. Add under "Future Goals (To Be Completed)" with ⬜ Pending
2. Include a clear **Description** so future sessions know what to implement
