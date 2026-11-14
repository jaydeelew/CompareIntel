import { describe, expect, it } from 'vitest'

import type { ModelsByProvider } from '../../types'
import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
  selectStarterSelectionModels,
} from '../starterSelectionModels'

function createModel(
  id: string,
  provider: string,
  tier: 'unregistered' | 'paid' = 'unregistered'
) {
  return {
    id,
    name: id,
    description: 'test',
    category: provider.toLowerCase(),
    provider,
    available: true,
    tier_access: tier,
  }
}

describe('starterSelectionModels', () => {
  const registry: ModelsByProvider = {
    Google: [
      createModel('google/gemini-2.5-flash', 'Google'),
      createModel('google/gemma-3-27b-it', 'Google'),
    ],
    DeepSeek: [createModel('deepseek/deepseek-v4.1-flash-1017', 'DeepSeek')],
  }

  it('picks the same two models as Starter Selection priority list', () => {
    expect(resolveStarterSelectionModelIds(registry)).toEqual([
      'google/gemini-2.5-flash',
      'deepseek/deepseek-v4.1-flash-1017',
    ])
  })

  it('falls back when fewer than two priority models exist', () => {
    const sparse: ModelsByProvider = {
      Google: [createModel('google/gemma-3-27b-it', 'Google')],
    }
    expect(selectStarterSelectionModels(new Set(['google/gemma-3-27b-it']))).toEqual([
      'google/gemma-3-27b-it',
    ])
    expect(resolveStarterSelectionModelIds(sparse)).toEqual(['google/gemma-3-27b-it'])
  })

  it('lists providers that host the resolved model ids', () => {
    const ids = resolveStarterSelectionModelIds(registry)
    expect(getProvidersForModelIds(registry, ids).sort()).toEqual(['DeepSeek', 'Google'])
  })
})