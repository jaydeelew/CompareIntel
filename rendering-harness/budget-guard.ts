/**
 * Pre-request budget guard used by the harness runner.
 * Unknown pricing is unknowable: the caller must refuse the request, never guess.
 */

import crypto from 'node:crypto'
import {
  type DurableStore,
  unresolvedBlocksPaid,
} from './durable-spend.js'

/**
 * Optional contingency only — not OpenRouter reasoning billing.
 * Chat max_tokens / max_completion_tokens already shares combined
 * reasoning + visible completion on most providers. Live and dry-run
 * reserves use the completion cap once, plus RESERVE_MARGIN.
 * Do not apply this multiplier to billed usage.cost (completion_tokens
 * already include reasoning).
 */
export const THINKING_MODEL_OUTPUT_MULTIPLIER = 3

/** Grok 4.3 03 502 + Tencent HY4 06 timeout. Never treat as $0; never reset on a new batch. */
export const HISTORICAL_UNKNOWN_CHARGES = 2

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
 * Token-based USD estimate, or null when pricing is missing (refuse; do not guess).
 * `isThinkingModel` is accepted for call-site compatibility and is ignored:
 * the completion cap already includes reasoning + visible tokens.
 * Live and dry-run paid paths use SharedCostGuard.reserve (UTF-8 bytes + pad,
 * cap once, RESERVE_MARGIN) — not this helper and not a 3× thinking multiplier.
 */
export function estimateRequestCost(
  promptTokens: number,
  maxTokens: number,
  pricing: PricingInfo | undefined,
  isThinkingModel: boolean,
  observed?: PricingInfo
): number | null {
  void isThinkingModel
  const rates = mergeMaxRates(pricing, observed)
  if (!rates) {
    return null
  }
  return promptTokens * rates.inputCostPerToken + maxTokens * rates.outputCostPerToken
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
  reasoningPolicy?: string
}

export const REASONING_RESERVE_POLICY =
  'Completion cap includes visible+reasoning once; 25% margin; estimate not hard cap'

export interface PaidCallContext {
  callId: string
  modelId?: string
  promptName?: string
}

export interface GuardOptions {
  store?: DurableStore
  batchId?: string
}

/**
 * Shared collection/harness cost guard. Takes max(catalog, historical observed,
 * newly observed same-model rates) before later requests. Reserve is an estimate
 * with margin, not a hard billing cap.
 *
 * With a DurableStore, unknown spend is persisted (actualCost/resolution null)
 * before throw. Pending pre-request intent blocks interrupted POSTs. There is
 * no acknowledge/reset API — resumption needs explicit reviewed resolution.
 */
export class SharedCostGuard {
  readonly budget: number
  readonly batchId: string
  readonly store?: DurableStore
  actual = 0
  unknownCharges = 0
  failClosed = false
  localHalt: string | null = null
  readonly rates = new Map<string, PricingInfo>()

  constructor(
    budget: number,
    prior: Array<{ modelId: string; usage?: UsageLike }> = [],
    opts: GuardOptions | string = {}
  ) {
    if (!validNonNeg(budget)) throw new Error('Invalid budget')
    const options: GuardOptions = typeof opts === 'string' ? { batchId: opts } : opts
    this.budget = budget
    this.batchId = options.batchId || 'unscoped'
    this.store = options.store
    if (this.store) this.refresh()
    for (const call of prior) {
      if (call.usage && validNonNeg(call.usage.cost)) {
        this.observe(call.modelId, call.usage, false)
      } else if (call.usage) {
        throw new Error('Invalid historical billing evidence: stop')
      }
    }
  }

  refresh(): ReturnType<DurableStore['read']> {
    if (this.localHalt) throw new Error(this.localHalt)
    if (!this.store) throw new Error('Durable guard state missing/corrupt/unreadable: stop')
    try {
      this.store.assertAvailable()
      const state = this.store.read()
      for (const [id, rate] of Object.entries(state.observedRates)) {
        this.mergeRate(id, {
          inputCostPerToken: rate.input,
          outputCostPerToken: rate.output,
        })
      }
      this.actual = state.batches[this.batchId]?.knownActualUsd || 0
      this.unknownCharges = state.unknownCharges.length
      this.failClosed = unresolvedBlocksPaid(state)
      return state
    } catch {
      this.localHalt = 'Durable guard state missing/corrupt/unreadable: stop'
      throw new Error(this.localHalt)
    }
  }

  private mergeRate(modelId: string, next: PricingInfo): PricingInfo {
    const previous = this.rates.get(modelId) || {
      inputCostPerToken: 0,
      outputCostPerToken: 0,
    }
    const merged = mergeMaxRates(previous, next)!
    this.rates.set(modelId, merged)
    return merged
  }

  private assertClear(state: ReturnType<DurableStore['read']>): void {
    if (unresolvedBlocksPaid(state)) {
      throw new Error(
        'Durable unresolved unknown/pending spend: explicit resolution/approval required'
      )
    }
  }

  /**
   * Persist an unknown billed (or maybe-billed) charge with actualCost/resolution
   * null, then throw. Does not estimate or zero the spend. No reset helper.
   */
  markUnknown(reason: string, context: Partial<PaidCallContext> = {}): never {
    this.localHalt =
      'Unknown spend permanently halted; explicit resolution/approval required'
    this.failClosed = true
    const callId = context.callId || crypto.randomUUID()
    if (this.store) {
      try {
        this.store.mutate(state => {
          state.pendingRequests = state.pendingRequests.filter(x => x.callId !== callId)
          if (!state.unknownCharges.some(x => x.callId === callId)) {
            state.unknownCharges.push({
              callId,
              batchId: this.batchId,
              modelId: context.modelId ?? null,
              promptName: context.promptName ?? null,
              reason,
              detectedAt: new Date().toISOString(),
              actualCost: null,
              resolution: null,
            })
          }
        })
        this.unknownCharges = this.store.read().unknownCharges.length
      } catch {
        this.localHalt =
          'Failed to persist unknown spend: stop; state/pending must be reconciled'
        throw new Error(this.localHalt)
      }
    } else {
      this.unknownCharges += 1
    }
    throw new Error(this.localHalt)
  }

  observe(
    modelId: string,
    usage: UsageLike | null | undefined,
    charge = true,
    context: Partial<PaidCallContext> = {}
  ): PricingInfo {
    if (!charge) {
      if (!usage || !validNonNeg(usage.cost)) throw new Error('Invalid historical cost')
      return this.mergeRate(modelId, observedRatesFromUsage(usage))
    }
    if (!usage || !validNonNeg(usage.cost)) {
      this.markUnknown('Missing/invalid usage.cost', { ...context, modelId })
    }
    if (this.localHalt) throw new Error(this.localHalt)
    let next: PricingInfo
    try {
      next = observedRatesFromUsage(usage)
    } catch (err) {
      this.markUnknown(err instanceof Error ? err.message : String(err), {
        ...context,
        modelId,
      })
    }
    if (!this.store) {
      this.actual += usage.cost
      return this.mergeRate(modelId, next)
    }
    try {
      this.store.mutate(state => {
        if (state.unknownCharges.length) {
          throw new Error('Existing unresolved unknown spend: stop')
        }
        const pending = context.callId
          ? state.pendingRequests.find(x => x.callId === context.callId)
          : undefined
        if (state.pendingRequests.length && !pending) {
          throw new Error('Unmatched pending request: stop')
        }
        if (pending && pending.batchId !== this.batchId) {
          throw new Error('Pending request batch mismatch')
        }
        const batch = state.batches[this.batchId] || {
          knownActualUsd: 0,
          settledCallIds: [],
        }
        if (context.callId && batch.settledCallIds.includes(context.callId)) {
          throw new Error('Duplicate settlement: stop')
        }
        const billed = usage.cost as number
        batch.knownActualUsd += billed
        state.knownActualUsd += billed
        if (context.callId) batch.settledCallIds.push(context.callId)
        state.batches[this.batchId] = batch
        state.pendingRequests = state.pendingRequests.filter(
          x => x.callId !== context.callId
        )
        const old = state.observedRates[modelId] || { input: 0, output: 0 }
        state.observedRates[modelId] = {
          input: Math.max(old.input, next.inputCostPerToken),
          output: Math.max(old.output, next.outputCostPerToken),
        }
      })
    } catch (err) {
      this.localHalt =
        'Settlement/state write failed: stop; ' +
        (err instanceof Error ? err.message : String(err))
      throw new Error(this.localHalt)
    }
    this.refresh()
    return this.rates.get(modelId)!
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
    // Completion cap is applied once. Reasoning is a subset of completion, not
    // a second billed pool. THINKING_MODEL_OUTPUT_MULTIPLIER is not used here.
    return {
      usd:
        RESERVE_MARGIN *
        (bytes * rates.inputCostPerToken + opts.completionCap * rates.outputCostPerToken),
      inputRate: rates.inputCostPerToken,
      outputRate: rates.outputCostPerToken,
      inputByteAllowance: bytes,
      completionCap: opts.completionCap,
      reasoningPolicy: REASONING_RESERVE_POLICY,
    }
  }

  gate(reserve: ReserveDetails | number): true {
    if (this.localHalt) throw new Error(this.localHalt)
    if (this.store) {
      const state = this.refresh()
      this.assertClear(state)
    } else if (this.failClosed || this.unknownCharges > 0) {
      throw new Error('Unknown billed charge latched: fail closed')
    }
    const usd = typeof reserve === 'number' ? reserve : reserve.usd
    if (!validNonNeg(usd) || this.budget - this.actual < usd) {
      throw new Error('Insufficient remaining estimated budget: stop')
    }
    return true
  }

  /** Persist intent under the global lock before any completion POST. */
  beginRequest(reserve: ReserveDetails, context: PaidCallContext): true {
    if (!context?.callId) throw new Error('Durable request callId required')
    this.gate(reserve)
    if (!this.store) return true
    try {
      this.store.mutate(state => {
        this.assertClear(state)
        const actual = state.batches[this.batchId]?.knownActualUsd || 0
        if (!validNonNeg(reserve.usd) || this.budget - actual < reserve.usd) {
          throw new Error('Insufficient remaining estimated budget')
        }
        state.pendingRequests.push({
          callId: context.callId,
          batchId: this.batchId,
          modelId: context.modelId,
          promptName: context.promptName,
          startedAt: new Date().toISOString(),
          reserveUsd: reserve.usd,
          actualCost: null,
        })
      })
    } catch (err) {
      this.localHalt =
        'Cannot persist pre-request intent: stop; ' +
        (err instanceof Error ? err.message : String(err))
      throw new Error(this.localHalt)
    }
    return true
  }
}
