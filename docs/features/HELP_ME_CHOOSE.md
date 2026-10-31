# Help Me Choose – Decision Support Feature

The "Help me choose" feature provides decision support for model selection. Users can browse curated recommendations by use case, see benchmark evidence, and quickly apply top models from each category.

## Overview

A "Help me choose" button sits next to the Advanced button in the model selection area. Clicking it opens a dropdown with twelve categories displayed horizontally (stacking vertically on mobile). Each category lists models ranked by benchmark score (highest first). All models shown are strong in their category. Users can check individual models or use "Select top 3" per category; selections apply immediately and respect tier restrictions and `maxModelsLimit`.

**Categories:** Best for coding, Best for writing, Best for math, Best for reasoning, Best for long context, Best value (cost-effective), Fastest responses, Best for multilingual, Best for legal, Best for vision, Best for image generation, Best for medical.

**Inclusion rule:** Only models with numeric benchmark scores from well-respected, publicly available sources are included. Models without benchmark scores are not added. Each category has at least two models. Model IDs must exist in the active CompareIntel lineup: `models_by_provider` in `backend/data/models_registry.json` (the same catalog the frontend loads via `GET /models`). Tier allow-lists are subsets of that lineup, not a second catalog.

## Key Behaviors

- **Immediate selection:** Checkboxes toggle models directly; no Apply button. Same behavior as the main model selection area.
- **Evidence tooltips:** Hover over any model to see benchmark name, score, and source (e.g., "SWE-Bench Pro public (Scale Labs): 43.60%.").
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

| Category | Primary source | URL | Key metric | Automated? |
|----------|---------------|-----|------------|------------|
| **Coding** | SWE-Bench Pro public (Scale Labs) | https://labs.scale.com/leaderboard/swe_bench_pro_public | % Resolved (public split) | Yes |
| **Writing** | Creative Writing Arena (KEAR blog snapshot) | https://blog.kearai.com/leaderboard/creative-writing | Elo rating | Yes |
| **Math** | MATH, AIME-2025, GSM8K (llmdb) | https://llmdb.com/benchmarks/math, https://llmdb.com/benchmarks/aime-2025, https://llmdb.com/benchmarks/gsm8k | % (0–100) | Yes (sparse) |
| **Reasoning** | MMLU-Pro | https://awesomeagents.ai/leaderboards/mmlu-pro-leaderboard/ | Overall % | Yes |
| **Long context** | MRCR 1M (llmdb) | https://llmdb.com/benchmarks/mrcr-1m | Score /100 | Yes (sparse) |
| **Best value** | OpenRouter pricing API | https://openrouter.ai/api/v1/models?output_modalities=all | Avg $/1M tokens | Yes |
| **Fastest responses** | LMSpeed model-speed | https://lmspeed.net/leaderboard/model-speed | Tokens/second | Yes |
| **Multilingual** | Global-MMLU (llmdb) | https://llmdb.com/benchmarks/global-mmlu | 42-language score | Yes (sparse) |
| **Legal** | LegalBench (VALS.ai) | https://www.vals.ai/benchmarks/legal_bench | % across 161 tasks | Yes |
| **Best for vision** | Vision Arena (LMArena) | https://lmarena.ai/leaderboard/vision | Arena Score | Yes |
| **Image generation** | Text-to-Image Arena (LMArena HF) | https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset | Arena Rating | Yes |
| **Medical** | HealthBench (OpenAI) | https://openai.com/index/healthbench | Physician-rated % | **Manual only** |

**Long context note:** MRCR 1M has sparse coverage (~7 models). See "Long context (MRCR 1M and alternatives)" in Manual Curation Guide for secondary sources: Awesome Agents (MRCR v2, LongBench v2), model announcements, LongBench v2, RULER.

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

1. **Fetches** current data from public sources (SWE-Bench Pro public, OpenRouter, LMSpeed, MMLU-Pro, Creative Writing Arena, MATH/AIME-2025/GSM8K, MRCR 1M, Awesome Agents long-context, LegalBench, Global-MMLU, Vision Arena, Text-to-Image Arena)
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
| Coding | ≥ 1% SWE-Bench Pro public (% resolved; scores are much lower than SWE-Bench Verified) | `CODING_MIN_SWE_BENCH_PRO` |
| Math | MATH or GSM8K ≥ 85% (when MATH not available) | `MATH_MIN_GSM8K` |
| Reasoning | ≥ 80% MMLU-Pro | `REASONING_MIN_MMLU_PRO` |
| Writing | ≥ 1390 Elo | `WRITING_MIN_ELO` |
| Long context | ≥ 30/100 MRCR | `LONG_CONTEXT_MIN_MRCR` |
| Best for vision | ≥ 1060 Vision Arena score | `VISION_MIN_ARENA` |
| Legal | No threshold (all scored models included) | — |
| Multilingual | No threshold (all scored models included) | — |
| Medical | Manual only — no scraper | — |

### Scraper notes

- **Source-health guard:** `--refresh-all` never wipes a category when the live fetch is empty or collapses to far fewer rows than the current list. Existing rows stay, evidence is marked `[stale as of YYYY-MM-DD]`, and the script prints `ERROR: SOURCE UNHEALTHY [...]` on stderr.
- **Sanity check:** `is_plausible_score` rejects scrape artifacts. Fastest-responses drops values above `FAST_MAX_THROUGHPUT` (2500 t/s). The old weekly LMSpeed board mixed unofficial proxy endpoints and produced Sonnet 4.6 at 13,496 t/s.
- **Fetch date:** successful evidence updates append `Fetched YYYY-MM-DD.` The date lives on the evidence string so we do not need a new TypeScript field.
- **LMSpeed:** `lmspeed.net/leaderboard/best-throughput-models-weekly` (and monthly) currently render "No leaderboard data yet" and are Cloudflare-protected (bare clients often get 403). The current public equivalent is [`/leaderboard/model-speed`](https://lmspeed.net/leaderboard/model-speed) (Benchize / Artificial Analysis, one row per model, sane t/s). A free LMSpeed JSON API exists but requires an API key we do not ship. When the HTML fetch 403s, the guard keeps the previous Fastest list and marks it stale.
- **Creative Writing Arena:** `kearai.com/leaderboard/creative-writing` **404s**. Content moved to [blog.kearai.com/leaderboard/creative-writing](https://blog.kearai.com/leaderboard/creative-writing) (February 2026 snapshot, parseable HTML table). The live equivalent is [arena.ai/leaderboard/chat/text/creative-writing](https://arena.ai/leaderboard/chat/text/creative-writing) (JS-rendered; not scraped).
- **Text-to-Image Arena:** `kearai.com/leaderboard/text-to-image` **404s**. The blog snapshot remains at [blog.kearai.com/leaderboard/text-to-image](https://blog.kearai.com/leaderboard/text-to-image). The scraper prefers the official LMArena Hugging Face dataset (`lmarena-ai/leaderboard-dataset`, `text_to_image` / `latest`) and falls back to the blog table.
- **MATH / GSM8K / Global-MMLU / MRCR:** still on llmdb.com, but coverage is sparse and the old row-wide regex captured version numbers (`Gemini 2.0 Pro` → `2.0%`). The parser now reads the Score column only and does not map Gemini 2.0 → 2.5 or o1 → o3. Math also merges [AIME-2025](https://llmdb.com/benchmarks/aime-2025) for current registry models. When the mapped set is still far smaller than the curated list, the guard keeps the existing rows.
- **LegalBench** URL changed from `/legal_bench-01-30-2025` to `/legal_bench` (no date suffix). The scraper follows redirects.
- **Vision Arena** scores are fetched from the official `lmarena-ai/leaderboard-dataset` on Hugging Face (vision subset, latest split). Model slugs on the arena often differ from OpenRouter IDs; update `VISION_ARENA_SLUG_TO_MODEL_ID` when adding models.
- **Name mapping dicts** (`SWE_BENCH_PRO_SLUG_TO_MODEL_ID`, `LMSPEED_NAME_TO_MODEL_ID`, `WRITING_NAME_TO_MODEL_ID`, `MMLU_PRO_NAME_TO_MODEL_ID`, `VISION_ARENA_SLUG_TO_MODEL_ID`, `AWESOME_AGENTS_LONG_CONTEXT_NAME_TO_MODEL_ID`, etc.) resolve leaderboard display names that don't match registry names. Update these when adding new models or when leaderboard names change.
- **SWE-Bench Pro** leaderboard data is parsed from the Scale Labs Next.js page (RSC-embedded JSON); a static HTML fallback uses [scaleapi.github.io/SWE-bench_Pro-os](https://scaleapi.github.io/SWE-bench_Pro-os/) (subset of models).
- **Long context** merges MRCR 1M (llmdb) with Awesome Agents (MRCR v2, LongBench v2). MRCR 1M is primary; Awesome Agents adds models not on the llmdb leaderboard. Threshold ≥ 30 applies to both sources.

### Registry / lineup sync

The active lineup is `models_by_provider` in `backend/data/models_registry.json`. CI fails if Help Me Choose ranks a model that is not in that lineup (frontend unit test plus this script). Use `--fix` to remove missing models or apply `MODEL_ID_ALIASES` for renames.

`research_model_benchmarks.py --refresh-all` and `--sync-lineup` drop rankings for models that left the lineup. Lineup models that have no rankings are printed as a report only (not an error — they still need public benchmark scores before they can be added). `--sync-lineup` is local files only and makes no API calls.

## Manual Curation Guide

Some categories cannot be fully automated because their data sources don't expose structured, scrapable leaderboards. These categories require periodic manual review.

### When to manually curate

- After a major model release (new frontier model from OpenAI, Anthropic, Google, etc.)
- When a benchmark source publishes updated results
- When `--refresh-all` reports 0 models fetched for a category that should have data (indicates a broken scraper)

### Categories requiring manual attention

#### Medical (HealthBench)
**Why manual:** OpenAI's HealthBench page returns 403 (no public API). Scores come from OpenAI's published research papers and blog posts.

**How to update:**
1. Check https://openai.com/index/healthbench for updated results
2. Search for "HealthBench" in recent model announcement blog posts
3. Add entries to the `medical` category in `helpMeChooseRecommendations.ts`:
   ```
   { modelId: 'provider/model-id', evidence: 'HealthBench (OpenAI): XX%.' }
   ```
4. Run `python scripts/sync_help_me_choose_with_registry.py` to validate

#### Multilingual (Global-MMLU)
**Why semi-manual:** The llmdb.com leaderboard has very sparse coverage (often only 1-2 models). The scraper works but most models aren't listed.

**How to supplement:**
1. Check https://llmdb.com/benchmarks/global-mmlu for new entries
2. Check model release announcements for Global-MMLU scores
3. Add entries with evidence like: `'Global-MMLU (llmdb.com): XX.X%.'`

#### Long context (MRCR 1M and alternatives)
**Why semi-manual:** The llmdb.com MRCR 1M (Michelangelo) leaderboard lists ~7 models, mostly from Google. Many strong long-context models—including those excelling at 256K context—are absent from this 1M-only benchmark. Non-Google and frontier models (OpenAI, Anthropic, xAI, etc.) often publish long-context scores only in announcements.

**Determining factors for inclusion:**
- **Primary automated source:** MRCR 1M (llmdb.com) — 0–100 scale; measures retrieval at 1M tokens. Threshold: ≥ 30/100.
- **Secondary sources for manual curation** (when a model has no llmdb MRCR 1M entry):
  1. **Awesome Agents Long-Context Leaderboard** (https://awesomeagents.ai/leaderboards/long-context-benchmarks-leaderboard/) — Curated table combining MRCR v2 (8-needle 1M, 4-needle 256K), RULER, and LongBench v2. Use published scores from model rows; evidence format: `'MRCR v2 8-needle 1M (awesomeagents.ai): XX%.'` or `'MRCR v2 4-needle 256K (awesomeagents.ai): XX%.'` for models strong at 256K.
  2. **Model announcement blogs** — Anthropic, OpenAI, Google, xAI often publish MRCR, needle-in-a-haystack, or LongBench scores. Evidence: `'MRCR (OpenAI/Anthropic/Google): XX%.'` with source URL where possible.
  3. **LongBench v2** (https://longbench2.github.io/) — Tsinghua benchmark; 503 questions at 8K–2M words. Evidence: `'LongBench v2 (longbench2.github.io): XX%.'`
  4. **RULER** (NVIDIA) — Synthetic benchmark; 13 task types. Use if scores are published in papers or leaderboards.
  5. **Stanford HELM Long Context** — When available, check https://crfm.stanford.edu/ for multi-benchmark evaluations.

**Note on score scales:** MRCR 1M (llmdb) uses 0–100; MRCR v2 (Awesome Agents) typically uses 0–100%. When combining sources, preserve the original scale in the evidence string for clarity.

**How to supplement:**
1. Check https://llmdb.com/benchmarks/mrcr-1m for new entries
2. Review https://awesomeagents.ai/leaderboards/long-context-benchmarks-leaderboard/ for models with MRCR v2 or LongBench v2 scores
3. Search model release announcements for "MRCR", "needle-in-a-haystack", "LongBench", or "NIAH"
4. Add entries with evidence like: `'MRCR 1M (llmdb.com): XX/100.'` or `'MRCR v2 4-needle 256K (awesomeagents.ai): XX%.'`

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
- Use `Elo` for arena rankings: `'Creative Writing Arena (kearai.com): 1478 Elo.'`
- Use `/100` for normalized scores: `'MRCR 1M (llmdb.com): 93/100.'`
- Use `$/1M tokens` for pricing: `'Avg. $0.22/1M tokens.'`
- Use `t/s` for throughput: `'LMSpeed (lmspeed.net): 1742 t/s.'`

## Image Generation Category

The "Best for image generation" category uses the LMArena Text-to-Image Arena (official Hugging Face dataset; human preference votes). The previous KEAR AI page at kearai.com/leaderboard/text-to-image 404s; a February 2026 blog snapshot remains as a fallback. When a user selects from this category, the model mode toggle automatically switches to "Image generation models". Text-only and image generation models cannot be mixed; a modal guides users to deselect one type before selecting the other.
