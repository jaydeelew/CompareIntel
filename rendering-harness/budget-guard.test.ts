/**
 * Budget guard boundary tests — import the production module, do not copy the logic.
 * No paid API calls.
 */

import { test, expect } from '@playwright/test'
import {
  BUDGET_GUARD_IS_HARD_CAP,
  RESERVE_MARGIN,
  SharedCostGuard,
  THINKING_MODEL_OUTPUT_MULTIPLIER,
  canAffordRequest,
  estimateRequestCost,
  estimateTokens,
  observedRatesFromUsage,
  preRequestBudgetDecision,
  remainingBudget,
  resolveActualCost,
  type PricingInfo,
} from './budget-guard.js'

const pricing: PricingInfo = {
  inputCostPerToken: 0.000001,
  outputCostPerToken: 0.000002,
}

test.describe('Budget Guard (production module)', () => {
  test('PASS: request within remaining budget is allowed', () => {
    const decision = preRequestBudgetDecision({
      pricing,
      modelId: 'test/model',
      promptTokens: 500,
      maxTokens: 1024,
      isThinkingModel: false,
      maxUsd: 10,
      spentUsd: 5,
    })
    expect(decision.action).toBe('proceed')
    if (decision.action === 'proceed') {
      expect(decision.estimatedCost).toBeLessThanOrEqual(5)
      expect(canAffordRequest(decision.estimatedCost, remainingBudget(10, 5))).toBe(true)
    }
  })

  test('FAIL: request that exceeds remaining budget is refused', () => {
    const estimated = estimateRequestCost(500, 1024, pricing, false)!
    const decision = preRequestBudgetDecision({
      pricing,
      modelId: 'test/model',
      promptTokens: 500,
      maxTokens: 1024,
      isThinkingModel: false,
      maxUsd: estimated * 0.5,
      spentUsd: 0,
    })
    expect(decision.action).toBe('refuse')
    if (decision.action === 'refuse') {
      expect(decision.reason).toMatch(/estimated cost/)
    }
  })

  test('FAIL: exceeding remaining by the smallest amount is refused', () => {
    const estimated = estimateRequestCost(100, 100, pricing, false)!
    const decision = preRequestBudgetDecision({
      pricing,
      modelId: 'test/model',
      promptTokens: 100,
      maxTokens: 100,
      isThinkingModel: false,
      maxUsd: estimated,
      spentUsd: 0.0001,
    })
    expect(decision.action).toBe('refuse')
  })

  test('PASS: exact remaining budget match is allowed', () => {
    const estimated = estimateRequestCost(100, 100, pricing, false)!
    const decision = preRequestBudgetDecision({
      pricing,
      modelId: 'test/model',
      promptTokens: 100,
      maxTokens: 100,
      isThinkingModel: false,
      maxUsd: estimated,
      spentUsd: 0,
    })
    expect(decision.action).toBe('proceed')
    if (decision.action === 'proceed') {
      expect(decision.estimatedCost).toBe(estimated)
    }
  })

  test('FAIL: missing pricing is refused — never guessed', () => {
    const estimated = estimateRequestCost(500, 1024, undefined, false)
    expect(estimated).toBeNull()
    const decision = preRequestBudgetDecision({
      pricing: undefined,
      modelId: 'unknown/model',
      promptTokens: 500,
      maxTokens: 1024,
      isThinkingModel: false,
      maxUsd: 10,
      spentUsd: 0,
    })
    expect(decision.action).toBe('refuse')
    if (decision.action === 'refuse') {
      expect(decision.reason).toMatch(/No pricing data/)
      expect(decision.reason).not.toMatch(/1M/)
    }
  })

  test('FAIL: missing usage data throws (cost unknowable)', () => {
    expect(() => resolveActualCost(null, pricing, 'test/model')).toThrow(
      /No usage data returned/
    )
    expect(() => resolveActualCost({}, pricing, 'test/model')).toThrow(/No usage data returned/)
  })

  test('FAIL: usage without cost and without pricing throws', () => {
    expect(() =>
      resolveActualCost({ prompt_tokens: 100, completion_tokens: 200 }, undefined, 'test/model')
    ).toThrow(/No pricing data/)
  })

  test('PASS: usage.cost is billed as-is', () => {
    const cost = resolveActualCost(
      { prompt_tokens: 100, completion_tokens: 200, cost: 0.0042 },
      pricing,
      'test/model'
    )
    expect(cost).toBe(0.0042)
  })

  test('FAIL: a refused request must not spend, so a later request is not unbudgeted', () => {
    const pricey: PricingInfo = { inputCostPerToken: 0.001, outputCostPerToken: 0.002 }
    const maxUsd = 5
    let spent = 0
    const outcomes: { action: 'proceed' | 'refuse'; spentAfter: number }[] = []

    for (let i = 0; i < 4; i++) {
      const spentBefore = spent
      const decision = preRequestBudgetDecision({
        pricing: pricey,
        modelId: 'test/model',
        promptTokens: 500,
        maxTokens: 1024,
        isThinkingModel: false,
        maxUsd,
        spentUsd: spent,
      })
      if (decision.action === 'refuse') {
        expect(spent).toBe(spentBefore)
        outcomes.push({ action: 'refuse', spentAfter: spent })
        continue
      }
      spent += decision.estimatedCost
      outcomes.push({ action: 'proceed', spentAfter: spent })
    }

    expect(outcomes.some(o => o.action === 'proceed')).toBe(true)
    expect(outcomes.some(o => o.action === 'refuse')).toBe(true)
    expect(spent).toBeLessThanOrEqual(maxUsd)
    const firstRefuse = outcomes.findIndex(o => o.action === 'refuse')
    expect(outcomes.slice(firstRefuse).every(o => o.action === 'refuse')).toBe(true)
  })

  test('PASS: thinking models reserve 3x output tokens', () => {
    const normal = estimateRequestCost(100, 1000, pricing, false)!
    const thinking = estimateRequestCost(100, 1000, pricing, true)!
    const extraOutput =
      1000 * (THINKING_MODEL_OUTPUT_MULTIPLIER - 1) * pricing.outputCostPerToken
    expect(thinking - normal).toBeCloseTo(extraOutput, 12)
  })

  test('PASS: token estimate is ceil(chars/4)', () => {
    expect(estimateTokens('Hello world')).toBe(3)
    expect(estimateTokens('The quick brown fox jumps over the lazy dog')).toBe(11)
  })
})

/**
 * GLM 5.3 batch 13 billed rates from attached usage (no keys). Catalog is
 * 0.0699/1.40 per million; Fireworks 0.98/3.08, DigitalOcean 0.91/2.86,
 * Wafer matches catalog, Decart 0.56/1.78. Components reconcile to usage.cost.
 */
const GLM_CATALOG: PricingInfo = {
  inputCostPerToken: 0.0000000699,
  outputCostPerToken: 0.0000014,
}
const GLM_CATALOG_PRICING = { prompt: '0.0000000699', completion: '0.0000014' }
const GLM_PROMPT = 'x'.repeat(901)

function glmUsage(opts: {
  promptTokens: number
  completionTokens: number
  promptCost: number
  completionCost: number
  cost: number
}) {
  return {
    prompt_tokens: opts.promptTokens,
    completion_tokens: opts.completionTokens,
    cost: opts.cost,
    cost_details: {
      upstream_inference_prompt_cost: opts.promptCost,
      upstream_inference_completions_cost: opts.completionCost,
    },
  }
}

const FIREWORKS_01 = glmUsage({
  promptTokens: 279,
  completionTokens: 6601,
  promptCost: 0.00027342,
  completionCost: 0.02033108,
  cost: 0.0206045,
})
const WAFER_02 = glmUsage({
  promptTokens: 202,
  completionTokens: 183,
  promptCost: 0.0000141198,
  completionCost: 0.0002562,
  cost: 0.0002703198,
})
const DIGITALOCEAN_04 = glmUsage({
  promptTokens: 311,
  completionTokens: 8192,
  promptCost: 0.00028301,
  completionCost: 0.02342912,
  cost: 0.02371213,
})
const FIREWORKS_05 = glmUsage({
  promptTokens: 434,
  completionTokens: 7156,
  promptCost: 0.00042532,
  completionCost: 0.02204048,
  cost: 0.0224658,
})
const DECART_06 = glmUsage({
  promptTokens: 347,
  completionTokens: 1287,
  promptCost: 0.00019432,
  completionCost: 0.00229086,
  cost: 0.00248518,
})

test.describe('SharedCostGuard — catalog vs observed provider rates (GLM 5.3)', () => {
  test('catalog-only 8192 reserve underestimates Fireworks/DO billed cost', () => {
    const guard = new SharedCostGuard(1)
    const reserve = guard.reserve({
      modelId: 'z-ai/glm-5.3',
      prompt: GLM_PROMPT,
      completionCap: 8192,
      catalog: GLM_CATALOG_PRICING,
    })
    expect(reserve.usd).toBeCloseTo(0.0144, 3)
    expect(reserve.usd).toBeLessThan(FIREWORKS_01.cost)
    expect(reserve.usd).toBeLessThan(DIGITALOCEAN_04.cost)
    expect(reserve.usd).toBeLessThan(FIREWORKS_05.cost)
    expect(BUDGET_GUARD_IS_HARD_CAP).toBe(false)
  })

  test('Fireworks/DO/Decart/Wafer cost components reconcile to usage.cost', () => {
    for (const usage of [FIREWORKS_01, WAFER_02, DIGITALOCEAN_04, FIREWORKS_05, DECART_06]) {
      const parts = usage.cost_details
      expect(parts.upstream_inference_prompt_cost + parts.upstream_inference_completions_cost).toBeCloseTo(
        usage.cost,
        10
      )
    }
    const fireworks = observedRatesFromUsage(FIREWORKS_01)
    expect(fireworks.inputCostPerToken * 1e6).toBeCloseTo(0.98, 8)
    expect(fireworks.outputCostPerToken * 1e6).toBeCloseTo(3.08, 8)
    const wafer = observedRatesFromUsage(WAFER_02)
    expect(wafer.inputCostPerToken * 1e6).toBeCloseTo(0.0699, 6)
    expect(wafer.outputCostPerToken * 1e6).toBeCloseTo(1.4, 6)
    const ocean = observedRatesFromUsage(DIGITALOCEAN_04)
    expect(ocean.inputCostPerToken * 1e6).toBeCloseTo(0.91, 6)
    expect(ocean.outputCostPerToken * 1e6).toBeCloseTo(2.86, 6)
    const decart = observedRatesFromUsage(DECART_06)
    expect(decart.inputCostPerToken * 1e6).toBeCloseTo(0.56, 6)
    expect(decart.outputCostPerToken * 1e6).toBeCloseTo(1.78, 6)
  })

  test('historical + newly observed same-model rates raise later reserves', () => {
    const guard = new SharedCostGuard(1, [{ modelId: 'z-ai/glm-5.3', usage: FIREWORKS_01 }])
    const afterFireworks = guard.reserve({
      modelId: 'z-ai/glm-5.3',
      prompt: GLM_PROMPT,
      completionCap: 8192,
      catalog: GLM_CATALOG_PRICING,
    })
    expect(afterFireworks.inputRate * 1e6).toBeCloseTo(0.98, 8)
    expect(afterFireworks.outputRate * 1e6).toBeCloseTo(3.08, 8)
    expect(afterFireworks.usd).toBeGreaterThan(FIREWORKS_05.cost)
    expect(afterFireworks.usd).toBeGreaterThan(DIGITALOCEAN_04.cost)
    guard.observe('z-ai/glm-5.3', WAFER_02, false)
    guard.observe('z-ai/glm-5.3', DECART_06, false)
    const stillMax = guard.rates.get('z-ai/glm-5.3')!
    expect(stillMax.inputCostPerToken * 1e6).toBeCloseTo(0.98, 8)
    expect(stillMax.outputCostPerToken * 1e6).toBeCloseTo(3.08, 8)
  })

  test('Wafer catalog-matching rates do not lower the Fireworks max', () => {
    const guard = new SharedCostGuard(1)
    guard.observe('z-ai/glm-5.3', FIREWORKS_01, false)
    guard.observe('z-ai/glm-5.3', WAFER_02, false)
    const rates = guard.rates.get('z-ai/glm-5.3')!
    expect(rates.inputCostPerToken * 1e6).toBeCloseTo(0.98, 8)
    expect(rates.outputCostPerToken * 1e6).toBeCloseTo(3.08, 8)
  })

  test('unknown usage.cost throws — never guessed', () => {
    const guard = new SharedCostGuard(1)
    expect(() => observedRatesFromUsage({})).toThrow(/Unknown usage.cost/)
    expect(() => guard.observe('z-ai/glm-5.3', { prompt_tokens: 10, completion_tokens: 10 })).toThrow(
      /Unknown usage.cost/
    )
  })

  test('invalid cost components throw', () => {
    expect(() =>
      observedRatesFromUsage({
        cost: 0.01,
        prompt_tokens: 0,
        completion_tokens: 10,
        cost_details: {
          upstream_inference_prompt_cost: 0.01,
          upstream_inference_completions_cost: 0,
        },
      })
    ).toThrow(/Invalid cost components/)
  })

  test('gate refuses when estimated reserve exceeds remaining (not a hard cap claim)', () => {
    const guard = new SharedCostGuard(0.01)
    const reserve = guard.reserve({
      modelId: 'z-ai/glm-5.3',
      prompt: GLM_PROMPT,
      completionCap: 32768,
      catalog: GLM_CATALOG_PRICING,
      effectiveInputRate: 9.8e-7,
      effectiveOutputRate: 3.08e-6,
    })
    expect(reserve.usd).toBeGreaterThan(0.01)
    expect(() => guard.gate(reserve)).toThrow(/estimated budget/)
    expect(BUDGET_GUARD_IS_HARD_CAP).toBe(false)
  })

  test('1.25 margin is applied to max rates', () => {
    const guard = new SharedCostGuard(1)
    const reserve = guard.reserve({
      modelId: 'z-ai/glm-5.3',
      prompt: 'hi',
      completionCap: 100,
      catalog: { prompt: 0.001, completion: 0.002 },
    })
    const bytes = Buffer.byteLength('hi', 'utf8') + 32
    expect(reserve.usd).toBeCloseTo(RESERVE_MARGIN * (bytes * 0.001 + 100 * 0.002), 12)
  })

  test('unobserved higher provider routing can still exceed reserve — estimate only', () => {
    const guard = new SharedCostGuard(1)
    const catalogReserve = guard.reserve({
      modelId: 'z-ai/glm-5.3',
      prompt: GLM_PROMPT,
      completionCap: 8192,
      catalog: GLM_CATALOG_PRICING,
    })
    expect(FIREWORKS_01.cost).toBeGreaterThan(catalogReserve.usd)
    expect(BUDGET_GUARD_IS_HARD_CAP).toBe(false)
    expect(GLM_CATALOG.outputCostPerToken).toBeLessThan(observedRatesFromUsage(FIREWORKS_01).outputCostPerToken)
  })
})
