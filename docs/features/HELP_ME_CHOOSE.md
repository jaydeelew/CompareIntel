# Help Me Choose – Decision Support Feature

The "Help me choose" feature provides decision support for model selection. Users can browse curated recommendations by use case, see benchmark evidence, and quickly apply top models from each category.

## Overview

A "Help me choose" button sits next to the Advanced button in the model selection area. Clicking it opens a dropdown with ten categories displayed horizontally (stacking vertically on mobile). Each category lists models ordered best-to-worst based on published benchmarks. Users can check individual models or use "Select top 3" per category; selections apply immediately and respect tier restrictions and `maxModelsLimit`.

**Categories:** Most cost-effective, Fastest responses, Best for coding, Best for writing, Best for reasoning, Best for web search, Multilingual, Long context, Legal, Medical.

**Inclusion rule:** Only models with well-respected, publicly available benchmarks (SWE-Bench, LMSys Arena, MMLU-Pro, OpenRouter pricing, etc.) are included. Each category has at least two models. Model IDs must exist in `models_registry.json`.

## Key Behaviors

- **Immediate selection:** Checkboxes toggle models directly; no Apply button. Same behavior as the main model selection area.
- **Evidence tooltips:** Hover over any model to see benchmark name, score, and source (e.g., "SWE-Bench Verified (swebench.com): 80.9%").
- **Tier restrictions:** Models unavailable to the user's tier are disabled with a lock icon and tooltip.
- **Visual feedback:** Selected models use primary-tinted styling; category headers containing selected models are highlighted. On open, the dropdown scrolls to the first selected model.
- **Mutual exclusivity:** Only one of Help me choose or Advanced can be open at a time.

## Methodology Page

A public page at `/help-me-choose-methodology` (linked in the footer) explains inclusion criteria, evidence sources by category, ordering rules, and how recommendations are updated.

## Evidence Sources

| Category | Primary sources | Key metrics |
|----------|-----------------|-------------|
| **Coding** | [SWE-Bench Verified](https://www.swebench.com/verified.html), [OpenLM SWE-bench+](https://openlm.ai/swe-bench/), [LMSys Coding Arena](https://lmarena.ai/) | % Resolved, Elo |
| **Writing** | [Creative Writing Arena](https://kearai.com/leaderboard/creative-writing), Mazur Writing Score | Human preference, voice |
| **Reasoning** | [MMLU-Pro](https://awesomeagents.ai/leaderboards/mmlu-pro-leaderboard/), [LMSys Chatbot Arena](https://lmarena.ai/leaderboard/) | STEM accuracy, Elo |
| **Cost-effective** | [OpenRouter pricing](https://openrouter.ai/docs/overview/models), [Artificial Analysis](https://artificialanalysis.ai/) | $/1M tokens |
| **Web search** | Provider docs (`supports_web_search`) | Citation quality |
| **Fastest** | [AILatency](https://www.ailatency.com/), [Artificial Analysis](https://artificialanalysis.ai/), [LMSys Chatbot Arena](https://lmarena.ai/) | Time-to-first-token, Elo |
| **Multilingual** | Provider docs, [LMSys Arena](https://lmarena.ai/) | Language coverage |
| **Long context** | [Michelangelo Long-Context 1M](https://llmdb.com/benchmarks/mrcr-1m), provider docs | Context window, MRCR |
| **Legal** | [LegalBench](https://www.vals.ai/benchmarks/legal_bench-09-08-2025) | Legal reasoning accuracy |
| **Medical** | [MedQA](https://www.vals.ai/benchmarks/medqa-08-12-2025) | USMLE-style medical QA |

[LMSys Chatbot Arena](https://lmarena.ai/leaderboard/) provides overall model quality; specialized leaderboards refine by use case.

## Technical Reference

| Item | Location |
|------|----------|
| Component | `frontend/src/components/comparison/HelpMeChoose.tsx` |
| Recommendations data | `frontend/src/data/helpMeChooseRecommendations.ts` |
| Styles | `frontend/src/styles/models.css` (`.help-me-choose*`, `.models-section-buttons-row`) |
| Hook logic | `frontend/src/hooks/useModelManagement.ts` (`handleModelToggle`, `handleApplyRecommendation`) |
| Methodology page | `frontend/src/components/pages/HelpMeChooseMethodology.tsx` (route: `/help-me-choose-methodology`) |
| Benchmark research script | `backend/scripts/research_model_benchmarks.py` |
| Registry sync script | `backend/scripts/sync_help_me_choose_with_registry.py` |
| Admin integration | `backend/app/routers/admin/models_management.py` |

**Recommendation rules:** Each category has ≥2 models. Order indicates preference (best first). Free-tier categories (Most cost-effective, Fastest responses) list unregistered-tier models first so unregistered users receive ≥2 recommendations.

**Registry sync:** CI runs `sync_help_me_choose_with_registry.py` to validate model IDs against `models_registry.json`. Use `--fix` to remove missing models or apply `MODEL_ID_ALIASES` for renames.

**New model automation:** When models are added via the admin panel, `research_model_benchmarks.py` runs to place them in qualifying categories and generate evidence strings. It fails gracefully if it cannot update.

## Future Enhancements

Image/vision-capable models will be added as a category once vision/multimodal support exists in the comparison flow.
