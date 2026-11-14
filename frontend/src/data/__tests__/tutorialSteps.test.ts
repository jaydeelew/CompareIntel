import { describe, expect, it } from 'vitest'

import type { ModelsByProvider } from '../../types'
import { filterModelsForTutorial } from '../tutorialSteps'

const MODELS: ModelsByProvider = {
  Google: [
    {
      id: 'google/gemini-2.5-flash',
      name: 'Gemini',
      description: '',
      category: 'google',
      provider: 'Google',
      available: true,
      tier_access: 'unregistered',
    },
    {
      id: 'google/gemma-3-27b-it',
      name: 'Gemma',
      description: '',
      category: 'google',
      provider: 'Google',
      available: true,
      tier_access: 'unregistered',
    },
  ],
  DeepSeek: [
    {
      id: 'deepseek/deepseek-v4.1-flash-1017',
      name: 'DeepSeek',
      description: '',
      category: 'deepseek',
      provider: 'DeepSeek',
      available: true,
      tier_access: 'unregistered',
    },
  ],
}

describe('filterModelsForTutorial', () => {
  const starterIds = ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash-1017'] as const

  it('limits provider rows to starter selection models during tutorial', () => {
    const filtered = filterModelsForTutorial(MODELS, true, starterIds)
    expect(filtered.Google?.map(m => m.id)).toEqual(['google/gemini-2.5-flash'])
    expect(filtered.DeepSeek?.map(m => m.id)).toEqual(['deepseek/deepseek-v4.1-flash-1017'])
    expect(filtered.Google?.some(m => m.id === 'google/gemma-3-27b-it')).toBe(false)
  })

  it('no-ops when disabled', () => {
    expect(filterModelsForTutorial(MODELS, false, starterIds)).toEqual(MODELS)
  })
})