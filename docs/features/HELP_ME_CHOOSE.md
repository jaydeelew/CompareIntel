# Help Me Choose – Decision Support Feature

The "Help me choose" feature provides decision support for model selection. Users can browse curated recommendations by use case, see benchmark evidence, and quickly apply top models from each category.

## Overview

A "Help me choose" button sits next to the Advanced button in the model selection area. Clicking it opens a dropdown with twelve categories displayed horizontally (stacking vertically on mobile). Each category lists models ranked by benchmark score (highest first). All models shown are strong in their category. Users can check individual models or use "Select top 3" per category; selections apply immediately and respect tier restrictions and `maxModelsLimit`.

**Categories:** Best for coding, Best for writing, Best for math, Best for reasoning, Best for long context, Best value (cost-effective), Fastest responses, Best for multilingual, Best for legal, Best for vision, Best for image generation, Best for medical.

**Inclusion rule:** Only models with numeric benchmark scores from well-respected, publicly available sources are included. Models without benchmark scores are not added. Each category has at least two models. Model IDs must exist in the active CompareIntel lineup: `models_by_provider` in `backend/data/models_registry.json` (the same catalog the frontend loads via `GET /models`). Tier allow-lists are subsets of that lineup, not a second catalog.

## Key Behaviors

- **Immediate selection:** Checkboxes toggle models directly; no Apply button. Same behavior as the main model selection area.
- **Evidence tooltips:** Hover over any model to see the board, the raw score, and the fetch date. Blended categories lead with a within-board percentile (e.g. "Percentile 99.4% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1820 (published 2026-11-23, 5121 votes). Fetched 2026-11-27.").
- **Tier restrictions:** Models unavailable to the user's tier are disabled with a lock icon and tooltip.
- **Visual feedback:** Selected models use primary-tinted styling; category headers containing selected models are highlighted. On open, the dropdown scrolls to the first selected model.
- **Mutual exclusivity:** Only one of Help me choose or Advanced can be open at a time.

## Methodology Page

A public page at `/help-me-choose-methodology` (linked in the footer) explains inclusion criteria, evidence sources by category, ordering rules, and how recommendations are updated.

## Cold-Start Ranking Methodology

CompareIntel's long-term vision is a ranking system based on real user votes from blind side-by-side comparisons. Until enough user data is collected, rankings are seeded with clearly labeled public benchmark data from trusted third parties.

### Current Data Sources (Live)

All rankings today come from **public benchmarks**—independent evaluations conducted by research labs, universities, and benchmark organizations. Each model shows its source and score in the tooltip. The twelve categories and their sources are documented in `backend/scripts/research_model_benchmarks.py` and `frontend/src/data/helpMeChooseRecommendations.ts`.

### Planned Data Sources (Not Yet Live)

Two additional data sources are planned:

1. **CompareIntel's own fixed-prompt evaluations (planned):** Standardized evaluations using model-judged scoring. The judge model will be disclosed. These results will be clearly labeled as CompareIntel evaluations—never as user votes.

2. **User votes from blind side-by-side comparisons (planned):** Users will see two model outputs side-by-side (without revealing which model produced each) and pick the better one. Vote-based rankings will only be shown once a model has received at least 200 votes against at least 5 different opponent models. Models below this threshold will continue to show benchmark-based rankings.

### Labeling and Transparency

Every ranking is labeled by its source type: **Public benchmark**, **CompareIntel evaluation** (planned), or **User votes** (planned). Model-judged or synthetic results will never be presented as user votes. When transitioning a category from benchmark data to user votes, this documentation will be updated and vote counts will be shown alongside rankings.

## Evidence Sources

| Category | Primary source | Fallback | Key metric | Automated? |
|----------|---------------|----------|------------|------------|
| **Coding** | [LMArena Code Arena](https://arena.ai/leaderboard/code) (HF `webdev` / `overall`) | [SWE-Bench Pro public](https://labs.scale.com/leaderboard/swe_bench_pro_public) | Within-board percentile | Yes |
| **Writing** | [LMArena Creative Writing](https://arena.ai/leaderboard/text/creative-writing) (`text_style_control` / `creative_writing`) | None | Arena Score | Yes |
| **Math** | [LMArena math](https://arena.ai/leaderboard/text/math) (`math`) | None | Arena Score | Yes |
| **Reasoning** | [LMArena hard prompts](https://arena.ai/leaderboard/text/hard-prompts) (`hard_prompts`) | None | Arena Score | Yes |
| **Long context** | [LMArena Document Arena](https://arena.ai/leaderboard/document) (`document` / `overall`) | LMArena longer queries (`longer_query`) | Within-board percentile | Yes |
| **Best value** | [OpenRouter pricing](https://openrouter.ai/api/v1/models?output_modalities=all) | None | Avg $/1M tokens | Yes |
| **Fastest responses** | [LMSpeed model-speed](https://lmspeed.net/leaderboard/model-speed) | None | Tokens/second | Yes |
| **Multilingual** | [LMArena non-English](https://arena.ai/leaderboard/text) (`non_english`) | None | Arena Score | Yes |
| **Legal** | [VALS LegalBench](https://www.vals.ai/benchmarks/legal_bench) | LMArena legal and government prompts | Within-board percentile | Yes |
| **Best for vision** | [Vision Arena](https://lmarena.ai/leaderboard/vision) (HF `vision_style_control` / `overall`) | None | Arena Score | Yes |
| **Image generation** | [Text-to-Image Arena](https://lmarena.ai/leaderboard/text-to-image) (HF `text_to_image` / `overall`) | KEAR blog table if HF returns nothing | Arena Score | Yes |
| **Medical** | LMArena medicine and healthcare prompts (`industry_medicine_and_healthcare`) | None | Arena Score | Yes |

Machine-readable LMArena rows come from the public dataset [`lmarena-ai/leaderboard-dataset`](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) via the datasets-server filter API. Only the latest `leaderboard_publish_date` in the `latest` split is used. Arena categories are human-preference ratings published by LMArena. They are not CompareIntel user votes and not exam percents.

**Blend rule:** Coding, legal, and long context keep the primary board when a model appears on both. A model that is only on the fallback gets that board's percentile, computed against every published row on that board, not only lineup models. The evidence string names the actual board, the raw score, the publish date, and the fetch date.

**Sources that were evaluated and not used as the primary board:**

| Source | Why it is not the primary |
|--------|---------------------------|
| SWE-bench Verified (swebench.com) | Submissions stop around February 2026. No Opus 5, GPT-6, or Gemini 4. |
| Aider polyglot | Last meaningful runs around October 2025. |
| LiveCodeBench | Public sets are problems, not a current frontier leaderboard. VALS LiveCodeBench is frozen and saturated. |
| Terminal-Bench | Self-reported model-card scores. Misses the closed Claude, GPT, and Gemini models. |
| Artificial Analysis coding index | Null for lineup models on the public OpenRouter payload. The AA API needs a key this repo does not ship. |
| MathArena, GPQA, HLE, MMLU-Pro official HF boards | Self-reported, `verified=false`, and they omit the closed frontier models. |
| EQ-Bench | No stable public JSON. Creative writing is covered by LMArena. |
| Fiction.LiveBench, RULER, OpenAI MRCR | Public tables top out at 2025 models (o3, GPT-5, Grok 4, Gemini 2.5). |
| HealthBench | The OpenAI page returns 403 and the Hugging Face leaderboard is empty. No physician score is invented. |
| KEAR creative-writing snapshot | February 2026 blog table. LMArena's November 2026 board replaces it. |

## Technical Reference

| Item | Location |
|------|----------|
| Component | `frontend/src/components/comparison/HelpMeChoose.tsx` |
| Recommendations data | `frontend/src/data/helpMeChooseRecommendations.ts` |
| Styles | `frontend/src/styles/models.css` (`.help-me-choose*`, `.models-section-buttons-row`) |
| Hook logic | `frontend/src/hooks/useModelManagement.ts` (`handleModelToggle`, `handleApplyRecommendation`) |
| Methodology page | `frontend/src/components/pages/HelpMeChooseMethodology.tsx` (route: `/help-me-choose-methodology`) |
| Benchmark research script | `backend/scripts/research_model_benchmarks.py` (`--refresh-all`, `--sync-lineup`) |
| Registry / lineup sync script | `backend/scripts/sync_help_me_choose_with_registry.py` |
| Lineup source of truth | `backend/data/models_registry.json` → `models_by_provider` |
| Lineup membership test | `frontend/src/data/__tests__/helpMeChooseRecommendations.test.ts` (fails CI if a ranked model is not in the lineup) |
| Admin integration | `backend/app/routers/admin/models_management.py` |

## Automation

### How `--refresh-all` works

```bash
python scripts/research_model_benchmarks.py --refresh-all [--dry-run]
```

This command re-evaluates ALL registry models against ALL data-driven categories:

1. **Fetches** current data from public sources (LMArena Code Arena, text, document, vision, and text-to-image boards; SWE-Bench Pro public as the coding fallback; VALS LegalBench; OpenRouter prices; LMSpeed)
2. **Guards collapsed sources** — if a source returns 0 rows, or far fewer than the existing category (`SOURCE_COLLAPSE_RATIO`, default 50%), keep the previous entries, mark them `[stale as of YYYY-MM-DD]`, and log `SOURCE UNHEALTHY` to stderr. Do not empty a category because a scraper broke.
3. **Syncs evidence** — updates evidence strings on existing models (e.g. price changes, new throughput data) and appends `Fetched YYYY-MM-DD.`
4. **Prunes** models that no longer meet category thresholds, or whose stored score fails the sanity check (e.g. tokens/sec above `FAST_MAX_THROUGHPUT`)
5. **Adds** missing models that now qualify
6. **Re-sorts** all data-driven categories by score

Use `--dry-run` to preview changes without writing. Run periodically (e.g. weekly) to keep categories current.

When `--refresh-all` runs successfully (not with `--dry-run`), it also updates the "Last updated" date on the methodology page (`/help-me-choose-methodology`).

### Single-model mode

```bash
python scripts/research_model_benchmarks.py <model_id> [--dry-run]
```

Called automatically when models are added via the admin panel. Evaluates one model against all data-driven categories.

### Category thresholds

Data-driven categories apply qualification thresholds to maintain quality:

| Category | Threshold | Constant |
|----------|-----------|----------|
| Best value | &lt; $1.00/1M tokens avg | `COST_EFFECTIVE_MAX_PRICE` |
| Fastest responses | ≥ 50 and ≤ 2500 tokens/sec | `FAST_MIN_THROUGHPUT`, `FAST_MAX_THROUGHPUT` |
| Coding | Percentile ≥ 1 within the board that supplied the row | `CODING_MIN_SWE_BENCH_PRO` |
| Math | Every matched Arena Score (human preference, not an exam percent) | — |
| Reasoning | Arena Score ≥ 80 (the old MMLU-Pro floor; Arena Scores are about 1000–1600, so it does not drop them) | `REASONING_MIN_MMLU_PRO` |
| Writing | Arena Score ≥ 1390 (same numeric floor as the previous Elo cutoff) | `WRITING_MIN_ELO` |
| Long context | Percentile ≥ 30 within the board that supplied the row | `LONG_CONTEXT_MIN_MRCR` |
| Best for vision | ≥ 1060 Vision Arena score | `VISION_MIN_ARENA` |
| Legal | Every matched percentile | — |
| Multilingual | Every matched Arena Score | — |
| Medical | Every matched Arena Score. Not a HealthBench percent. | — |

### Scraper notes

- **Source-health guard:** `--refresh-all` never wipes a category when the live fetch is empty or collapses to far fewer rows than the current list. Existing rows stay, evidence is marked `[stale as of YYYY-MM-DD]`, and the script prints `ERROR: SOURCE UNHEALTHY [...]` on stderr.
- **Sanity check:** `is_plausible_score` rejects scrape artifacts. Fastest-responses drops values above `FAST_MAX_THROUGHPUT` (2500 t/s). The old weekly LMSpeed board mixed unofficial proxy endpoints and produced Sonnet 4.6 at 13,496 t/s.
- **Fetch date:** successful evidence updates append `Fetched YYYY-MM-DD.` The date lives on the evidence string so we do not need a new TypeScript field.
- **LMSpeed:** `lmspeed.net/leaderboard/best-throughput-models-weekly` (and monthly) currently render "No leaderboard data yet" and are Cloudflare-protected (bare clients often get 403). The current public equivalent is [`/leaderboard/model-speed`](https://lmspeed.net/leaderboard/model-speed) (Benchize / Artificial Analysis, one row per model, sane t/s). A free LMSpeed JSON API exists but requires an API key we do not ship. When the HTML fetch 403s, the guard keeps the previous Fastest list and marks it stale.
- **LMArena boards** are read from `lmarena-ai/leaderboard-dataset` (datasets-server filter, `latest` split, newest `leaderboard_publish_date` only). The arena.ai HTML pages are JavaScript and are not scraped. Vision uses `vision_style_control`, not the older unstyled `vision` config.
- **Version matching** lives in `backend/scripts/benchmark_matching.py`. A leaderboard row is stored on a lineup model only when the version tokens match. `4.6` is not `4.7`, `5` is not `5.5`, `2.1` is not `2.5`, and release code `2405` is not `2508`. Effort tags and snapshot dates (`20251001`) are the same version. Explicit alias dicts are rejected by unit test when they point at a different version.
- **Creative Writing:** the February 2026 KEAR blog is only a fallback if the LMArena fetch returns no rows.
- **Text-to-Image Arena:** the scraper prefers the LMArena dataset and falls back to the KEAR blog table.
- **LegalBench** is parsed from `https://www.vals.ai/benchmarks/legal_bench`. Models missing there are filled from LMArena legal and government prompts, as a percentile.
- **SWE-Bench Pro** is the coding fallback, parsed from the Scale Labs page, with a static HTML fallback at [scaleapi.github.io/SWE-bench_Pro-os](https://scaleapi.github.io/SWE-bench_Pro-os/). Code Arena wins when a model is on both.
- **Long context** no longer uses the sparse llmdb MRCR table. Document Arena is primary; longer-query fills models that snapshot does not list.
- **Medical** uses LMArena medicine and healthcare prompts. HealthBench is not fetched: the OpenAI page returns 403 and there is no public leaderboard JSON. Do not copy blog numbers into this category by hand.

### Registry / lineup sync

The active lineup is `models_by_provider` in `backend/data/models_registry.json`. CI fails if Help Me Choose ranks a model that is not in that lineup (frontend unit test plus this script). Use `--fix` to remove missing models or apply `MODEL_ID_ALIASES` for renames.

`research_model_benchmarks.py --refresh-all` and `--sync-lineup` drop rankings for models that left the lineup. Lineup models that have no rankings are printed as a report only (not an error — they still need public benchmark scores before they can be added). `--sync-lineup` is local files only and makes no API calls.

## Manual Curation Guide

Some categories cannot be fully automated because their data sources don't expose structured, scrapable leaderboards. These categories require periodic manual review.

### When to manually curate

- After a major model release (new frontier model from OpenAI, Anthropic, Google, etc.)
- When a benchmark source publishes updated results
- When `--refresh-all` reports 0 models fetched for a category that should have data (indicates a broken scraper)

### Categories that used to be hand-maintained

Medical, multilingual, and long context are fetched with the other categories. Do not paste HealthBench, Global-MMLU, or MRCR percents into those lists: a hand-copied exam percent would be sorted against an Arena Score or a percentile.

#### Medical
`industry_medicine_and_healthcare` on the LMArena text board. The OpenAI HealthBench page returns 403 and the Hugging Face leaderboard is empty.

#### Multilingual
LMArena `non_english`. Global-MMLU on llmdb is too sparse, and the Artificial Analysis multilingual index still tops out at older models.

#### Long context
LMArena Document Arena, with the longer-query category filling models that snapshot does not list. Fiction.LiveBench, RULER, and the public MRCR tables do not include the 2026 frontier models.

### Manual curation workflow

1. **Find the benchmark score** from a published, well-respected source
2. **Verify the model exists** in `backend/data/models_registry.json`
3. **Edit** `frontend/src/data/helpMeChooseRecommendations.ts` — find the category and add an entry:
   ```typescript
   { modelId: 'provider/model-name', evidence: 'BenchmarkName (source): SCORE.' },
   ```
4. **Validate** by running:
   ```bash
   cd backend
   python scripts/sync_help_me_choose_with_registry.py
   ```
5. **Sort** will happen automatically on the next `--refresh-all` run, or you can manually place the entry in score order

### Evidence format conventions

- Always include the source name and URL context: `'BenchmarkName (source.com): SCORE.'`
- Use `%` for percentage scores: `'MMLU-Pro (awesomeagents.ai): 89.5%.'`
- Use `%` for MRCR v2 / LongBench v2: `'MRCR v2 4-needle 256K (awesomeagents.ai): 98%.'`
- Use `Arena Score` for a single LMArena board: `'Creative Writing (LMArena text, arena.ai): Arena Score 1525 (published 2026-11-22).'`
- Use a leading percentile when blending boards: `'Percentile 72.0% within this board. SWE-Bench Pro public (Scale Labs): 41.78%.'`
- Use `/100` for normalized scores: `'MRCR 1M (llmdb.com): 93/100.'`
- Use `$/1M tokens` for pricing: `'Avg. $0.22/1M tokens.'`
- Use `t/s` for throughput: `'LMSpeed (lmspeed.net): 1742 t/s.'`

## Image Generation Category

The "Best for image generation" category uses the LMArena Text-to-Image Arena (official Hugging Face dataset; human preference votes). The previous KEAR AI page at kearai.com/leaderboard/text-to-image 404s; a February 2026 blog snapshot remains as a fallback. When a user selects from this category, the model mode toggle automatically switches to "Image generation models". Text-only and image generation models cannot be mixed; a modal guides users to deselect one type before selecting the other.
