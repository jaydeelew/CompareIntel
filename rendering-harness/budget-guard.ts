/**
 * Pre-request budget guard used by the harness runner.
 * Unknown pricing is unknowable: the caller must refuse the request, never guess.
 */

export const THINKING_MODEL_OUTPUT_MULTIPLIER = 3

export interface PricingInfo {
  inputCostPerToken: number
  outputCostPerToken: number
}

export interface UsageCostDetails {
  upstream_inference_prompt_cost?: number
  upstream_inference_completions_cost?: number
}

export interface UsageLike {
  cost?: number
  prompt_tokens?: number
  completion_tokens?: number
  cost_details?: UsageCostDetails
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
  isThinkingModel: boolean,
  observed?: PricingInfo
): number | null {
  const rates = mergeMaxRates(pricing, observed)
  if (!rates) {
    return null
  }
  const outputTokens = maxTokens * (isThinkingModel ? THINKING_MODEL_OUTPUT_MULTIPLIER : 1)
  return promptTokens * rates.inputCostPerToken + outputTokens * rates.outputCostPerToken
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
  observed?: PricingInfo
}): BudgetDecision {
  const estimatedCost = estimateRequestCost(
    opts.promptTokens,
    opts.maxTokens,
    opts.pricing,
    opts.isThinkingModel,
    opts.observed
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
      reason: `Budget guard: estimated cost $${estimatedCost.toFixed(4)} > remaining $${remaining.toFixed(4)} (estimate only, not a provider hard billing cap)`,
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

/** 25% headroom on max(catalog, observed) rates. Same margin as the collection CostGuard. */
export const RESERVE_MARGIN = 1.25

/** UTF-8 prompt bytes plus this pad, matching the collection input allowance. */
export const INPUT_BYTE_PAD = 32

/**
 * Estimate / reserve guard only. Unobserved provider routing or a later rate
 * change can still exceed the reserve. This is not a provider hard billing cap.
 */
export const BUDGET_GUARD_IS_HARD_CAP = false

function validNonNeg(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0
}

export function mergeMaxRates(
  ...rates: Array<PricingInfo | undefined | null>
): PricingInfo | undefined {
  const present = rates.filter(
    (r): r is PricingInfo =>
      !!r && validNonNeg(r.inputCostPerToken) && validNonNeg(r.outputCostPerToken)
  )
  if (present.length === 0) return undefined
  return {
    inputCostPerToken: Math.max(...present.map(r => r.inputCostPerToken)),
    outputCostPerToken: Math.max(...present.map(r => r.outputCostPerToken)),
  }
}

/**
 * Derive billed per-token rates. Prefer cost_details when they reconcile to
 * usage.cost; otherwise split cost across prompt/completion tokens.
 */
export function observedRatesFromUsage(usage: UsageLike): PricingInfo {
  if (!usage || !validNonNeg(usage.cost)) {
    throw new Error('Unknown usage.cost: stop')
  }
  const promptTokens = usage.prompt_tokens
  const completionTokens = usage.completion_tokens
  if (
    !validNonNeg(promptTokens) ||
    !validNonNeg(completionTokens) ||
    (promptTokens + completionTokens === 0 && usage.cost > 0)
  ) {
    throw new Error('Unknown token billing: stop')
  }
  const details = usage.cost_details || {}
  const promptCost = details.upstream_inference_prompt_cost
  const completionCost = details.upstream_inference_completions_cost
  if (
    validNonNeg(promptCost) &&
    validNonNeg(completionCost) &&
    Math.abs(promptCost + completionCost - usage.cost) <= Math.max(1e-10, usage.cost * 1e-6)
  ) {
    if ((promptTokens === 0 && promptCost > 0) || (completionTokens === 0 && completionCost > 0)) {
      throw new Error('Invalid cost components')
    }
    return {
      inputCostPerToken: promptTokens ? promptCost / promptTokens : 0,
      outputCostPerToken: completionTokens ? completionCost / completionTokens : 0,
    }
  }
  return {
    inputCostPerToken: promptTokens ? usage.cost / promptTokens : 0,
    outputCostPerToken: completionTokens ? usage.cost / completionTokens : 0,
  }
}

export interface CatalogPricing {
  prompt?: string | number
  completion?: string | number
  overrides?: Array<{
    min_prompt_tokens?: number
    prompt?: string | number
    completion?: string | number
  }>
}

export interface ReserveDetails {
  usd: number
  inputRate: number
  outputRate: number
  inputByteAllowance: number
  completionCap: number
}

/**
 * Shared collection/harness cost guard. Takes max(catalog, historical observed,
 * newly observed same-model rates) before later requests. Reserve is an estimate
 * with margin, not a hard billing cap.
 */
export class SharedCostGuard {
  readonly budget: number
  actual = 0
  readonly rates = new Map<string, PricingInfo>()

  constructor(budget: number, prior: Array<{ modelId: string; usage?: UsageLike }> = []) {
    if (!validNonNeg(budget)) throw new Error('Invalid budget')
    this.budget = budget
    for (const call of prior) {
      if (call.usage && validNonNeg(call.usage.cost)) {
        this.observe(call.modelId, call.usage, false)
      }
    }
  }

  observe(modelId: string, usage: UsageLike, charge = true): PricingInfo {
    const next = observedRatesFromUsage(usage)
    const previous = this.rates.get(modelId) || {
      inputCostPerToken: 0,
      outputCostPerToken: 0,
    }
    const merged = mergeMaxRates(previous, next)!
    this.rates.set(modelId, merged)
    if (charge) this.actual += usage.cost as number
    return merged
  }

  catalogRates(pricing: CatalogPricing | undefined, promptByteLength: number): PricingInfo {
    if (pricing?.prompt == null || pricing.completion == null) {
      throw new Error('Unknown catalog pricing')
    }
    let input = Number(pricing.prompt)
    let output = Number(pricing.completion)
    if (!validNonNeg(input) || !validNonNeg(output)) {
      throw new Error('Unknown catalog pricing')
    }
    for (const override of pricing.overrides || []) {
      if (override.min_prompt_tokens != null && override.min_prompt_tokens > promptByteLength) {
        continue
      }
      const nextInput = override.prompt == null ? input : Number(override.prompt)
      const nextOutput = override.completion == null ? output : Number(override.completion)
      if (!validNonNeg(nextInput) || !validNonNeg(nextOutput)) {
        throw new Error('Unknown override pricing')
      }
      input = Math.max(input, nextInput)
      output = Math.max(output, nextOutput)
    }
    return { inputCostPerToken: input, outputCostPerToken: output }
  }

  reserve(opts: {
    modelId: string
    prompt: string
    completionCap: number
    catalog?: CatalogPricing
    effectiveInputRate?: number
    effectiveOutputRate?: number
  }): ReserveDetails {
    const bytes = Buffer.byteLength(opts.prompt, 'utf8') + INPUT_BYTE_PAD
    const catalog = this.catalogRates(opts.catalog, bytes)
    const seen = this.rates.get(opts.modelId)
    const extra: PricingInfo | undefined =
      opts.effectiveInputRate || opts.effectiveOutputRate
        ? {
            inputCostPerToken: opts.effectiveInputRate || 0,
            outputCostPerToken: opts.effectiveOutputRate || 0,
          }
        : undefined
    const rates = mergeMaxRates(catalog, seen, extra)!
    if (!Number.isInteger(opts.completionCap) || opts.completionCap < 1 || !rates) {
      throw new Error('Invalid reserve inputs')
    }
    return {
      usd:
        RESERVE_MARGIN *
        (bytes * rates.inputCostPerToken + opts.completionCap * rates.outputCostPerToken),
      inputRate: rates.inputCostPerToken,
      outputRate: rates.outputCostPerToken,
      inputByteAllowance: bytes,
      completionCap: opts.completionCap,
    }
  }

  gate(reserve: ReserveDetails | number): true {
    const usd = typeof reserve === 'number' ? reserve : reserve.usd
    if (!validNonNeg(usd) || this.budget - this.actual < usd) {
      throw new Error('Insufficient remaining estimated budget: stop')
    }
    return true
  }
}
