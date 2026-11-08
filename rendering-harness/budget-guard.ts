/**
 * Pre-request budget guard used by the harness runner.
 * Unknown pricing is unknowable: the caller must refuse the request, never guess.
 */

export const THINKING_MODEL_OUTPUT_MULTIPLIER = 3

export interface PricingInfo {
  inputCostPerToken: number
  outputCostPerToken: number
}

export interface UsageLike {
  cost?: number
  prompt_tokens?: number
  completion_tokens?: number
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimated USD for one request, or null when pricing is missing (refuse; do not guess).
 */
export function estimateRequestCost(
  promptTokens: number,
  maxTokens: number,
  pricing: PricingInfo | undefined,
  isThinkingModel: boolean
): number | null {
  if (!pricing) {
    return null
  }
  const outputTokens = maxTokens * (isThinkingModel ? THINKING_MODEL_OUTPUT_MULTIPLIER : 1)
  return promptTokens * pricing.inputCostPerToken + outputTokens * pricing.outputCostPerToken
}

export function remainingBudget(maxUsd: number, spentUsd: number): number {
  return maxUsd - spentUsd
}

export function canAffordRequest(estimatedCost: number, remainingUsd: number): boolean {
  return estimatedCost <= remainingUsd
}

export type BudgetDecision =
  | { action: 'proceed'; estimatedCost: number }
  | { action: 'refuse'; reason: string }

export function preRequestBudgetDecision(opts: {
  pricing: PricingInfo | undefined
  modelId: string
  promptTokens: number
  maxTokens: number
  isThinkingModel: boolean
  maxUsd: number
  spentUsd: number
}): BudgetDecision {
  const estimatedCost = estimateRequestCost(
    opts.promptTokens,
    opts.maxTokens,
    opts.pricing,
    opts.isThinkingModel
  )
  if (estimatedCost === null) {
    return {
      action: 'refuse',
      reason: `No pricing data for ${opts.modelId} (cannot estimate cost)`,
    }
  }
  const remaining = remainingBudget(opts.maxUsd, opts.spentUsd)
  if (!canAffordRequest(estimatedCost, remaining)) {
    return {
      action: 'refuse',
      reason: `Budget guard: estimated cost $${estimatedCost.toFixed(4)} > remaining $${remaining.toFixed(4)}`,
    }
  }
  return { action: 'proceed', estimatedCost }
}

/**
 * Resolve billed cost after a response. Throws when the cost cannot be known,
 * so a later request is never charged against a guessed amount.
 */
export function resolveActualCost(
  usage: UsageLike | null | undefined,
  pricing: PricingInfo | undefined,
  modelId: string
): number {
  if (usage && typeof usage.cost === 'number') {
    return usage.cost
  }
  if (usage && usage.prompt_tokens != null && usage.completion_tokens != null) {
    if (!pricing) {
      throw new Error(
        `No pricing data for ${modelId} and usage.cost not provided by OpenRouter`
      )
    }
    return (
      usage.prompt_tokens * pricing.inputCostPerToken +
      usage.completion_tokens * pricing.outputCostPerToken
    )
  }
  throw new Error(`No usage data returned from OpenRouter for ${modelId}`)
}
