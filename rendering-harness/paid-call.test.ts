/**
 * Live paid-call path tests. Transport is mocked — no OpenRouter, no keys.
 */

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HISTORICAL_UNKNOWN_CHARGES,
  RESERVE_MARGIN,
  SharedCostGuard,
  THINKING_MODEL_OUTPUT_MULTIPLIER,
  type PricingInfo,
} from './budget-guard.js'
import { DurableStore, emptyGuardState } from './durable-spend.js'
import { runPaidPromptAttempt } from './paid-call.js'

const pricing: PricingInfo = {
  inputCostPerToken: 1e-6,
  outputCostPerToken: 2e-6,
}
const catalog = { prompt: 1e-6, completion: 2e-6 }
const prompt = 'x'.repeat(2000)

function withStore(batchId = 'live'): {
  dir: string
  guard: SharedCostGuard
  cleanup: () => void
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-paid-'))
  const stateFile = path.join(dir, 'state.json')
  fs.writeFileSync(stateFile, JSON.stringify(emptyGuardState(), null, 2))
  const store = new DurableStore(stateFile)
  return {
    dir,
    guard: new SharedCostGuard(1, [], { store, batchId }),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

test.describe('Live call path (no API)', () => {
  test('thinking policy: dry-run reserve equals live reserve; 3× is contingency only', () => {
    const live = new SharedCostGuard(1)
    const dry = new SharedCostGuard(1)
    const liveReserve = live.reserve({
      modelId: 'test/thinking',
      prompt,
      completionCap: 2048,
      catalog,
    })
    const dryReserve = dry.reserve({
      modelId: 'test/thinking',
      prompt,
      completionCap: 2048,
      catalog,
    })
    expect(dryReserve.usd).toBe(liveReserve.usd)
    expect(liveReserve.usd).toBeCloseTo(0.00766, 5)
    expect(liveReserve.completionCap).toBe(2048)
    expect(THINKING_MODEL_OUTPUT_MULTIPLIER).toBe(3)
    const bytes = Buffer.byteLength(prompt, 'utf8') + 32
    const withContingency3x =
      RESERVE_MARGIN * (bytes * 1e-6 + 2048 * THINKING_MODEL_OUTPUT_MULTIPLIER * 2e-6)
    expect(liveReserve.usd).not.toBeCloseTo(withContingency3x, 5)
    expect(liveReserve.reasoningPolicy).toMatch(/once/)
  })

  test('200 + usage.cost observes verified billed cost', async () => {
    const x = withStore()
    try {
      const usage = { prompt_tokens: 10, completion_tokens: 20, cost: 0.0042 }
      const result = await runPaidPromptAttempt({
        guard: x.guard,
        modelId: 'test/model',
        prompt,
        completionCap: 2048,
        catalog,
        pricing,
        promptName: '01',
        transport: async () => ({ httpStatus: 200, usage, content: 'ok' }),
      })
      expect(result.actualCost).toBe(0.0042)
      expect(x.guard.actual).toBe(0.0042)
      expect(x.guard.failClosed).toBe(false)
      expect(result.response).toBe('ok')
    } finally {
      x.cleanup()
    }
  })

  test('200 + tokens without usage.cost latches unknown; does not guess catalog cost', async () => {
    const x = withStore()
    try {
      const usage = { prompt_tokens: 100, completion_tokens: 200 }
      const result = await runPaidPromptAttempt({
        guard: x.guard,
        modelId: 'test/model',
        prompt,
        completionCap: 2048,
        catalog,
        pricing,
        promptName: '01',
        transport: async () => ({ httpStatus: 200, usage, content: 'ok' }),
      })
      expect(result.error).toMatch(/Unknown billed cost|Unknown spend/)
      expect(x.guard.failClosed).toBe(true)
      expect(x.guard.actual).toBe(0)
      const resume = await runPaidPromptAttempt({
        guard: x.guard,
        modelId: 'test/model',
        prompt: 'hi',
        completionCap: 8,
        catalog,
        pricing,
        promptName: '02',
        transport: async () => ({
          httpStatus: 200,
          usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0001 },
          content: 'next',
        }),
      })
      expect(resume.skipped).toBe(true)
      expect(resume.error).toMatch(/Unknown spend|unresolved/)
    } finally {
      x.cleanup()
    }
  })

  test('transport throw after beginRequest latches unknown; resume fail-closed', async () => {
    const x = withStore()
    try {
      const result = await runPaidPromptAttempt({
        guard: x.guard,
        modelId: 'test/model',
        prompt,
        completionCap: 2048,
        catalog,
        pricing,
        promptName: '01',
        transport: async () => {
          throw new Error('timeout')
        },
      })
      expect(result.error).toMatch(/timeout/)
      expect(x.guard.failClosed).toBe(true)
      const resume = await runPaidPromptAttempt({
        guard: x.guard,
        modelId: 'test/model',
        prompt: 'hi',
        completionCap: 8,
        catalog,
        pricing,
        promptName: '02',
        transport: async () => ({
          httpStatus: 200,
          usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.01 },
          content: 'nope',
        }),
      })
      expect(resume.skipped).toBe(true)
      expect(resume.error).toMatch(/Unknown spend|unresolved/)
    } finally {
      x.cleanup()
    }
  })

  test('HTTP 502 after intent persists unknown (not $0)', async () => {
    const x = withStore()
    try {
      await runPaidPromptAttempt({
        guard: x.guard,
        modelId: 'x-ai/grok-4.3',
        prompt,
        completionCap: 2048,
        catalog,
        pricing,
        promptName: '03-code-blocks',
        transport: async () => ({ httpStatus: 502, usage: null }),
      })
      expect(x.guard.failClosed).toBe(true)
      expect(x.guard.actual).toBe(0)
    } finally {
      x.cleanup()
    }
  })

  test('committed historical 2 unknowns block a new batch without resetting them', async () => {
    expect(HISTORICAL_UNKNOWN_CHARGES).toBe(2)
    const store = new DurableStore(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard-global-state.json')
    )
    const state = store.read()
    expect(state.unknownCharges).toHaveLength(2)
    expect(state.unknownCharges.every(r => r.actualCost === null && r.resolution === null)).toBe(
      true
    )
    const batch = new SharedCostGuard(10, [], { store, batchId: '20c' })
    const attempt = await runPaidPromptAttempt({
      guard: batch,
      modelId: 'openai/gpt-5.2-pro',
      prompt,
      completionCap: 2048,
      catalog,
      pricing,
      promptName: '01',
      transport: async () => ({
        httpStatus: 200,
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.39 },
        content: 'must not send',
      }),
    })
    expect(attempt.skipped).toBe(true)
    expect(attempt.error).toMatch(/unresolved/)
    expect(store.read().unknownCharges).toHaveLength(2)
    expect(store.read().unknownCharges.every(r => r.resolution === null)).toBe(true)
  })
})
