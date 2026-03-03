/**
 * Help Me Choose - Model recommendations by use case
 *
 * Each category lists 2–3 top models based on published benchmarks.
 * Model IDs must exist in the backend models registry.
 *
 * Evidence sources (see docs/features/HELP_ME_CHOOSE.md):
 * - SWE-Bench Verified (coding)
 * - LMSys Chatbot Arena & Coding Arena
 * - Creative Writing Arena / WritingBench
 * - MMLU-Pro (reasoning)
 * - OpenRouter pricing (cost-effectiveness)
 * - Provider latency benchmarks
 */

export interface HelpMeChooseRecommendation {
  id: string
  label: string
  description: string
  /** Model IDs (e.g. "anthropic/claude-opus-4.6") - order indicates preference; 2–3 per category */
  modelIds: string[]
}

export const HELP_ME_CHOOSE_RECOMMENDATIONS: HelpMeChooseRecommendation[] = [
  {
    id: 'coding',
    label: 'Best for coding',
    description:
      'SWE-Bench Verified & LMSys Coding Arena leaders: code generation, debugging, refactoring',
    modelIds: [
      'anthropic/claude-opus-4.6', // SWE-Bench 80.8%, LMSys Coding #1 (1576)
      'anthropic/claude-opus-4.5', // SWE-Bench 80.9%, LMSys Coding #2
      'minimax/minimax-m2.5', // SWE-Bench 80.2%, best value/speed
    ],
  },
  {
    id: 'writing',
    label: 'Best for writing',
    description:
      'Creative Writing Arena leaders: prose, tone, character consistency, long-form narrative',
    modelIds: [
      'anthropic/claude-opus-4.6', // Mazur 8.561, character consistency
      'anthropic/claude-opus-4.5', // Creative Writing Arena 1455–1461
      'openai/gpt-5.2', // Mazur 8.511, enterprise content
    ],
  },
  {
    id: 'reasoning',
    label: 'Best for reasoning',
    description: 'MMLU-Pro & chain-of-thought leaders: math, logic, multi-step problem solving',
    modelIds: [
      'openai/o3', // SOTA reasoning, inference-time scaling
      'deepseek/deepseek-r1', // Matches o1 performance, open chain-of-thought
      'anthropic/claude-opus-4.6', // MMLU-Pro 88.2%
    ],
  },
  {
    id: 'cost-effective',
    label: 'Most cost-effective',
    description: 'Best quality-per-dollar: OpenRouter value leaders for high-volume use',
    modelIds: [
      'deepseek/deepseek-r1', // Quality score 51, $0.70/$2.50 per 1M tokens
      'google/gemini-2.5-flash', // Quality score 51, built-in thinking
      'anthropic/claude-haiku-4.5', // Near-frontier at fraction of cost
    ],
  },
  {
    id: 'web-search',
    label: 'Best for web search',
    description: 'Models with strong real-time retrieval, source citation, and grounded answers',
    modelIds: [
      'anthropic/claude-sonnet-4.6', // Frontier quality + web search
      'openai/gpt-5.1', // Strong retrieval, citation
      'google/gemini-2.5-pro', // Complex reasoning + search
    ],
  },
  {
    id: 'fast',
    label: 'Fastest responses',
    description: 'Optimized for low latency and quick time-to-first-token',
    modelIds: [
      'anthropic/claude-haiku-4.5', // 2× Sonnet speed, 4–5× Sonnet 4.5
      'openai/gpt-5-nano', // Ultra-low latency, high throughput
      'google/gemini-2.0-flash-001', // High-speed, Pro-level quality
      'google/gemini-2.5-flash', // Fast, cost-efficient, built-in thinking
    ],
  },
]
