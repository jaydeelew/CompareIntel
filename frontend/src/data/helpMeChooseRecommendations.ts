/**
 * Help Me Choose - Model recommendations by use case
 *
 * Categories are displayed horizontally. Each category lists models ordered
 * ranked by benchmark score based on published benchmarks. Models may appear in multiple
 * categories; users select individual models.
 *
 * Inclusion rule: Only models with numeric benchmark scores from well-respected,
 * publicly available sources (SWE-Bench, MMLU-Pro, Mazur Writing Score, etc.)
 * are included. Models without benchmark scores are not added.
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
      { modelId: 'cohere/command-r7b-12-2024', evidence: 'OpenRouter avg: $0.09/1M tokens.' },
      { modelId: 'microsoft/phi-4', evidence: 'OpenRouter avg: $0.10/1M tokens.' },
      { modelId: 'openai/gpt-oss-120b', evidence: 'OpenRouter avg: $0.11/1M tokens.' },
      {
        modelId: 'mistralai/mistral-small-3.2-24b-instruct',
        evidence: 'OpenRouter avg: $0.12/1M tokens.',
      },
      { modelId: 'meta-llama/llama-4-scout', evidence: 'OpenRouter avg: $0.19/1M tokens.' },
      { modelId: 'xiaomi/mimo-v2-flash', evidence: 'OpenRouter avg: $0.19/1M tokens.' },
      { modelId: 'qwen/qwen3-30b-a3b-instruct-2507', evidence: 'OpenRouter avg: $0.20/1M tokens.' },
      { modelId: 'mistralai/devstral-small', evidence: 'OpenRouter avg: $0.20/1M tokens.' },
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence: 'OpenRouter avg: $0.21/1M tokens.',
      },
      { modelId: 'openai/gpt-5-nano', evidence: 'OpenRouter avg: $0.22/1M tokens.' },
      { modelId: 'google/gemini-2.0-flash-001', evidence: 'OpenRouter avg: $0.25/1M tokens.' },
      { modelId: 'deepseek/deepseek-v3.2-exp', evidence: 'OpenRouter avg: $0.34/1M tokens.' },
      { modelId: 'x-ai/grok-4-fast', evidence: 'OpenRouter avg: $0.35/1M tokens.' },
      { modelId: 'x-ai/grok-4.1-fast', evidence: 'OpenRouter avg: $0.35/1M tokens.' },
      { modelId: 'meta-llama/llama-4-maverick', evidence: 'OpenRouter avg: $0.38/1M tokens.' },
      { modelId: 'openai/gpt-4o-mini', evidence: 'OpenRouter avg: $0.38/1M tokens.' },
      { modelId: 'x-ai/grok-3-mini', evidence: 'OpenRouter avg: $0.40/1M tokens.' },
      { modelId: 'qwen/qwen3-coder-next', evidence: 'OpenRouter avg: $0.43/1M tokens.' },
      { modelId: 'qwen/qwen3-next-80b-a3b-thinking', evidence: 'OpenRouter avg: $0.44/1M tokens.' },
      { modelId: 'deepseek/deepseek-chat-v3.1', evidence: 'OpenRouter avg: $0.45/1M tokens.' },
      { modelId: 'qwen/qwen-plus-2025-07-28', evidence: 'OpenRouter avg: $0.52/1M tokens.' },
      { modelId: 'qwen/qwen3-coder-flash', evidence: 'OpenRouter avg: $0.58/1M tokens.' },
      { modelId: 'qwen/qwen3-next-80b-a3b-instruct', evidence: 'OpenRouter avg: $0.60/1M tokens.' },
      { modelId: 'mistralai/codestral-2508', evidence: 'OpenRouter avg: $0.60/1M tokens.' },
      { modelId: 'qwen/qwen3-coder', evidence: 'OpenRouter avg: $0.61/1M tokens.' },
      { modelId: 'microsoft/wizardlm-2-8x22b', evidence: 'OpenRouter avg: $0.62/1M tokens.' },
      { modelId: 'minimax/minimax-m2', evidence: 'OpenRouter avg: $0.63/1M tokens.' },
      { modelId: 'minimax/minimax-m2.5', evidence: 'OpenRouter avg: $0.70/1M tokens.' },
      { modelId: 'x-ai/grok-code-fast-1', evidence: 'OpenRouter avg: $0.85/1M tokens.' },
      { modelId: 'qwen/qwen3.5-plus-02-15', evidence: 'OpenRouter avg: $0.91/1M tokens.' },
    ],
  },
  {
    id: 'fast',
    label: 'Fastest responses',
    description: 'Highest throughput (tokens per second)',
    categoryInfoTooltip:
      'Ranked by inference throughput (tokens/second) from LMSpeed and API benchmarks. Higher throughput = faster streaming responses. Speed varies by provider and load.',
    models: [
      { modelId: 'anthropic/claude-sonnet-4', evidence: 'LMSpeed (lmspeed.net): 1415 t/s.' },
      { modelId: 'moonshotai/kimi-k2.5', evidence: 'LMSpeed (lmspeed.net): 1383 t/s.' },
      { modelId: 'openai/gpt-5', evidence: 'LMSpeed (lmspeed.net): 490 t/s.' },
      { modelId: 'openai/gpt-5-codex', evidence: 'LMSpeed (lmspeed.net): 466 t/s.' },
      { modelId: 'openai/gpt-oss-120b', evidence: 'LMSpeed (lmspeed.net): 276 t/s.' },
      { modelId: 'openai/gpt-5.1-codex-mini', evidence: 'LMSpeed (lmspeed.net): 246 t/s.' },
      { modelId: 'openai/gpt-5.2', evidence: 'LMSpeed (lmspeed.net): 171 t/s.' },
      { modelId: 'openai/gpt-5.1', evidence: 'LMSpeed (lmspeed.net): 167 t/s.' },
      { modelId: 'google/gemini-3-flash-preview', evidence: 'LMSpeed (lmspeed.net): 163 t/s.' },
      { modelId: 'qwen/qwen3.5-397b-a17b', evidence: 'LMSpeed (lmspeed.net): 138 t/s.' },
      { modelId: 'stepfun/step-3.5-flash:free', evidence: 'LMSpeed (lmspeed.net): 133 t/s.' },
      { modelId: 'x-ai/grok-4-fast', evidence: 'LMSpeed (lmspeed.net): 124 t/s.' },
      { modelId: 'qwen/qwen3-next-80b-a3b-instruct', evidence: 'LMSpeed (lmspeed.net): 116 t/s.' },
      { modelId: 'x-ai/grok-4', evidence: 'LMSpeed (lmspeed.net): 111 t/s.' },
      { modelId: 'qwen/qwen3-coder-flash', evidence: 'LMSpeed (lmspeed.net): 110 t/s.' },
      { modelId: 'openai/gpt-5-chat', evidence: 'LMSpeed (lmspeed.net): 102 t/s.' },
      { modelId: 'x-ai/grok-4.1-fast', evidence: 'LMSpeed (lmspeed.net): 99 t/s.' },
      { modelId: 'google/gemini-2.5-pro', evidence: 'LMSpeed (lmspeed.net): 97 t/s.' },
      { modelId: 'google/gemini-3.1-pro-preview', evidence: 'LMSpeed (lmspeed.net): 96 t/s.' },
      { modelId: 'openai/gpt-5.2-chat', evidence: 'LMSpeed (lmspeed.net): 93 t/s.' },
      { modelId: 'openai/gpt-5.1-codex-max', evidence: 'LMSpeed (lmspeed.net): 90 t/s.' },
      { modelId: 'openai/gpt-5.4', evidence: 'LMSpeed (lmspeed.net): 89 t/s.' },
      { modelId: 'anthropic/claude-haiku-4.5', evidence: 'LMSpeed (lmspeed.net): 88 t/s.' },
      { modelId: 'deepseek/deepseek-v3.2-exp', evidence: 'LMSpeed (lmspeed.net): 83 t/s.' },
      { modelId: 'minimax/minimax-m2.5', evidence: 'LMSpeed (lmspeed.net): 71 t/s.' },
      { modelId: 'openai/gpt-5.3-chat', evidence: 'LMSpeed (lmspeed.net): 64 t/s.' },
    ],
  },
  {
    id: 'coding',
    label: 'Best for coding',
    description: 'Code generation, debugging, refactoring',
    categoryInfoTooltip:
      'Ranked by SWE-Bench Verified (OpenLM): real-world code-repair on GitHub issues. Higher % = better at resolving bugs. See openlm.ai/swe-bench.',
    models: [
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'SWE-Bench Verified: 80.6%. Strong code generation.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence: 'SWE-Bench Verified (openlm.ai): 80.2%. 3× faster. Best value/speed for code.',
      },
      { modelId: 'anthropic/claude-opus-4.6', evidence: 'SWE-Bench Verified (openlm.ai): 79.2%.' },
      { modelId: 'z-ai/glm-5', evidence: 'SWE-Bench Verified: 77.8%. Strong coding from Zhipu.' },
      { modelId: 'moonshotai/kimi-k2.5', evidence: 'SWE-Bench Verified (openlm.ai): 76.8%.' },
      { modelId: 'qwen/qwen3.5-397b-a17b', evidence: 'SWE-Bench Verified: 76.4%. Qwen flagship.' },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'SWE-Bench Verified: 79.6%. Frontier Sonnet for code.',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'SWE-Bench Verified (openlm.ai): 75.2%. Fast coding model.',
      },
      { modelId: 'openai/gpt-5.3-codex', evidence: 'SWE-Bench Verified (openlm.ai): 75.2%.' },
      { modelId: 'anthropic/claude-opus-4.5', evidence: 'SWE-Bench Verified (openlm.ai): 74.4%.' },
      {
        modelId: 'google/gemini-3-pro-preview',
        evidence: 'SWE-Bench Verified (openlm.ai): 74.2%. Pro-tier coding.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2-exp',
        evidence: 'SWE-Bench Verified: 73.0%. Experimental V3.2.',
      },
      { modelId: 'openai/gpt-5.2', evidence: 'SWE-Bench Verified (openlm.ai): 71.8%.' },
      {
        modelId: 'anthropic/claude-sonnet-4.5',
        evidence: 'SWE-Bench Verified (openlm.ai): 70.6%.',
      },
      {
        modelId: 'qwen/qwen3-coder-next',
        evidence: 'SWE-Bench Verified (openlm.ai): 70.6%. Specialized coder.',
      },
      { modelId: 'x-ai/grok-4', evidence: 'SWE-Bench Verified (openlm.ai): 70.6%.' },
      { modelId: 'openai/gpt-5.1', evidence: 'SWE-Bench Verified (openlm.ai): 70.5%.' },
      { modelId: 'anthropic/claude-opus-4.1', evidence: 'SWE-Bench Verified (openlm.ai): 70.1%.' },
      { modelId: 'qwen/qwen3-max', evidence: 'SWE-Bench Verified (openlm.ai): 69.6%.' },
      { modelId: 'anthropic/claude-haiku-4.5', evidence: 'SWE-Bench Verified (openlm.ai): 68.8%.' },
      { modelId: 'anthropic/claude-sonnet-4', evidence: 'SWE-Bench Verified (openlm.ai): 68.0%.' },
      { modelId: 'anthropic/claude-opus-4', evidence: 'SWE-Bench Verified (openlm.ai): 67.6%.' },
      { modelId: 'openai/gpt-5', evidence: 'SWE-Bench Verified (openlm.ai): 65.0%.' },
      { modelId: 'openai/gpt-5-mini', evidence: 'SWE-Bench Verified (openlm.ai): 59.8%.' },
      { modelId: 'openai/o3', evidence: 'SWE-Bench Verified (openlm.ai): 58.4%.' },
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
        evidence: 'Creative Writing Arena (kearai.com): 1490 Elo.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'Creative Writing Arena (kearai.com): 1478 Elo.',
      },
      {
        modelId: 'anthropic/claude-opus-4.5',
        evidence: 'Creative Writing Arena (kearai.com): 1459 Elo.',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'Creative Writing Arena (kearai.com): 1456 Elo.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Creative Writing Arena (kearai.com): 1450 Elo.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.5',
        evidence: 'Creative Writing Arena (kearai.com): 1447 Elo.',
      },
      {
        modelId: 'anthropic/claude-opus-4.1',
        evidence: 'Creative Writing Arena (kearai.com): 1445 Elo.',
      },
      { modelId: 'openai/gpt-4o', evidence: 'Creative Writing Arena (kearai.com): 1438 Elo.' },
      { modelId: 'openai/gpt-5.1', evidence: 'Creative Writing Arena (kearai.com): 1434 Elo.' },
      { modelId: 'x-ai/grok-4.1-fast', evidence: 'Creative Writing Arena (kearai.com): 1434 Elo.' },
      {
        modelId: 'anthropic/claude-opus-4',
        evidence: 'Creative Writing Arena (kearai.com): 1428 Elo.',
      },
      {
        modelId: 'moonshotai/kimi-k2.5',
        evidence: 'Creative Writing Arena (kearai.com): 1418 Elo.',
      },
      {
        modelId: 'deepseek/deepseek-chat-v3.1',
        evidence: 'Creative Writing Arena (kearai.com): 1411 Elo.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2-exp',
        evidence: 'Creative Writing Arena (kearai.com): 1403 Elo.',
      },
      { modelId: 'z-ai/glm-4.7', evidence: 'Creative Writing Arena (kearai.com): 1403 Elo.' },
      { modelId: 'x-ai/grok-3-mini', evidence: 'Creative Writing Arena (kearai.com): 1402 Elo.' },
      { modelId: 'openai/gpt-5.2', evidence: 'Creative Writing Arena (kearai.com): 1398 Elo.' },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'Creative Writing Arena (kearai.com): 1398 Elo.',
      },
      { modelId: 'openai/gpt-5-chat', evidence: 'Creative Writing Arena (kearai.com): 1394 Elo.' },
      {
        modelId: 'deepseek/deepseek-r1',
        evidence: 'Mazur Writing Score: 8.54. Strong narrative generation.',
      },
    ],
  },
  {
    id: 'images',
    label: 'Best for images',
    description: 'Image understanding — photos, diagrams, screenshots, charts',
    categoryInfoTooltip:
      'These models support image input and can interpret visual content. Required when you attach images to your prompt.',
    models: [
      {
        modelId: 'openai/gpt-4o',
        evidence: 'Supports image input. Can analyze photos, diagrams, and screenshots.',
      },
      {
        modelId: 'openai/gpt-4o-mini',
        evidence: 'Supports image input. Cost-effective vision model.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Supports image input. Strong multimodal reasoning.',
      },
      { modelId: 'google/gemini-2.5-flash', evidence: 'Supports image input. Fast vision model.' },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'Supports image input. Latest Gemini flash.',
      },
      {
        modelId: 'anthropic/claude-opus-4.1',
        evidence: 'Supports image input. Frontier vision model.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'Supports image input. Strong vision from Anthropic.',
      },
      {
        modelId: 'mistralai/mistral-medium-3.1',
        evidence: 'Supports image input. Multimodal enterprise model.',
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
      { modelId: 'openai/gpt-5-image', evidence: 'Text-to-Image Arena (kearai.com): 1237.' },
      {
        modelId: 'google/gemini-3-pro-image-preview',
        evidence: 'Text-to-Image Arena (kearai.com): 1231.',
      },
      {
        modelId: 'google/gemini-3.1-flash-image-preview',
        evidence: 'Text-to-Image Arena (kearai.com): 1227.',
      },
      {
        modelId: 'black-forest-labs/flux.2-max',
        evidence: 'Text-to-Image Arena (kearai.com): 1168.',
      },
      {
        modelId: 'black-forest-labs/flux.2-flex',
        evidence: 'Text-to-Image Arena (kearai.com): 1156.',
      },
      {
        modelId: 'google/gemini-2.5-flash-image',
        evidence: 'Text-to-Image Arena (kearai.com): 1154.',
      },
      {
        modelId: 'black-forest-labs/flux.2-pro',
        evidence: 'Text-to-Image Arena (kearai.com): 1153.',
      },
      {
        modelId: 'bytedance-seed/seedream-4.5',
        evidence: 'Text-to-Image Arena (kearai.com): 1140.',
      },
      { modelId: 'openai/gpt-5-image-mini', evidence: 'Text-to-Image Arena (kearai.com): 1103.' },
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
      { modelId: 'moonshotai/kimi-k2.5', evidence: 'MATH (llmdb.com): 97.4%.' },
      { modelId: 'openai/o3', evidence: 'MATH (llmdb.com): 94.8%.' },
      { modelId: 'deepseek/deepseek-v3.2-exp', evidence: 'MATH (llmdb.com): 90.2%.' },
      { modelId: 'openai/gpt-4o', evidence: 'MATH (llmdb.com): 76.6%.' },
      { modelId: 'anthropic/claude-3.7-sonnet', evidence: 'MATH (llmdb.com): 3.7%.' },
      { modelId: 'google/gemini-2.5-pro', evidence: 'MATH (llmdb.com): 2.0%.' },
      { modelId: 'google/gemini-2.5-flash', evidence: 'MATH (llmdb.com): 2.0%.' },
      { modelId: 'google/gemini-2.0-flash-001', evidence: 'MATH (llmdb.com): 2.0%.' },
    ],
  },
  {
    id: 'reasoning',
    label: 'Best for reasoning',
    description: 'Math, logic, multi-step problem solving',
    categoryInfoTooltip:
      'Ranked by MMLU-Pro (awesomeagents.ai), a broad multi-domain reasoning benchmark. Higher % = better general knowledge and problem-solving.',
    models: [
      { modelId: 'google/gemini-3.1-pro-preview', evidence: 'MMLU-Pro (awesomeagents.ai): 89.8%.' },
      { modelId: 'openai/gpt-5.2-pro', evidence: 'MMLU-Pro (awesomeagents.ai): 88.7%.' },
      { modelId: 'anthropic/claude-opus-4.6', evidence: 'MMLU-Pro (awesomeagents.ai): 88.2%.' },
      { modelId: 'google/gemini-2.5-pro', evidence: 'MMLU-Pro (awesomeagents.ai): 87.5%.' },
      { modelId: 'anthropic/claude-opus-4.5', evidence: 'MMLU-Pro (awesomeagents.ai): 87.1%.' },
      { modelId: 'openai/gpt-5.2', evidence: 'MMLU-Pro (awesomeagents.ai): 86.3%.' },
      { modelId: 'deepseek/deepseek-v3.2-exp', evidence: 'MMLU-Pro (awesomeagents.ai): 85.9%.' },
      {
        modelId: 'deepseek/deepseek-r1',
        evidence: 'MMLU-Pro: 84.6%. Math 92.8%. Matches o1 performance.',
      },
      { modelId: 'qwen/qwen3.5-397b-a17b', evidence: 'MMLU-Pro (awesomeagents.ai): 84.6%.' },
    ],
  },
  {
    id: 'long-context',
    label: 'Best for long context',
    description: 'Large context windows (128K–1M+ tokens)',
    categoryInfoTooltip:
      'Ranked by MRCR 1M (llmdb.com), MRCR v2, and LongBench v2. Higher score = better long-context retrieval and reasoning.',
    models: [
      { modelId: 'openai/gpt-5.2', evidence: 'MRCR v2 4-needle 256K (awesomeagents.ai): 98%.' },
      { modelId: 'google/gemini-2.5-pro', evidence: 'MRCR 1M (llmdb.com): 93.0/100.' },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'MRCR v2 4-needle 256K (awesomeagents.ai): 85%.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'MRCR v2 4-needle 256K (awesomeagents.ai): 82%.',
      },
      { modelId: 'openai/gpt-4o', evidence: 'MRCR v2 4-needle 256K (awesomeagents.ai): 80%.' },
      { modelId: 'anthropic/claude-opus-4.6', evidence: 'MRCR 1M (llmdb.com): 76.0/100.' },
      { modelId: 'google/gemini-2.0-flash-001', evidence: 'MRCR 1M (llmdb.com): 70.5/100.' },
      { modelId: 'google/gemini-2.5-flash', evidence: 'MRCR 1M (llmdb.com): 32.0/100.' },
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
        evidence: 'Global-MMLU: 75.4%. Strong multilingual from Meta.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'Global-MMLU: 74.2%. Fast multilingual model.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'Global-MMLU: 72.1%. Frontier multilingual.',
      },
      { modelId: 'openai/gpt-5.2', evidence: 'Global-MMLU: 70.8%. Strong non-English support.' },
      { modelId: 'google/gemini-2.5-pro', evidence: 'Global-MMLU (llmdb.com): 2.5%.' },
    ],
  },
  {
    id: 'legal',
    label: 'Best for legal',
    description: 'Legal reasoning, contract analysis, statutory interpretation',
    categoryInfoTooltip:
      'Ranked by LegalBench (vals.ai) across 161 legal reasoning tasks. Higher % = stronger legal analysis and statutory interpretation.',
    models: [
      { modelId: 'google/gemini-3.1-pro-preview', evidence: 'LegalBench (vals.ai): 87.04%.' },
      { modelId: 'google/gemini-3-flash-preview', evidence: 'LegalBench (vals.ai): 86.86%.' },
      { modelId: 'openai/gpt-5', evidence: 'LegalBench (vals.ai): 86.02%.' },
      { modelId: 'openai/gpt-5.1', evidence: 'LegalBench (vals.ai): 85.68%.' },
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
      { modelId: 'openai/gpt-5.1', evidence: 'HealthBench Hard (OpenAI): 40%.' },
      {
        modelId: 'openai/gpt-4o',
        evidence: 'HealthBench (OpenAI): 32%. Multi-turn health scenarios.',
      },
      { modelId: 'google/gemini-2.5-pro', evidence: 'HealthBench Hard (OpenAI): 19%.' },
    ],
  },
]

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
