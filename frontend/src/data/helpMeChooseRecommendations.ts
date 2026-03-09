/**
 * Help Me Choose - Model recommendations by use case
 *
 * Categories are displayed horizontally. Each category lists models ordered
 * best-to-worst based on published benchmarks. Models may appear in multiple
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
    id: 'coding',
    label: 'Best for coding',
    description: 'Code generation, debugging, refactoring',
    models: [
      {
        modelId: 'anthropic/claude-opus-4.5',
        evidence: 'SWE-Bench Verified (swebench.com): 80.9%. First AI over 80%.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'SWE-Bench Verified: 80.8%. LMSys Coding Arena (lmarena.ai): #1.',
      },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'SWE-Bench Verified: 80.6%. Strong code generation.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence: 'SWE-Bench Verified (openlm.ai): 80.2%. 3× faster. Best value/speed for code.',
      },
      { modelId: 'openai/gpt-5.2', evidence: 'SWE-Bench Verified: 80.0%.' },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'SWE-Bench Verified: 79.6%. Frontier Sonnet for code.',
      },
      { modelId: 'z-ai/glm-5', evidence: 'SWE-Bench Verified: 77.8%. Strong coding from Zhipu.' },
      { modelId: 'anthropic/claude-sonnet-4.5', evidence: 'SWE-Bench Verified: 77.2%.' },
      { modelId: 'moonshotai/kimi-k2.5', evidence: 'SWE-Bench Verified (openlm.ai): 76.8%.' },
      { modelId: 'qwen/qwen3.5-397b-a17b', evidence: 'SWE-Bench Verified: 76.4%. Qwen flagship.' },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'SWE-Bench Verified (openlm.ai): 75.2%. Fast coding model.',
      },
      {
        modelId: 'google/gemini-3-pro-preview',
        evidence: 'SWE-Bench Verified (openlm.ai): 74.2%. Pro-tier coding.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2-exp',
        evidence: 'SWE-Bench Verified: 73.0%. Experimental V3.2.',
      },
      { modelId: 'anthropic/claude-sonnet-4', evidence: 'SWE-Bench Verified: 72.7%.' },
      {
        modelId: 'qwen/qwen3-coder-next',
        evidence: 'SWE-Bench Verified (openlm.ai): 70.6%. Specialized coder.',
      },
      {
        modelId: 'x-ai/grok-4',
        evidence: 'SWE-Bench Verified (openlm.ai): 70.6%. xAI flagship coding.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence: 'SWE-Bench Verified (openlm.ai): 68.8%. Fast + capable.',
      },
    ],
  },
  {
    id: 'writing',
    label: 'Best for writing',
    description: 'Prose, tone, character consistency',
    models: [
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'Mazur Writing Score (Creative Writing Arena, kearai.com): 8.561. Leader.',
      },
      {
        modelId: 'deepseek/deepseek-r1',
        evidence: 'Mazur Writing Score: 8.54. Strong narrative generation.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'Mazur Writing Score: 8.511. Strong creative and technical writing.',
      },
      { modelId: 'anthropic/claude-opus-4.5', evidence: 'Creative Writing Arena: 1455–1461 Elo.' },
    ],
  },
  {
    id: 'reasoning',
    label: 'Best for reasoning',
    description: 'Math, logic, multi-step problem solving',
    models: [
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'MMLU-Pro (awesomeagents.ai): 90.1%. Graduate-level knowledge leader.',
      },
      {
        modelId: 'anthropic/claude-opus-4.5',
        evidence: 'MMLU-Pro: 89.5%. Claude Opus 4.5 Reasoning.',
      },
      { modelId: 'openai/gpt-5.2-pro', evidence: 'MMLU-Pro: 88.7%. Strong reasoning tier.' },
      { modelId: 'anthropic/claude-opus-4.6', evidence: 'MMLU-Pro: 88.2%. Multi-step reasoning.' },
      {
        modelId: 'deepseek/deepseek-r1',
        evidence: 'MMLU-Pro: 84.6%. Math 92.8%. Matches o1 performance.',
      },
    ],
  },
  {
    id: 'long-context',
    label: 'Best for long context',
    description: 'Large context windows (128K–1M+ tokens)',
    models: [
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Michelangelo Long-Context 1M (llmdb.com): 93/100. MRCR leader. 1M+ tokens.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Michelangelo Long-Context 1M (llmdb.com): 76/100. Strong long-context reasoning.',
      },
      {
        modelId: 'google/gemini-2.0-flash-001',
        evidence: 'Michelangelo Long-Context (llmdb.com): 70.5. Fast with large context.',
      },
    ],
  },
  {
    id: 'cost-effective',
    label: 'Best value',
    description: 'Lowest cost per 1M tokens for high-volume use',
    categoryInfoTooltip:
      'Ranked by average cost per million tokens (OpenRouter pricing: prompt + completion). Lower cost = better value. Prices vary by provider.',
    models: [
      {
        modelId: 'deepseek/deepseek-chat-v3.1',
        evidence: 'OpenRouter avg: $0.61/1M tokens. Best value for high-volume use.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'OpenRouter avg: $0.75/1M tokens. Fast and cost-efficient.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence: 'OpenRouter avg: $1.25/1M tokens. Near-frontier at low cost.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence: 'OpenRouter avg: $1.50/1M tokens. Lightweight GPT-5 tier.',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'OpenRouter avg: $2.00/1M tokens. Thinking model, strong value.',
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
        modelId: 'openai/gpt-oss-120b',
        evidence:
          'LMSpeed (lmspeed.net): 1742 t/s. Top throughput on OpenRouter-compatible endpoints.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'LMSpeed: 170 t/s. GPT-5.2 Chat (Instant) tier.',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'LMSpeed: 162 t/s. Fast thinking model.',
      },
      {
        modelId: 'x-ai/grok-4-fast',
        evidence: 'LMSpeed: 124 t/s. xAI fast tier.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence: 'LMSpeed: 116 t/s. Low latency, high throughput.',
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
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Global-MMLU (llmdb.com): 88.6%. Leader across 42 languages.',
      },
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
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'Global-MMLU: 70.8%. Strong non-English support.',
      },
    ],
  },
  {
    id: 'legal',
    label: 'Best for legal',
    description: 'Legal reasoning, contract analysis, statutory interpretation',
    models: [
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'LegalBench (vals.ai): 87.04%. 161 legal reasoning tasks.',
      },
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'LegalBench (vals.ai): 86.86%. Strong legal reasoning.',
      },
      { modelId: 'openai/gpt-5', evidence: 'LegalBench (vals.ai): 86.02%.' },
      { modelId: 'openai/gpt-5.1', evidence: 'LegalBench (vals.ai): 85.68%.' },
    ],
  },
  {
    id: 'medical',
    label: 'Best for medical',
    description: 'Clinical knowledge, health information, medical reasoning',
    models: [
      {
        modelId: 'openai/o3',
        evidence: 'HealthBench (OpenAI): 60%. Physician-evaluated clinical conversations.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence: 'HealthBench Hard (OpenAI): 46%. Challenging clinical subset.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'HealthBench Hard (OpenAI): 42%.',
      },
      {
        modelId: 'openai/gpt-5.1',
        evidence: 'HealthBench Hard (OpenAI): 40%.',
      },
      {
        modelId: 'openai/gpt-4o',
        evidence: 'HealthBench (OpenAI): 32%. Multi-turn health scenarios.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'HealthBench Hard (OpenAI): 19%.',
      },
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
