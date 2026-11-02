import { describe, expect, it } from 'vitest'

import { createModelId } from '../../types'
import {
  formatVerdictCost,
  formatVerdictLatency,
  highlightExtremes,
  latencyMsBetween,
  lookupPerModelUsage,
  type VerdictModelRow,
} from '../verdictMetrics'

function row(
  partial: Partial<VerdictModelRow> & Pick<VerdictModelRow, 'modelId'>
): VerdictModelRow {
  return {
    modelName: partial.modelName ?? partial.modelId,
    content: partial.content ?? '',
    costUsd: partial.costUsd ?? null,
    latencyMs: partial.latencyMs ?? null,
    isError: partial.isError ?? false,
    ...partial,
  }
}

describe('verdictMetrics', () => {
  it('formats cost and latency or a dash when missing', () => {
    expect(formatVerdictCost(null)).toBe('—')
    expect(formatVerdictCost(0.0012)).toBe('$0.0012')
    expect(formatVerdictCost(0.02)).toBe('$0.020')
    expect(formatVerdictLatency(null)).toBe('—')
    expect(formatVerdictLatency(800)).toBe('800ms')
    expect(formatVerdictLatency(1500)).toBe('1.5s')
  })

  it('highlights every model tied for cheapest or fastest known value', () => {
    const a = createModelId('a')
    const b = createModelId('b')
    const c = createModelId('c')
    const { cheapestIds, fastestIds } = highlightExtremes([
      row({ modelId: a, costUsd: 0.01, latencyMs: 900 }),
      row({ modelId: b, costUsd: 0.01, latencyMs: 400 }),
      row({ modelId: c, costUsd: null, latencyMs: 400 }),
    ])
    expect([...cheapestIds].sort()).toEqual([a, b].sort())
    expect([...fastestIds].sort()).toEqual([b, c].sort())
  })

  it('looks up usage by exact or branded model id and ignores non-positive latency', () => {
    const modelId = createModelId('openai/gpt-4o')
    expect(lookupPerModelUsage({ 'openai/gpt-4o': { cost_usd: 0.2 } }, modelId)?.cost_usd).toBe(0.2)
    expect(latencyMsBetween('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBeNull()
    expect(latencyMsBetween('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.500Z')).toBe(1500)
  })
})
