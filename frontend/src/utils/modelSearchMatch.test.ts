import { describe, expect, it } from 'vitest'

import type { Model } from '../types'

import {
  levenshteinWithin,
  MODEL_SEARCH_NO_MATCH,
  modelSearchScore,
} from './modelSearchMatch'

function m(partial: Partial<Model> & Pick<Model, 'id' | 'name' | 'provider'>): Model {
  return {
    description: '',
    category: 'test',
    available: true,
    tier_access: 'free',
    ...partial,
  }
}

describe('modelSearchScore', () => {
  it('does not match single letter to substring inside provider (e.g. black / bytedance)', () => {
    const flux = m({
      id: 'black-forest-labs/flux-2-pro',
      name: 'Flux 2 Pro',
      provider: 'Black Forest Labs',
    })
    expect(modelSearchScore(flux, 'c')).toBe(MODEL_SEARCH_NO_MATCH)

    const river = m({
      id: 'bytedance-seed/riverflow-v2-fast',
      name: 'Riverflow V2 Fast',
      provider: 'ByteDance Seed',
    })
    expect(modelSearchScore(river, 'c')).toBe(MODEL_SEARCH_NO_MATCH)
  })

  it('matches single letter on word-start in model name', () => {
    const claude = m({
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      provider: 'Anthropic',
    })
    expect(modelSearchScore(claude, 'c')).toBeLessThan(MODEL_SEARCH_NO_MATCH)
  })

  it('matches provider when query is a word prefix (e.g. google)', () => {
    const gemini = m({
      id: 'google/gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'Google',
    })
    expect(modelSearchScore(gemini, 'goo')).toBeLessThanOrEqual(4)
  })

  it('matches fuzzy on typos for longer queries', () => {
    const flux = m({
      id: 'black-forest-labs/flux-2-pro',
      name: 'Flux 2 Pro',
      provider: 'Black Forest Labs',
    })
    const s = modelSearchScore(flux, 'fluxe')
    expect(s).toBeGreaterThanOrEqual(60)
    expect(s).toBeLessThan(MODEL_SEARCH_NO_MATCH)
  })
})

describe('levenshteinWithin', () => {
  it('returns null when distance exceeds max', () => {
    expect(levenshteinWithin('abc', 'xyz', 1)).toBeNull()
  })

  it('returns exact distance within bound', () => {
    expect(levenshteinWithin('fluxe', 'flux', 2)).toBe(1)
  })
})
