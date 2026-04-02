# Help Me Choose – Decision Support Feature

The "Help me choose" feature provides decision support for model selection. Users can browse curated recommendations by use case, see benchmark evidence, and quickly apply top models from each category.

## Overview

A "Help me choose" button sits next to the Advanced button in the model selection area. Clicking it opens a dropdown with six categories displayed horizontally (stacking vertically on mobile). Each category lists models ranked by benchmark score (highest first). All models shown are strong in their category. Users can check individual models or use "Select top 3" per category; selections apply immediately and respect tier restrictions and `maxModelsLimit`.

**Categories:** Best for coding, Best for writing, Best for math, Best for reasoning, Best for long context, Best value (cost-effective), Fastest responses, Best for multilingual, Best for legal, Best for image generation, Best for medical.

**Inclusion rule:** Only models with numeric benchmark scores from well-respected, publicly available sources are included. Models without benchmark scores are not added. Each category has at least two models. Model IDs must exist in `models_registry.json`.

## Key Behaviors

- **Immediate selection:** Checkboxes toggle models directly; no Apply button. Same behavior as the main model selection area.
- **Evidence tooltips:** Hover over any model to see benchmark name, score, and source (e.g., "SWE-Bench Verified (swebench.com): 80.9%").
- **Tier restrictions:** Models unavailable to the user's tier are disabled with a lock icon and tooltip.
- **Visual feedback:** Selected models use primary-tinted styling; category headers containing selected models are highlighted. On open, the dropdown scrolls to the first selected model.
- **Mutual exclusivity:** Only one of Help me choose or Advanced can be open at a time.

## Methodology Page

A public page at `/help-me-choose-methodology` (linked in the footer) explains inclusion criteria, evidence sources by category, ordering rules, and how recommendations are updated.

## Evidence Sources

| Category | Primary source | URL | Key metric | Automated? |
|----------|---------------|-----|------------|------------|
| **Coding** | SWE-Bench Verified (OpenLM) | https://openlm.ai/swe-bench/ | % Resolved | Yes |
| **Writing** | Creative Writing Arena | https://kearai.com/leaderboard/creative-writing | Elo rating | Yes |
| **Math** | MATH, GSM8K (llmdb) | https://llmdb.com/benchmarks/math, https://llmdb.com/benchmarks/gsm8k | % (0–100) | Yes |
| **Reasoning** | MMLU-Pro | https://awesomeagents.ai/leaderboards/mmlu-pro-leaderboard/ | Overall % | Yes |
| **Long context** | MRCR 1M (llmdb) | https://llmdb.com/benchmarks/mrcr-1m | Score /100 | Yes (sparse) |
| **Best value** | OpenRouter pricing API | https://openrouter.ai/api/v1/models | Avg $/1M tokens | Yes |
| **Fastest responses** | LMSpeed | https://lmspeed.net/leaderboard/best-throughput-models-weekly | Tokens/second | Yes |
| **Multilingual** | Global-MMLU (llmdb) | https://llmdb.com/benchmarks/global-mmlu | 42-language score | Yes (sparse) |
| **Legal** | LegalBench (VALS.ai) | https://www.vals.ai/benchmarks/legal_bench | % across 161 tasks | Yes |
| **Image generation** | Text-to-Image Arena (KEAR AI) | https://kearai.com/leaderboard/text-to-image | Arena Rating | Yes |
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
| Benchmark research script | `backend/scripts/research_model_benchmarks.py` |
| Registry sync script | `backend/scripts/sync_help_me_choose_with_registry.py` |
| Admin integration | `backend/app/routers/admin/models_management.py` |

## Automation

### How `--refresh-all` works

```bash
python scripts/research_model_benchmarks.py --refresh-all [--dry-run]
```

This command re-evaluates ALL registry models against ALL data-driven categories:

1. **Fetches** current data from 10 external sources (SWE-bench, OpenRouter, LMSpeed, MMLU-Pro, Creative Writing Arena, MATH/GSM8K, MRCR 1M, Awesome Agents long-context, LegalBench, Global-MMLU)
2. **Syncs evidence** — updates stale evidence strings on existing models (e.g. price changes, new throughput data)
3. **Prunes** models that no longer meet category thresholds
4. **Adds** missing models that now qualify
5. **Re-sorts** all data-driven categories by score

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
| Fastest responses | ≥ 50 tokens/sec | `FAST_MIN_THROUGHPUT` |
| Coding | ≥ 55% SWE-Bench Verified | `CODING_MIN_SWE_BENCH` |
| Math | MATH or GSM8K ≥ 85% (when MATH not available) | `MATH_MIN_GSM8K` |
| Reasoning | ≥ 80% MMLU-Pro | `REASONING_MIN_MMLU_PRO` |
| Writing | ≥ 1390 Elo | `WRITING_MIN_ELO` |
| Long context | ≥ 30/100 MRCR | `LONG_CONTEXT_MIN_MRCR` |
| Legal | No threshold (all scored models included) | — |
| Multilingual | No threshold (all scored models included) | — |
| Medical | Manual only — no scraper | — |

### Scraper notes

- **LMSpeed** renders as a Next.js React Server Components stream. The scraper parses RSC-encoded JSX rather than static HTML tables.
- **LegalBench** URL changed from `/legal_bench-01-30-2025` to `/legal_bench` (no date suffix). The scraper follows redirects.
- **Global-MMLU** and **MRCR 1M** leaderboards on llmdb.com have sparse coverage (few models listed).
- **Creative Writing Arena** lists many model variants (thinking, non-thinking, dated snapshots). The scraper takes the best score per registry model.
- **Name mapping dicts** (`LMSPEED_NAME_TO_MODEL_ID`, `WRITING_NAME_TO_MODEL_ID`, `MMLU_PRO_NAME_TO_MODEL_ID`, `AWESOME_AGENTS_LONG_CONTEXT_NAME_TO_MODEL_ID`, etc.) resolve leaderboard display names that don't match registry names. Update these when adding new models or when leaderboard names change.
- **Long context** merges MRCR 1M (llmdb) with Awesome Agents (MRCR v2, LongBench v2). MRCR 1M is primary; Awesome Agents adds models not on the llmdb leaderboard. Threshold ≥ 30 applies to both sources.

### Registry sync

CI runs `sync_help_me_choose_with_registry.py` to validate model IDs against `models_registry.json`. Use `--fix` to remove missing models or apply `MODEL_ID_ALIASES` for renames.

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

The "Best for image generation" category uses the KEAR AI Text-to-Image Arena (human preference votes). When a user selects from this category, the model mode toggle automatically switches to "Image generation models". Text-only and image generation models cannot be mixed; a modal guides users to deselect one type before selecting the other.
