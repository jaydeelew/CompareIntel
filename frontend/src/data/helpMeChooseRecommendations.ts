/**
 * Help Me Choose - Model recommendations by use case
 *
 * Categories are displayed horizontally. Each category lists models ordered
 * ranked by benchmark score based on published benchmarks. Models may appear in multiple
 * categories; users select individual models.
 *
 * Inclusion rule: Only models with numeric benchmark scores from well-respected,
 * publicly available sources (SWE-Bench Pro public, MMLU-Pro, Vision Arena, etc.)
 * are included. Models without benchmark scores are not added. Ranked model IDs
 * must exist in the active lineup (models_registry.json models_by_provider).
 *
 * Evidence format: Each entry includes the source (benchmark/reference) and
 * score. See /help-me-choose-methodology for full methodology.
 */

export interface HelpMeChooseModelEntry {
  /** Model ID matching backend models registry */
  modelId: string
  /** Evidence/citation for tooltip (benchmark name, score, source URL) */
  evidence: string
}

export interface HelpMeChooseCategory {
  id: string
  label: string
  description: string
  /** Models ordered best-first based on benchmarks */
  models: HelpMeChooseModelEntry[]
  /** Optional tooltip for category-level info icon (e.g. how cost-effective or fast differs) */
  categoryInfoTooltip?: string
}

/**
 * Categories displayed left-to-right. Order within each category: best model
 * first, descending by benchmark score. Only models with numeric benchmark
 * evidence are included.
 */
/**
 * EDITING: When adding or updating models, edit ONLY the array below (after "= [").
 * The declaration must stay as: HelpMeChooseCategory[] = [
 * Do NOT add a duplicate block or put content between the type and "= [".
 */
export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [
  {
    id: 'cost-effective',
    label: 'Best value',
    description: 'Lowest cost per 1M tokens for high-volume use (under $1/1M)',
    categoryInfoTooltip:
      'Ranked by average cost per million tokens (OpenRouter pricing: prompt + completion). Only models under $1/1M tokens are included. Lower cost = better value. Prices vary by provider.',
    models: [
      { modelId: 'z-ai/glm-5.3-flash', evidence: 'Avg. $0.06/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'microsoft/phi-4', evidence: 'Avg. $0.11/1M tokens. Fetched 2026-11-09.' },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence: 'Avg. $0.14/1M tokens. Fetched 2026-11-09.',
      },
      {
        modelId: 'minimax/minimax-m3.1-flash',
        evidence: 'Avg. $0.19/1M tokens. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemma-4-26b-a4b-it',
        evidence: 'Avg. $0.20/1M tokens. Fetched 2026-11-09.',
      },
      {
        modelId: 'mistralai/mistral-small-3.2-24b-instruct',
        evidence: 'Avg. $0.20/1M tokens. Fetched 2026-11-09.',
      },
      {
        modelId: 'meta-llama/llama-4-scout',
        evidence: 'Avg. $0.20/1M tokens. Fetched 2026-11-09.',
      },
      {
        modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
        evidence: 'Avg. $0.20/1M tokens. Fetched 2026-11-09.',
      },
      { modelId: 'xiaomi/mimo-v2.6-flash', evidence: 'Avg. $0.21/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'openai/gpt-5-nano', evidence: 'Avg. $0.22/1M tokens. Fetched 2026-11-09.' },
      {
        modelId: 'deepseek/deepseek-v4.1-flash-1017',
        evidence: 'Avg. $0.25/1M tokens. Fetched 2026-11-10.',
      },
      { modelId: 'google/gemma-3-27b-it', evidence: 'Avg. $0.26/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'google/gemma-4-31b-it', evidence: 'Avg. $0.30/1M tokens. Fetched 2026-11-09.' },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence: 'Avg. $0.30/1M tokens. Fetched 2026-11-09.',
      },
      { modelId: 'openai/gpt-6-luna', evidence: 'Avg. $0.30/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'deepseek/deepseek-v3.2', evidence: 'Avg. $0.32/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'openai/gpt-oss-120b', evidence: 'Avg. $0.38/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'openai/gpt-4o-mini', evidence: 'Avg. $0.38/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'qwen/qwen3-coder-next', evidence: 'Avg. $0.46/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'qwen/qwen3-coder-flash', evidence: 'Avg. $0.58/1M tokens. Fetched 2026-11-09.' },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence: 'Avg. $0.60/1M tokens. Fetched 2026-11-09.',
      },
      {
        modelId: 'mistralai/codestral-2508',
        evidence: 'Avg. $0.60/1M tokens. Fetched 2026-11-09.',
      },
      { modelId: 'qwen/qwen3-coder', evidence: 'Avg. $0.65/1M tokens. Fetched 2026-11-09.' },
      {
        modelId: 'meta-llama/llama-4-maverick',
        evidence: 'Avg. $0.68/1M tokens. Fetched 2026-11-09.',
      },
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence: 'Avg. $0.69/1M tokens. Fetched 2026-11-09.',
      },
      { modelId: 'openai/gpt-5.6-luna', evidence: 'Avg. $0.70/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'z-ai/glm-5.3', evidence: 'Avg. $0.73/1M tokens. Fetched 2026-11-09.' },
      { modelId: 'minimax/minimax-m2.5', evidence: 'Avg. $0.75/1M tokens. Fetched 2026-11-09.' },
      {
        modelId: 'google/gemini-3.1-flash-lite-preview',
        evidence: 'Avg. $0.88/1M tokens. Fetched 2026-11-09.',
      },
    ],
  },
  {
    id: 'fast',
    label: 'Fastest responses',
    description: 'Highest throughput (tokens per second)',
    categoryInfoTooltip:
      'Ranked by inference throughput (tokens/second) from LMSpeed and API benchmarks. Higher throughput = faster streaming responses. Speed varies by provider and load.',
    models: [
      {
        modelId: 'minimax/minimax-m2.5',
        evidence: 'LMSpeed (lmspeed.net): 729 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'openai/gpt-5',
        evidence: 'LMSpeed (lmspeed.net): 490 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence: 'LMSpeed (lmspeed.net): 263 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence: 'LMSpeed (lmspeed.net): 205 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'openai/gpt-5.1-codex-mini',
        evidence: 'LMSpeed (lmspeed.net): 205 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'openai/gpt-5.1-codex-max',
        evidence: 'LMSpeed (lmspeed.net): 190 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'LMSpeed (lmspeed.net): 171 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'LMSpeed (lmspeed.net): 160 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'qwen/qwen3-coder-next',
        evidence: 'LMSpeed (lmspeed.net): 147 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence: 'LMSpeed (lmspeed.net): 138 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence: 'LMSpeed (lmspeed.net): 116 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'qwen/qwen3-coder-flash',
        evidence: 'LMSpeed (lmspeed.net): 110 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'LMSpeed (lmspeed.net): 97 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'LMSpeed (lmspeed.net): 96 t/s. [stale as of 2026-11-09]',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence: 'LMSpeed (lmspeed.net): 89 t/s. [stale as of 2026-11-09]',
      },
    ],
  },
  {
    id: 'coding',
    label: 'Best for coding',
    description: 'Code generation, debugging, refactoring',
    categoryInfoTooltip:
      'Ranked by SWE-Bench Pro public (Scale Labs): long-horizon software engineering in real repositories. Higher % = more tasks resolved. Scores are not comparable to SWE-Bench Verified. See labs.scale.com/leaderboard/swe_bench_pro_public.',
    models: [
      {
        modelId: 'openai/gpt-5.4',
        evidence: 'SWE-Bench Pro public (Scale Labs): 59.10%. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'SWE-Bench Pro public (Scale Labs): 51.90%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'SWE-Bench Pro public (Scale Labs): 46.10%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence: 'SWE-Bench Pro public (Scale Labs): 41.78%. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence: 'SWE-Bench Pro public (Scale Labs): 39.45%. Fetched 2026-11-09.',
      },
      {
        modelId: 'qwen/qwen3-coder',
        evidence: 'SWE-Bench Pro public (Scale Labs): 38.70%. Fetched 2026-11-09.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence: 'SWE-Bench Pro public (Scale Labs): 36.81%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'SWE-Bench Pro public (Scale Labs): 34.63%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'SWE-Bench Pro public (Scale Labs): 29.94%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence: 'SWE-Bench Pro public (Scale Labs): 16.20%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemma-3-27b-it',
        evidence: 'SWE-Bench Pro public (Scale Labs): 11.38%. Fetched 2026-11-09.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence: 'SWE-Bench Pro public (Scale Labs): 9.67%. Fetched 2026-11-09.',
      },
      {
        modelId: 'meta-llama/llama-4-maverick',
        evidence: 'SWE-Bench Pro public (Scale Labs): 5.24%. Fetched 2026-11-09.',
      },
      {
        modelId: 'mistralai/codestral-2508',
        evidence: 'SWE-Bench Pro public (Scale Labs): 1.51%. Fetched 2026-11-09.',
      },
    ],
  },
  {
    id: 'writing',
    label: 'Best for writing',
    description: 'Prose, tone, character consistency',
    categoryInfoTooltip:
      'Ranked by Creative Writing Arena (kearai.com) Elo ratings and Mazur Writing Score. Higher score = stronger prose and narrative generation.',
    models: [
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'Creative Writing Arena (kearai.com): 1490 Elo. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'Creative Writing Arena (kearai.com): 1478 Elo. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'Creative Writing Arena (kearai.com): 1456 Elo. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Creative Writing Arena (kearai.com): 1450 Elo. Fetched 2026-11-09.',
      },
      {
        modelId: 'x-ai/grok-4.20',
        evidence: 'Creative Writing Arena (kearai.com): 1434 Elo. Fetched 2026-11-09.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence: 'Creative Writing Arena (kearai.com): 1399 Elo. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'Creative Writing Arena (kearai.com): 1398 Elo. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'Creative Writing Arena (kearai.com): 1398 Elo. Fetched 2026-11-09.',
      },
    ],
  },
  {
    id: 'images',
    label: 'Best for vision',
    description: 'Image understanding — photos, diagrams, screenshots, charts',
    categoryInfoTooltip:
      'Ranked by Vision Arena (lmarena.ai), human preference votes on image+text prompts. Higher Arena Score = better at interpreting photos, diagrams, and screenshots. Required when you attach images to your prompt.',
    models: [
      {
        modelId: 'anthropic/claude-fable-5',
        evidence: 'Vision Arena (lmarena.ai): 1326. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence: 'Vision Arena (lmarena.ai): 1324. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-fable-5.1',
        evidence: 'Vision Arena (lmarena.ai): 1322. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence: 'Vision Arena (lmarena.ai): 1318. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence: 'Vision Arena (lmarena.ai): 1317. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence: 'Vision Arena (lmarena.ai): 1317. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'Vision Arena (lmarena.ai): 1315. Fetched 2026-11-09.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence: 'Vision Arena (lmarena.ai): 1309. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence: 'Vision Arena (lmarena.ai): 1301. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence: 'Vision Arena (lmarena.ai): 1297. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'Vision Arena (lmarena.ai): 1296. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence: 'Vision Arena (lmarena.ai): 1296. Fetched 2026-11-09.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence: 'Vision Arena (lmarena.ai): 1295. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence: 'Vision Arena (lmarena.ai): 1295. Fetched 2026-11-09.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence: 'Vision Arena (lmarena.ai): 1288. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-6.1-sol',
        evidence: 'Vision Arena (lmarena.ai): 1286. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence: 'Vision Arena (lmarena.ai): 1284. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'Vision Arena (lmarena.ai): 1282. Fetched 2026-11-09.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence: 'Vision Arena (lmarena.ai): 1282. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.6-sol',
        evidence: 'Vision Arena (lmarena.ai): 1282. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-6-astra',
        evidence: 'Vision Arena (lmarena.ai): 1279. Fetched 2026-11-09.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence: 'Vision Arena (lmarena.ai): 1263. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Vision Arena (lmarena.ai): 1263. Fetched 2026-11-09.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence: 'Vision Arena (lmarena.ai): 1262. Fetched 2026-11-09.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence: 'Vision Arena (lmarena.ai): 1259. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.6-luna',
        evidence: 'Vision Arena (lmarena.ai): 1256. Fetched 2026-11-09.',
      },
      {
        modelId: 'xiaomi/mimo-v2.5',
        evidence: 'Vision Arena (lmarena.ai): 1248. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'Vision Arena (lmarena.ai): 1246. Fetched 2026-11-09.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence: 'Vision Arena (lmarena.ai): 1243. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.1-flash-lite-preview',
        evidence: 'Vision Arena (lmarena.ai): 1240. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'Vision Arena (lmarena.ai): 1235. Fetched 2026-11-09.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence: 'Vision Arena (lmarena.ai): 1230. Fetched 2026-11-09.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence: 'Vision Arena (lmarena.ai): 1229. Fetched 2026-11-09.',
      },
      { modelId: 'openai/o3', evidence: 'Vision Arena (lmarena.ai): 1214. Fetched 2026-11-09.' },
      {
        modelId: 'openai/gpt-6-luna',
        evidence: 'Vision Arena (lmarena.ai): 1211. Fetched 2026-11-09.',
      },
      { modelId: 'openai/gpt-5', evidence: 'Vision Arena (lmarena.ai): 1208. Fetched 2026-11-09.' },
      {
        modelId: 'openai/gpt-5-mini',
        evidence: 'Vision Arena (lmarena.ai): 1203. Fetched 2026-11-09.',
      },
      {
        modelId: 'mistralai/mistral-medium-3.1',
        evidence: 'Vision Arena (lmarena.ai): 1172. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemma-3-27b-it',
        evidence: 'Vision Arena (lmarena.ai): 1164. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence: 'Vision Arena (lmarena.ai): 1159. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-4o-mini',
        evidence: 'Vision Arena (lmarena.ai): 1065. Fetched 2026-11-09.',
      },
    ],
  },
  {
    id: 'image-generation',
    label: 'Best for image generation',
    description: 'Text-to-image — create images from prompts',
    categoryInfoTooltip:
      'Ranked by Text-to-Image Arena (kearai.com), human preference votes from creators. Higher Arena Rating = better at understanding creative intent.',
    models: [
      {
        modelId: 'google/gemini-nano-banana-2.1',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1328. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.1-flash-image',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1257. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3-pro-image',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1246. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5-image',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1236. Fetched 2026-11-09.',
      },
      {
        modelId: 'black-forest-labs/flux.2-max',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1161. Fetched 2026-11-09.',
      },
      {
        modelId: 'black-forest-labs/flux.2-flex',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1156. Fetched 2026-11-09.',
      },
      {
        modelId: 'black-forest-labs/flux.2-pro',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1153. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-flash-image',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1148. Fetched 2026-11-09.',
      },
      {
        modelId: 'bytedance-seed/seedream-4.5',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1148. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5-image-mini',
        evidence: 'Text-to-Image Arena (lmarena.ai): 1109. Fetched 2026-11-09.',
      },
      {
        modelId: 'black-forest-labs/flux.2-klein-4b',
        evidence: 'Text-to-Image Arena (kearai.com): 1026.',
      },
    ],
  },
  {
    id: 'math',
    label: 'Best for math',
    description: 'Arithmetic, algebra, competition math, multi-step problem solving',
    categoryInfoTooltip:
      'Ranked by MATH benchmark (llmdb.com), 12.5K competition mathematics problems. Higher % = better at multi-step math reasoning. GSM8K used when MATH not available.',
    models: [
      {
        modelId: 'openai/gpt-oss-120b',
        evidence: 'AIME-2025 (llmdb.com): 97.9%. Fetched 2026-11-09.',
      },
      { modelId: 'openai/o3', evidence: 'MATH (llmdb.com): 94.8%.' },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence: 'MATH (llmdb.com): 90.2%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'AIME-2025 (llmdb.com): 83.0%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'AIME-2025 (llmdb.com): 72.0%. Fetched 2026-11-09.',
      },
    ],
  },
  {
    id: 'reasoning',
    label: 'Best for reasoning',
    description: 'Math, logic, multi-step problem solving',
    categoryInfoTooltip:
      'Ranked by MMLU-Pro (awesomeagents.ai), a broad multi-domain reasoning benchmark. Higher % = better general knowledge and problem-solving.',
    models: [
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'MMLU-Pro (awesomeagents.ai): 89.8%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.2-pro',
        evidence: 'MMLU-Pro (awesomeagents.ai): 88.7%. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'MMLU-Pro (awesomeagents.ai): 88.2%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'MMLU-Pro (awesomeagents.ai): 87.5%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'MMLU-Pro (awesomeagents.ai): 86.3%. Fetched 2026-11-09.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence: 'MMLU-Pro (awesomeagents.ai): 84.6%. Fetched 2026-11-09.',
      },
    ],
  },
  {
    id: 'long-context',
    label: 'Best for long context',
    description: 'Large context windows (128K–1M+ tokens)',
    categoryInfoTooltip:
      'Ranked by MRCR 1M (llmdb.com), MRCR v2, and LongBench v2. Higher score = better long-context retrieval and reasoning.',
    models: [
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'MRCR v2 4-needle 256K (awesomeagents.ai): 98%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'MRCR 1M (llmdb.com): 93.0/100. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'MRCR v2 4-needle 256K (awesomeagents.ai): 90%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'MRCR v2 4-needle 256K (awesomeagents.ai): 85%. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'MRCR v2 4-needle 256K (awesomeagents.ai): 82%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'MRCR 1M (llmdb.com): 70.5/100. Fetched 2026-11-09.',
      },
    ],
  },
  {
    id: 'multilingual',
    label: 'Best for multilingual',
    description: 'Non-English languages, translation, cross-lingual understanding',
    categoryInfoTooltip:
      'Ranked by Global-MMLU (llmdb.com), a multilingual evaluation across 42 languages. Higher score = better performance in non-English contexts.',
    models: [
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence: 'Global-MMLU: 75.4%. Strong multilingual from Meta. [stale as of 2026-11-09]',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'Global-MMLU: 74.2%. Fast multilingual model. [stale as of 2026-11-09]',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'Global-MMLU: 72.1%. Frontier multilingual. [stale as of 2026-11-09]',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'Global-MMLU: 70.8%. Strong non-English support. [stale as of 2026-11-09]',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Global-MMLU (llmdb.com): 2.5%. [stale as of 2026-11-09]',
      },
    ],
  },
  {
    id: 'legal',
    label: 'Best for legal',
    description: 'Legal reasoning, contract analysis, statutory interpretation',
    categoryInfoTooltip:
      'Ranked by LegalBench (vals.ai) across 161 legal reasoning tasks. Higher % = stronger legal analysis and statutory interpretation.',
    models: [
      {
        modelId: 'anthropic/claude-fable-5',
        evidence: 'LegalBench (vals.ai): 88.56%. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-fable-5.1',
        evidence: 'LegalBench (vals.ai): 88.51%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-4-argon',
        evidence: 'LegalBench (vals.ai): 88.3%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'LegalBench (vals.ai): 87.03%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence: 'LegalBench (vals.ai): 86.99%. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence: 'LegalBench (vals.ai): 86.97%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5.6-sol',
        evidence: 'LegalBench (vals.ai): 86.97%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'LegalBench (vals.ai): 86.86%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence: 'LegalBench (vals.ai): 86.7%. Fetched 2026-11-09.',
      },
      { modelId: 'openai/gpt-5.5', evidence: 'LegalBench (vals.ai): 86.52%. Fetched 2026-11-09.' },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence: 'LegalBench (vals.ai): 86.21%. Fetched 2026-11-09.',
      },
      { modelId: 'openai/gpt-5.4', evidence: 'LegalBench (vals.ai): 86.04%. Fetched 2026-11-09.' },
      { modelId: 'openai/gpt-5', evidence: 'LegalBench (vals.ai): 86.02%. Fetched 2026-11-09.' },
      { modelId: 'x-ai/grok-4.5', evidence: 'LegalBench (vals.ai): 85.97%. Fetched 2026-11-09.' },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'LegalBench (vals.ai): 85.3%. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence: 'LegalBench (vals.ai): 85.25%. Fetched 2026-11-09.',
      },
      { modelId: 'z-ai/glm-5.3', evidence: 'LegalBench (vals.ai): 84.84%. Fetched 2026-11-09.' },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence: 'LegalBench (vals.ai): 84.74%. Fetched 2026-11-09.',
      },
      { modelId: 'x-ai/grok-4.3', evidence: 'LegalBench (vals.ai): 84.46%. Fetched 2026-11-09.' },
      { modelId: 'x-ai/grok-4.7', evidence: 'LegalBench (vals.ai): 84.39%. Fetched 2026-11-09.' },
      { modelId: 'z-ai/glm-5.2', evidence: 'LegalBench (vals.ai): 84.07%. Fetched 2026-11-09.' },
      { modelId: 'z-ai/glm-5', evidence: 'LegalBench (vals.ai): 84.06%. Fetched 2026-11-09.' },
      {
        modelId: 'openai/gpt-5.6-luna',
        evidence: 'LegalBench (vals.ai): 84.03%. Fetched 2026-11-09.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence: 'LegalBench (vals.ai): 83.93%. Fetched 2026-11-09.',
      },
      {
        modelId: 'google/gemini-3.1-flash-lite-preview',
        evidence: 'LegalBench (vals.ai): 83.76%. Fetched 2026-11-09.',
      },
      { modelId: 'openai/o3', evidence: 'LegalBench (vals.ai): 83.76%. Fetched 2026-11-09.' },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence: 'LegalBench (vals.ai): 83.57%. Fetched 2026-11-09.',
      },
      { modelId: 'openai/gpt-5.2', evidence: 'LegalBench (vals.ai): 82.76%. Fetched 2026-11-09.' },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'LegalBench (vals.ai): 82.12%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5-mini',
        evidence: 'LegalBench (vals.ai): 81.77%. Fetched 2026-11-09.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence: 'LegalBench (vals.ai): 81.24%. Fetched 2026-11-09.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence: 'LegalBench (vals.ai): 79.96%. Fetched 2026-11-09.',
      },
      { modelId: 'cohere/command-a', evidence: 'LegalBench (vals.ai): 79.7%. Fetched 2026-11-09.' },
      {
        modelId: 'xiaomi/mimo-v2.5',
        evidence: 'LegalBench (vals.ai): 78.89%. Fetched 2026-11-09.',
      },
      {
        modelId: 'meta-llama/llama-4-maverick',
        evidence: 'LegalBench (vals.ai): 77.81%. Fetched 2026-11-09.',
      },
      { modelId: 'x-ai/grok-4.20', evidence: 'LegalBench (vals.ai): 77.74%. Fetched 2026-11-09.' },
      {
        modelId: 'xiaomi/mimo-v2.5-pro',
        evidence: 'LegalBench (vals.ai): 77.13%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence: 'LegalBench (vals.ai): 75.94%. Fetched 2026-11-09.',
      },
      {
        modelId: 'meta-llama/llama-4-scout',
        evidence: 'LegalBench (vals.ai): 72.04%. Fetched 2026-11-09.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence: 'LegalBench (vals.ai): 65.96%. Fetched 2026-11-09.',
      },
      {
        modelId: 'mistralai/mistral-medium-3.1',
        evidence: 'LegalBench (vals.ai): 61.98%. Fetched 2026-11-09.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence: 'LegalBench (vals.ai): 50.13%. Fetched 2026-11-09.',
      },
    ],
  },
  {
    id: 'medical',
    label: 'Best for medical',
    description: 'Clinical knowledge, health information, medical reasoning',
    categoryInfoTooltip:
      'Ranked by HealthBench (OpenAI), physician-evaluated clinical conversation quality. Higher % = better medical reasoning. Scores from published research.',
    models: [
      {
        modelId: 'openai/o3',
        evidence: 'HealthBench (OpenAI): 60%. Physician-evaluated clinical conversations.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence: 'HealthBench Hard (OpenAI): 46%. Challenging clinical subset.',
      },
      { modelId: 'openai/gpt-5.2', evidence: 'HealthBench Hard (OpenAI): 42%.' },
      { modelId: 'google/gemini-2.5-pro', evidence: 'HealthBench Hard (OpenAI): 19%.' },
    ],
  },
]

/** Stable `id` for the "Best for vision" column (scroll Help me choose horizontally to this category). */
export const HELP_ME_CHOOSE_CATEGORY_IMAGES_ID = 'images' as const

/** Stable `id` for the "Best for image generation" (text-to-image) column. */
export const HELP_ME_CHOOSE_CATEGORY_IMAGE_GENERATION_ID = 'image-generation' as const

/** @deprecated Use HELP_ME_CHOOSE_CATEGORIES. Flattened for backwards compatibility during migration. */
export interface HelpMeChooseRecommendation {
  id: string
  label: string
  description: string
  modelIds: string[]
}

/** @deprecated Flatten categories to legacy format for any code still using it. */
export const HELP_ME_CHOOSE_RECOMMENDATIONS: HelpMeChooseRecommendation[] =
  HELP_ME_CHOOSE_CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.label,
    description: cat.description,
    modelIds: cat.models.map(m => m.modelId),
  }))
