/**
 * Durable global spend tests. Isolated temp state. No OpenRouter, no keys.
 */

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SharedCostGuard, RESERVE_MARGIN, type UsageLike } from './budget-guard.js'
import {
  DurableStore,
  emptyGuardState,
  type DurableFs,
  type GuardGlobalState,
} from './durable-spend.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const catalog = { prompt: 1e-6, completion: 2e-6 }
const modelId = 'test/model'
const prompt = 'x'
const usage: UsageLike = {
  prompt_tokens: 100,
  completion_tokens: 1000,
  cost: 0.0041,
  cost_details: {
    upstream_inference_prompt_cost: 0.0001,
    upstream_inference_completions_cost: 0.004,
  },
}
const context = { callId: 'cell1', modelId, promptName: '01' }

function writeState(file: string, state: GuardGlobalState): void {
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n')
}

function fixture(state?: GuardGlobalState): {
  dir: string
  stateFile: string
  store: DurableStore
  guard: (budget?: number, batchId?: string) => SharedCostGuard
  read: () => GuardGlobalState
  events: string[]
  failRename: { value: boolean }
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-guard-'))
  const stateFile = path.join(dir, 'state.json')
  writeState(stateFile, state || emptyGuardState())
  const events: string[] = []
  const failRename = { value: false }
  const io: DurableFs = {
    readFileSync: p => fs.readFileSync(p, 'utf8'),
    existsSync: p => fs.existsSync(p),
    openSync: (p, flags, mode) => fs.openSync(p, flags as fs.OpenMode, mode),
    writeFileSync: (fd, data) => {
      events.push('write')
      fs.writeFileSync(fd, data)
    },
    fsyncSync: fd => {
      events.push('fsync')
      fs.fsyncSync(fd)
    },
    closeSync: fd => fs.closeSync(fd),
    renameSync: (from, to) => {
      events.push('rename')
      if (failRename.value) throw new Error('Synthetic rename failure')
      fs.renameSync(from, to)
    },
    mkdirSync: p => fs.mkdirSync(p),
    rmdirSync: p => fs.rmdirSync(p),
    unlinkSync: p => fs.unlinkSync(p),
  }
  const store = new DurableStore(stateFile, io)
  return {
    dir,
    stateFile,
    store,
    events,
    failRename,
    read: () => JSON.parse(fs.readFileSync(stateFile, 'utf8')) as GuardGlobalState,
    guard: (budget = 1, batchId = 'batchA') =>
      new SharedCostGuard(budget, [], { store, batchId }),
  }
}

test.describe('Durable global spend', () => {
  test.afterEach(() => {
    /* fixtures rm themselves in each test */
  })

  test('caught missing cost persists BEFORE throw and next gate blocks', () => {
    const x = fixture()
    try {
      const g = x.guard()
      expect(() => g.observe(modelId, null, true, context)).toThrow(/Unknown spend/)
      expect(x.read().unknownCharges).toHaveLength(1)
      expect(x.read().unknownCharges[0].actualCost).toBeNull()
      expect(x.read().unknownCharges[0].resolution).toBeNull()
      expect(() =>
        g.gate(g.reserve({ modelId, prompt, completionCap: 10, catalog }))
      ).toThrow(/Unknown spend|unresolved/)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('reinstantiate same batch cannot reset unknown', () => {
    const x = fixture()
    try {
      const g = x.guard(1, 'batchA')
      try {
        g.observe(modelId, {})
      } catch {
        /* persist */
      }
      const next = x.guard(1, 'batchA')
      expect(() =>
        next.gate(next.reserve({ modelId, prompt, completionCap: 10, catalog }))
      ).toThrow(/unresolved/)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('new batch ID is still blocked by global unknown', () => {
    const x = fixture()
    try {
      try {
        x.guard(1, 'oldbatch').observe(modelId, {})
      } catch {
        /* persist */
      }
      const g = x.guard(999, 'brandnewbatch')
      expect(() =>
        g.gate(g.reserve({ modelId, prompt, completionCap: 10, catalog }))
      ).toThrow(/unresolved/)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('zero usage cost is valid including zero tokens', () => {
    const x = fixture()
    try {
      const g = x.guard()
      g.beginRequest(g.reserve({ modelId, prompt, completionCap: 10, catalog }), context)
      g.observe('free', { cost: 0, prompt_tokens: 0, completion_tokens: 0 }, true, context)
      expect(g.actual).toBe(0)
      expect(x.read().unknownCharges).toHaveLength(0)
      expect(
        g.gate(g.reserve({ modelId, prompt, completionCap: 1, catalog }))
      ).toBe(true)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('request intent is durable before API; interrupted restart blocked', () => {
    const x = fixture()
    try {
      const g = x.guard(1, 'A')
      g.beginRequest(g.reserve({ modelId, prompt, completionCap: 10, catalog }), context)
      expect(x.read().pendingRequests).toHaveLength(1)
      expect(x.read().pendingRequests[0].actualCost).toBeNull()
      const next = x.guard(999, 'B')
      expect(() =>
        next.gate(next.reserve({ modelId, prompt, completionCap: 1, catalog }))
      ).toThrow(/pending|unresolved/)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('known settlement removes intent and persists cost once', () => {
    const x = fixture()
    try {
      const g = x.guard(1, 'A')
      g.beginRequest(g.reserve({ modelId, prompt, completionCap: 10, catalog }), context)
      g.observe(modelId, usage, true, context)
      expect(x.read().pendingRequests).toHaveLength(0)
      expect(x.read().knownActualUsd).toBe(0.0041)
      const next = x.guard(1, 'A')
      expect(next.actual).toBe(0.0041)
      expect(
        next.gate(next.reserve({ modelId, prompt, completionCap: 1, catalog }))
      ).toBe(true)
      expect(() => g.observe(modelId, usage, true, context)).toThrow(/Duplicate|Settlement/)
      expect(x.read().knownActualUsd).toBe(0.0041)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('transport unknown preserves null cost and removes intent', () => {
    const x = fixture()
    try {
      const g = x.guard(1, 'A')
      g.beginRequest(g.reserve({ modelId, prompt, completionCap: 10, catalog }), context)
      expect(() => g.markUnknown('synthetic timeout', context)).toThrow(/Unknown spend/)
      expect(x.read().pendingRequests).toHaveLength(0)
      expect(x.read().unknownCharges[0].actualCost).toBeNull()
      expect(x.read().unknownCharges[0].resolution).toBeNull()
      expect(x.read().knownActualUsd).toBe(0)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('atomic writes flush file then rename then directory', () => {
    const x = fixture()
    try {
      const g = x.guard()
      try {
        g.observe(modelId, {})
      } catch {
        /* persist */
      }
      const write = x.events.indexOf('write')
      const rename = x.events.indexOf('rename')
      expect(write).toBeGreaterThanOrEqual(0)
      expect(rename).toBeGreaterThan(write)
      expect(x.events.slice(write + 1, rename)).toContain('fsync')
      expect(x.events.slice(rename + 1)).toContain('fsync')
      expect(fs.existsSync(x.stateFile + '.lock')).toBe(false)
      expect(x.read().unknownCharges).toHaveLength(1)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('atomic rename failure keeps original and durable blocking lock', () => {
    const x = fixture()
    try {
      const old = fs.readFileSync(x.stateFile, 'utf8')
      const g = x.guard()
      x.failRename.value = true
      expect(() => g.observe(modelId, {})).toThrow(/persist/)
      expect(fs.readFileSync(x.stateFile, 'utf8')).toBe(old)
      expect(fs.existsSync(x.stateFile + '.lock')).toBe(true)
      expect(() => x.guard(1, 'newbatch')).toThrow(/missing\/corrupt\/unreadable/)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('missing state never automatically resets', () => {
    const x = fixture()
    try {
      fs.unlinkSync(x.stateFile)
      expect(() => x.guard()).toThrow(/missing\/corrupt\/unreadable/)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('malformed state fails closed', () => {
    const x = fixture()
    try {
      fs.writeFileSync(x.stateFile, '{broken')
      expect(() => x.guard()).toThrow(/missing\/corrupt\/unreadable/)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('historical unknown blocks all batch IDs without assumed zero', () => {
    const x = fixture()
    try {
      const s = x.read()
      s.unknownCharges = [
        {
          callId: 'historical-unknown-1',
          actualCost: null,
          resolution: null,
          modelId: 'x-ai/grok-4.3',
        },
        {
          callId: 'historical-unknown-2',
          actualCost: null,
          resolution: null,
          modelId: 'tencent/hy4-preview',
        },
      ]
      writeState(x.stateFile, s)
      for (const name of ['20c', 'anything']) {
        const g = x.guard(999, name)
        expect(() =>
          g.gate(g.reserve({ modelId, prompt, completionCap: 10, catalog }))
        ).toThrow(/unresolved/)
      }
      expect(x.read().knownActualUsd).toBe(0)
      expect(x.read().unknownCharges.every(row => row.actualCost === null)).toBe(true)
      expect(x.read().unknownCharges.every(row => row.resolution === null)).toBe(true)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('fresh Node process cannot bypass global unknown with a new batch', () => {
    const x = fixture()
    try {
      try {
        x.guard(1, 'old').observe(modelId, {})
      } catch {
        /* persist */
      }
      const probe = path.join(x.dir, 'probe.ts')
      fs.writeFileSync(
        probe,
        `
import { SharedCostGuard } from ${JSON.stringify(path.join(__dirname, 'budget-guard.ts'))}
import { DurableStore } from ${JSON.stringify(path.join(__dirname, 'durable-spend.ts'))}
const store = new DurableStore(${JSON.stringify(x.stateFile)})
const g = new SharedCostGuard(999, [], { store, batchId: 'new-process-new-batch' })
try {
  g.gate({ usd: 0.001, inputRate: 1e-6, outputRate: 2e-6, inputByteAllowance: 32, completionCap: 1 })
  process.exit(9)
} catch (e) {
  if (!String((e as Error).message).includes('unresolved')) throw e
  process.stdout.write('BLOCKED')
}
`
      )
      const out = execFileSync(
        path.join(__dirname, 'node_modules', '.bin', 'tsx'),
        [probe],
        { encoding: 'utf8', cwd: __dirname }
      )
      expect(out).toBe('BLOCKED')
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('committed production state has two historical unknowns as null/null', () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'guard-global-state.json'), 'utf8')
    ) as GuardGlobalState
    expect(raw.unknownCharges).toHaveLength(2)
    expect(raw.unknownCharges.every(r => r.actualCost === null && r.resolution === null)).toBe(
      true
    )
    expect(raw.unknownCharges.map(r => r.callId).sort()).toEqual([
      'historical-unknown-1',
      'historical-unknown-2',
    ])
    expect(raw.knownActualUsd).toBe(3.7760560956)
    expect(raw.pendingRequests).toHaveLength(0)
    const store = new DurableStore(path.join(__dirname, 'guard-global-state.json'))
    const g = new SharedCostGuard(999, [], { store, batchId: '20c' })
    expect(() =>
      g.gate(g.reserve({ modelId, prompt, completionCap: 10, catalog }))
    ).toThrow(/unresolved/)
  })

  test('logical unmatched observe releases lock and does not hide pending settlement', () => {
    const x = fixture()
    try {
      const g = x.guard(1, 'A')
      const real = { callId: 'cell-real', modelId, promptName: '01' }
      g.beginRequest(g.reserve({ modelId, prompt, completionCap: 10, catalog }), real)
      const before = x.read()
      expect(before.pendingRequests).toHaveLength(1)
      expect(before.knownActualUsd).toBe(0)
      expect(() =>
        g.observe(modelId, usage, true, {
          callId: 'cell-other',
          modelId,
          promptName: '02',
        })
      ).toThrow(/Unmatched pending/)
      expect(fs.existsSync(x.stateFile + '.lock')).toBe(false)
      const afterThrow = x.read()
      expect(afterThrow.pendingRequests).toEqual(before.pendingRequests)
      expect(afterThrow.knownActualUsd).toBe(0)
      expect(afterThrow.unknownCharges).toHaveLength(0)
      g.observe(modelId, usage, true, real)
      expect(fs.existsSync(x.stateFile + '.lock')).toBe(false)
      expect(x.read().pendingRequests).toHaveLength(0)
      expect(x.read().knownActualUsd).toBe(0.0041)
      expect(x.read().unknownCharges).toHaveLength(0)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('logical duplicate observe releases lock without resetting known spend', () => {
    const x = fixture()
    try {
      const g = x.guard(1, 'A')
      const first = { callId: 'cell1', modelId, promptName: '01' }
      g.beginRequest(g.reserve({ modelId, prompt, completionCap: 10, catalog }), first)
      g.observe(modelId, usage, true, first)
      expect(x.read().knownActualUsd).toBe(0.0041)
      expect(() => g.observe(modelId, usage, true, first)).toThrow(/Duplicate settlement/)
      expect(fs.existsSync(x.stateFile + '.lock')).toBe(false)
      expect(x.read().knownActualUsd).toBe(0.0041)
      expect(x.read().pendingRequests).toHaveLength(0)
      const second = { callId: 'cell2', modelId, promptName: '02' }
      g.beginRequest(g.reserve({ modelId, prompt, completionCap: 10, catalog }), second)
      g.observe(modelId, usage, true, second)
      expect(x.read().knownActualUsd).toBeCloseTo(0.0082, 12)
      expect(x.read().pendingRequests).toHaveLength(0)
      expect(x.read().unknownCharges).toHaveLength(0)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })

  test('cap-once + 25% is the live reserve; 3x is not applied', () => {
    const x = fixture()
    try {
      const g = x.guard()
      const long = 'x'.repeat(2000)
      const reserve = g.reserve({
        modelId,
        prompt: long,
        completionCap: 2048,
        catalog,
      })
      const bytes = Buffer.byteLength(long, 'utf8') + 32
      expect(reserve.usd).toBeCloseTo(RESERVE_MARGIN * (bytes * 1e-6 + 2048 * 2e-6), 12)
      expect(reserve.usd).toBeCloseTo(0.00766, 5)
      expect(reserve.reasoningPolicy).toMatch(/once/)
      expect(reserve.reasoningPolicy).not.toMatch(/3×|3x/)
    } finally {
      fs.rmSync(x.dir, { recursive: true, force: true })
    }
  })
})
