import { describe, expect, it } from 'vitest'

import type { ModelInfo } from '../api/services'
import {
  filterModelsByProviderToText,
  getModelLimit,
  isModelIdSelectableForUser,
} from '../modelAccess'

const catalog = {
  OpenAI: [
    {
      id: 'openai/gpt-free',
      name: 'GPT Free',
      provider: 'OpenAI',
      tier_access: 'unregistered',
    },
    {
      id: 'openai/gpt-paid',
      name: 'GPT Paid',
      provider: 'OpenAI',
      tier_access: 'paid',
    },
    {
      id: 'openai/dall-e',
      name: 'DALL-E',
      provider: 'OpenAI',
      tier_access: 'unregistered',
      supports_image_generation: true,
    },
  ] satisfies ModelInfo[],
}

describe('compare-core model access', () => {
  it('caps unregistered users at 3 models', () => {
    expect(getModelLimit('unregistered')).toBe(3)
    expect(getModelLimit('pro')).toBe(9)
  })

  it('blocks paid models for anonymous users', () => {
    expect(isModelIdSelectableForUser('openai/gpt-free', catalog, false, null)).toBe(true)
    expect(isModelIdSelectableForUser('openai/gpt-paid', catalog, false, null)).toBe(false)
  })

  it('filters image-generation models out of the text catalog', () => {
    expect(filterModelsByProviderToText(catalog).OpenAI.map((model) => model.id)).toEqual([
      'openai/gpt-free',
      'openai/gpt-paid',
    ])
  })
})
