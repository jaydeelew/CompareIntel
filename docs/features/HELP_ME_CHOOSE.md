# Help Me Choose – Decision Support Feature

The "Help me choose" feature provides decision support for model selection. Users can browse curated recommendations by use case, see benchmark evidence, and quickly apply top models from each category.

## Overview

A "Help me choose" button sits next to the Advanced button in the model selection area. Clicking it opens a dropdown with six categories displayed horizontally (stacking vertically on mobile). Each category lists models ranked by benchmark score (highest first). All models shown are strong in their category. Users can check individual models or use "Select top 3" per category; selections apply immediately and respect tier restrictions and `maxModelsLimit`.

**Categories:** Best for coding, Best for writing, Best for reasoning, Best for long context, Best value (cost-effective), Fastest responses, Best for multilingual, Best for legal, Best for medical.

**Inclusion rule:** Only models with numeric benchmark scores from well-respected, publicly available sources (SWE-Bench, MMLU-Pro, Mazur Writing Score, Michelangelo MRCR, OpenRouter pricing, LMSpeed, Global-MMLU, LegalBench, HealthBench) are included. Models without benchmark scores are not added. Each category has at least two models. Model IDs must exist in `models_registry.json`.

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
| **Coding** | [SWE-Bench Verified](https://www.swebench.com/verified.html), [OpenLM SWE-bench+](https://openlm.ai/swe-bench/), [LMSys Coding Arena](https://lmarena.ai/) | % Resolved |
| **Writing** | [Creative Writing Arena](https://kearai.com/leaderboard/creative-writing), Mazur Writing Score | Human preference, voice |
| **Reasoning** | [MMLU-Pro](https://awesomeagents.ai/leaderboards/mmlu-pro-leaderboard/), [LMSys Chatbot Arena](https://lmarena.ai/leaderboard/) | STEM accuracy |
| **Long context** | [Michelangelo Long-Context 1M](https://llmdb.com/benchmarks/mrcr-1m) | Context window, MRCR (0–100) |
| **Best value** | [OpenRouter pricing](https://openrouter.ai/models) | Avg cost per 1M tokens (lower = better) |
| **Fastest responses** | [LMSpeed](https://lmspeed.net/leaderboard/best-throughput-models-weekly) | Throughput (tokens/second) |
| **Multilingual** | [Global-MMLU (llmdb.com)](https://llmdb.com/benchmarks/global-mmlu) | 42 languages (0–100) |
| **Legal** | [LegalBench (VALS.ai)](https://www.vals.ai/benchmarks/legal_bench-01-30-2025) | Accuracy across 161 legal tasks |
| **Medical** | [HealthBench](https://openai.com/index/healthbench), HealthBench Hard | Physician-evaluated clinical conversations |

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

**Recommendation rules:** Each category has ≥2 models. Order indicates preference (best first) using the category's primary benchmark metric. Cost-effective sorts ascending (cheapest first). Only models with numeric benchmark scores are included. The research script adds models when it can fetch benchmark scores (SWE-bench for coding, LegalBench for legal, OpenRouter for cost-effective, LMSpeed for fast, Global-MMLU for multilingual).

**Registry sync:** CI runs `sync_help_me_choose_with_registry.py` to validate model IDs against `models_registry.json`. Use `--fix` to remove missing models or apply `MODEL_ID_ALIASES` for renames.

**New model automation:** When models are added via the admin panel, `research_model_benchmarks.py` runs. It fetches SWE-bench (coding), LegalBench (legal), OpenRouter pricing (cost-effective), LMSpeed (fast), and Global-MMLU (multilingual) scores, adding models to categories when data is available. Writing, long-context, and medical categories are maintained manually with benchmark evidence from published sources.

## Future Enhancements

Image/vision-capable models will be added as a category once vision/multimodal support exists in the comparison flow.
