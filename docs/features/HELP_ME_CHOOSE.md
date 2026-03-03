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
- Layout: `models-section-buttons-row` contains both Help me choose and Advanced
- Exported from `frontend/src/components/comparison/index.ts`

---

### Goal 2: Evidence-based model recommendations by category

**Status:** ✅ Completed  
**Date:** February 2026  
**Updated:** February 2026 (evidence-based revision)

**Description:** Define default model selections for various categories based on published benchmarks and reliable sources. Each category lists exactly 2–3 top models.

**Accomplished:**
- Created `frontend/src/data/helpMeChooseRecommendations.ts`
- Six categories, each with 2–3 models backed by benchmarks:
  - **Best for coding:** Claude Opus 4.6, Claude Opus 4.5, MiniMax M2.5 (SWE-Bench Verified 80.8–80.9%, LMSys Coding Arena #1–2)
  - **Best for writing:** Claude Opus 4.6, Claude Opus 4.5, GPT-5.2 (Creative Writing Arena, Mazur Writing Score)
  - **Best for reasoning:** o3, DeepSeek R1, Claude Opus 4.6 (MMLU-Pro, chain-of-thought SOTA)
  - **Most cost-effective:** DeepSeek R1, Gemini 2.5 Flash, Claude Haiku 4.5 (OpenRouter value leaders)
  - **Best for web search:** Claude Sonnet 4.6, GPT-5.1, Gemini 2.5 Pro (retrieval, citation)
  - **Fastest responses:** Claude Haiku 4.5, GPT-5 Nano, Gemini 2.0 Flash, Gemini 2.5 Flash (latency benchmarks)
- Model IDs must match `backend/data/models_registry.json`
- See **Evidence Sources** section below for benchmark references

---

### Goal 3: Checkbox selection and auto-apply models

**Status:** ✅ Completed  
**Date:** February 2026

**Description:** When a user selects/checks a recommendation in the dropdown, the appropriate models are selected automatically.

**Accomplished:**
- Each recommendation is a checkbox; checking applies that recommendation
- `handleApplyRecommendation` in `useModelManagement`:
  - Filters model IDs by: existence in registry, `available !== false`, user tier access, `hidePremiumModels`
  - Limits to `maxModelsLimit`
  - Disabled in follow-up mode (shows error)
  - Sets `defaultSelectionOverridden` via `onDeselectToEmpty`
- `ModelsArea` receives `onApplyRecommendation` and passes it to `HelpMeChoose`
- `MainPage` wires `handleApplyRecommendation` from `useModelManagement` into `modelsAreaProps`

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

**Description:** Disable recommendations unavailable to unregistered/free tiers; align Help me choose styling and behavior with Advanced and the model selection area.

**Accomplished:**
- **Tier restrictions:** Options where all models are restricted for the user's tier are disabled (same logic as model selection: `tier_access`, `trial_unlocked`)
- **Tooltips:** Hover over disabled options shows tier-appropriate message (sign up for free account / paid tiers coming soon)
- **Styling:** Disabled options use same theme as restricted models (opacity, cursor, Premium badge with lock icon next to text)
- **Both dropdowns open:** Click-outside excludes sibling toggles so Help me choose and Advanced can both stay open
- **Dropdown background:** Help me choose content matches Advanced (transparent option backgrounds, separator lines, light/dark theme gradients when expanded)
- **Toggle emphasis:** Both buttons appear bold when expanded (`font-weight: var(--font-semibold)`)

---

## Evidence Sources

Recommendations are based on the following benchmarks and sources. Update this section when re-evaluating model selections.

| Category | Primary sources | Key metrics |
|----------|-----------------|-------------|
| **Coding** | [SWE-Bench Verified](https://www.swebench.com/verified.html) (500 human-filtered GitHub issues), [LMSys Coding Arena](https://lmarena.ai/) | % Resolved, Elo on code-specific evals |
| **Writing** | [Creative Writing Arena](https://kearai.com/leaderboard/creative-writing), [WritingBench](https://arxiv.org/abs/2503.05244), Mazur Writing Score | Human preference, voice, character consistency |
| **Reasoning** | [MMLU-Pro](https://awesomeagents.ai/leaderboards/mmlu-pro-leaderboard/) (12k+ harder questions), chain-of-thought evals | STEM accuracy, multi-step reasoning |
| **Cost-effective** | [OpenRouter pricing](https://openrouter.ai/docs/overview/models), cost-per-token calculators | $/1M tokens, quality-per-dollar |
| **Web search** | Provider docs (`supports_web_search`), retrieval benchmarks | Citation quality, grounded answers |
| **Fastest** | [Anthropic Haiku 4.5](https://www.anthropic.com/news/claude-haiku-4-5), [Artificial Analysis](https://artificialanalysis.ai/) latency benchmarks | Time-to-first-token, throughput |

**General rankings:** [LMSys Chatbot Arena](https://lmarena.ai/leaderboard/) (pairwise human preference, Elo) provides overall model quality; specialized leaderboards (Coding, Creative Writing) refine by use case.

---

## Future Goals (To Be Completed)

### Goal 6: Multi-select recommendations

**Status:** ⬜ Pending

**Description:** Allow users to check multiple recommendations and combine model sets (with deduplication and `maxModelsLimit` cap).

---

### Goal 7: Show which recommendation matches current selection

**Status:** ⬜ Pending

**Description:** Visually indicate which recommendation(s) best match the user’s current model selection (e.g., checked state or highlight).

---

### Goal 8: Benchmark citations and evidence

**Status:** ⬜ Pending

**Description:** Add links or citations to benchmarks (LMSys, SWE-Bench, etc.) so users can see why models are recommended.

---

### Goal 9: Personalized recommendations

**Status:** ⬜ Pending

**Description:** Adjust recommendations based on user tier, usage history, or preferences (e.g., favor cost-effective for free tier).

---

### Goal 10: Category expansion

**Status:** ⬜ Pending

**Description:** Add categories such as: multilingual, long context, vision/multimodal, specific domains (legal, medical, etc.).

---

### Goal 11: Sync with models registry

**Status:** ⬜ Pending

**Description:** Validate or auto-update recommendation model IDs against the live models registry; handle deprecated or renamed models.

---

## Technical Reference

| Item | Location |
|------|----------|
| Component | `frontend/src/components/comparison/HelpMeChoose.tsx` |
| Recommendations data | `frontend/src/data/helpMeChooseRecommendations.ts` |
| Styles | `frontend/src/styles/models.css` (`.help-me-choose*`, `.models-section-buttons-row`) |
| Hook logic | `frontend/src/hooks/useModelManagement.ts` (`handleApplyRecommendation`) |
| Integration | `frontend/src/components/main-page/ModelsArea.tsx`, `frontend/src/pages/MainPage.tsx` |
| Models registry | `backend/data/models_registry.json` |

**Recommendation rule:** Each category must have exactly 2–3 models. Order indicates preference (best first). Model IDs must exist in the registry.

---

## How to Update This Document

When completing a goal:

1. Change status from ⬜ Pending to ✅ Completed
2. Add **Date** and **Accomplished** details
3. Move the goal from "Future Goals" to "Goals and Progress" if desired, or leave in place with updated status

When adding new goals:

1. Add under "Future Goals (To Be Completed)" with ⬜ Pending
2. Include a clear **Description** so future sessions know what to implement
