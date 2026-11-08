/**
 * Budget guard boundary tests — import the production module, do not copy the logic.
 * No paid API calls.
 */

import { test, expect } from '@playwright/test'
import {
  THINKING_MODEL_OUTPUT_MULTIPLIER,
  canAffordRequest,
  estimateRequestCost,
  estimateTokens,
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
