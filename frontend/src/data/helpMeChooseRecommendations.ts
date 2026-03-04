/**
 * Help Me Choose - Model recommendations by use case
 *
 * Categories are displayed horizontally. Each category lists models ordered
 * best-to-worst based on published benchmarks. Models may appear in multiple
 * categories; users select individual models.
 *
 * Inclusion rule: Only models with well-respected, publicly available benchmarks
 * or user-ratings (LMSys Arena, SWE-Bench, etc.) are included.
 *
 * Evidence format: Each entry includes the source (benchmark/reference) and
 * score where applicable. See /help-me-choose-methodology for full methodology.
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
}

/**
 * Categories displayed left-to-right (free-tier first, then premium).
 * Order within each category: best model first, descending by benchmark.
 * All top models per category; no limit.
 */
export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [
  {
    id: 'cost-effective',
    label: 'Most cost-effective',
    description: 'Best quality-per-dollar for high-volume use',
    models: [
      {
        modelId: 'deepseek/deepseek-chat-v3.1',
        evidence: 'OpenRouter pricing (openrouter.ai): Value leader, low $/1M tokens.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Artificial Analysis Quality Score 51 (artificialanalysis.ai). Built-in thinking, excellent cost-performance.',
      },
      {
        modelId: 'deepseek/deepseek-r1',
        evidence:
          'OpenRouter pricing: ~$0.70–$2.50 per 1M tokens. Frontier reasoning at value pricing.',
      },
      {
        modelId: 'mistralai/mistral-small-3.2-24b-instruct',
        evidence: 'OpenRouter pricing: Low cost. LMSys Chatbot Arena: Strong performance.',
      },
      {
        modelId: 'microsoft/phi-4',
        evidence: 'OpenRouter pricing: Efficient small model. Good cost-per-token.',
      },
      {
        modelId: 'openai/gpt-4o-mini',
        evidence: 'OpenRouter pricing: OpenAI value leader. Fast and affordable.',
      },
      {
        modelId: 'stepfun/step-3.5-flash:free',
        evidence: 'Free tier (stepfun.ai). Solid quality for cost.',
      },
      {
        modelId: 'anthropic/claude-3.5-haiku',
        evidence: 'OpenRouter pricing: Anthropic value tier. Low latency + cost.',
      },
    ],
  },
  {
    id: 'fast',
    label: 'Fastest responses',
    description: 'Low latency, quick time-to-first-token',
    models: [
      {
        modelId: 'google/gemini-2.0-flash-001',
        evidence: 'AILatency / Artificial Analysis (ailatency.com): TTFT leader.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'Artificial Analysis: Very fast with built-in thinking. Minimal delay.',
      },
      {
        modelId: 'x-ai/grok-4.1-fast',
        evidence:
          'LMSys Chatbot Arena (lmarena.ai): 1465 Elo. Fast non-thinking mode, top-tier speed.',
      },
      {
        modelId: 'anthropic/claude-3.5-haiku',
        evidence: "Anthropic benchmarks + AILatency: Anthropic's fastest. Low latency.",
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence: 'Anthropic: 2× Sonnet speed. Near-frontier with minimal delay.',
      },
      { modelId: 'openai/gpt-4o-mini', evidence: 'AILatency: Fast OpenAI option. Sub-500ms TTFT.' },
      {
        modelId: 'mistralai/mistral-small-3.2-24b-instruct',
        evidence: 'Quick responses. Good for streaming.',
      },
    ],
  },
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
      {
        modelId: 'google/gemini-3-flash-preview',
        evidence: 'SWE-Bench Verified (openlm.ai): 75.2%. Fast coding model.',
      },
      {
        modelId: 'google/gemini-3-pro-preview',
        evidence: 'SWE-Bench Verified (openlm.ai): 74.2%. Pro-tier coding.',
      },
      { modelId: 'z-ai/glm-5', evidence: 'SWE-Bench Verified: 77.8%. Strong coding from Zhipu.' },
      { modelId: 'anthropic/claude-sonnet-4.5', evidence: 'SWE-Bench Verified: 77.2%.' },
      { modelId: 'moonshotai/kimi-k2.5', evidence: 'SWE-Bench Verified (openlm.ai): 76.8%.' },
      { modelId: 'qwen/qwen3.5-397b-a17b', evidence: 'SWE-Bench Verified: 76.4%. Qwen flagship.' },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence: 'SWE-Bench Verified (openlm.ai): 68.8%. Fast + capable.',
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
        modelId: 'mistralai/codestral-2508',
        evidence:
          'Code-specialized model. LMSys Coding Arena (lmarena.ai): Strong dev performance.',
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
      { modelId: 'anthropic/claude-opus-4.5', evidence: 'Creative Writing Arena: 1455–1461 Elo.' },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'Mazur Writing Score: 8.511. Strong creative and technical writing.',
      },
      {
        modelId: 'deepseek/deepseek-r1',
        evidence: 'Mazur Writing Score: 8.54. Strong narrative generation.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'Creative Writing Arena: Voice consistency, quality.',
      },
      {
        modelId: 'anthropic/claude-3.7-sonnet',
        evidence: 'Creative Writing Arena: Extended thinking for long-form.',
      },
      {
        modelId: 'openai/gpt-5.1',
        evidence: 'Creative Writing Arena: Enterprise content. Strong prose.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Creative Writing Arena: Long-form narrative. Complex reasoning + writing.',
      },
    ],
  },
  {
    id: 'reasoning',
    label: 'Best for reasoning',
    description: 'Math, logic, multi-step problem solving',
    models: [
      {
        modelId: 'openai/o3',
        evidence: 'SOTA reasoning. Chain-of-thought leader. Inference-time scaling.',
      },
      { modelId: 'openai/o3-mini', evidence: 'Efficient reasoning. o3 architecture (OpenAI).' },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        evidence: 'MMLU-Pro (awesomeagents.ai): 90.1%. Graduate-level knowledge leader.',
      },
      {
        modelId: 'deepseek/deepseek-r1',
        evidence: 'MMLU-Pro: 84.6%. Math 92.8%. Matches o1 performance.',
      },
      { modelId: 'anthropic/claude-opus-4.6', evidence: 'MMLU-Pro: 88.2%. Multi-step reasoning.' },
      { modelId: 'openai/gpt-5.2-pro', evidence: 'MMLU-Pro: 88.7%. Strong reasoning tier.' },
      {
        modelId: 'x-ai/grok-4.1-fast',
        evidence: 'LMSys Chatbot Arena (lmarena.ai): 1465 Elo. Top-tier agentic reasoning.',
      },
      {
        modelId: 'anthropic/claude-opus-4.5',
        evidence: 'MMLU-Pro: 89.5%. Claude Opus 4.5 Reasoning.',
      },
      { modelId: 'google/gemini-2.5-pro', evidence: 'MMLU-Pro: Complex reasoning. 1M+ context.' },
      {
        modelId: 'qwen/qwen3-max-thinking',
        evidence: 'Thinking model. LMSys Arena: Extended reasoning.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-thinking',
        evidence: 'Thinking architecture. Multi-step logic.',
      },
    ],
  },
  {
    id: 'web-search',
    label: 'Best for web search',
    description: 'Real-time retrieval, source citation',
    models: [
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence: 'Provider docs: Frontier + native web search. Strong citation.',
      },
      {
        modelId: 'openai/gpt-5.1',
        evidence: 'Provider docs: supports_web_search. Strong retrieval, citation.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence: 'Provider docs: Complex reasoning + search. 1M+ context.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence: 'Provider docs: Web search enabled. Grounded answers.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence: 'Provider docs: Fast + web search. Low latency retrieval.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence: 'Provider docs: Fast with search. Good for real-time lookup.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence: 'Provider docs: Retrieval and citation. Enterprise-grade.',
      },
      {
        modelId: 'cohere/command-r-plus-08-2024',
        evidence: 'Cohere docs: RAG-optimized. Native citation support.',
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
