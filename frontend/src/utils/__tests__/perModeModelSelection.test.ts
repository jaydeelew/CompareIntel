import { describe, expect, it } from 'vitest'

import type { ModelsByProvider } from '../../types'
import {
  filterModelIdsToMode,
  sanitizeModeSelection,
  splitModelIdsByMode,
} from '../perModeModelSelection'

function mockCatalog(): ModelsByProvider {
  return {
    OpenAI: [
      {
        id: 'openai/gpt-text',
        name: 'GPT Text',
        description: '',
        category: 'Language',
        provider: 'OpenAI',
        tier_access: 'unregistered',
        supports_image_generation: false,
      },
      {
        id: 'openai/gpt-text-2',
        name: 'GPT Text 2',
        description: '',
        category: 'Language',
        provider: 'OpenAI',
        tier_access: 'unregistered',
        supports_image_generation: false,
      },
      {
        id: 'openai/image-gen',
        name: 'GPT Image',
        description: '',
        category: 'Image',
        provider: 'OpenAI',
        tier_access: 'unregistered',
        supports_image_generation: true,
      },
    ],
  } as ModelsByProvider
}

describe('perModeModelSelection utilities', () => {
  const catalog = mockCatalog()

  it('splits combined ids into text and image buckets', () => {
    expect(
      splitModelIdsByMode(['openai/gpt-text', 'openai/image-gen', 'openai/gpt-text-2'], catalog)
    ).toEqual({
      text: ['openai/gpt-text', 'openai/gpt-text-2'],
      image: ['openai/image-gen'],
    })
  })

  it('filters ids to the active mode only', () => {
    expect(filterModelIdsToMode(['openai/gpt-text', 'openai/image-gen'], 'text', catalog)).toEqual([
      'openai/gpt-text',
    ])
    expect(filterModelIdsToMode(['openai/gpt-text', 'openai/image-gen'], 'image', catalog)).toEqual(
      ['openai/image-gen']
    )
  })

  it('drops unavailable models and enforces tier limits on restore', () => {
    const limitedCatalog = {
      OpenAI: [
        ...(catalog.OpenAI ?? []),
        {
          id: 'openai/removed',
          name: 'Removed',
          description: '',
          category: 'Language',
          provider: 'OpenAI',
          tier_access: 'unregistered',
          supports_image_generation: false,
          available: false,
        },
        {
          id: 'openai/paid-only',
          name: 'Paid',
          description: '',
          category: 'Language',
          provider: 'OpenAI',
          tier_access: 'paid',
          supports_image_generation: false,
        },
      ],
    } as ModelsByProvider

    const result = sanitizeModeSelection({
      modelIds: [
        'openai/gpt-text',
        'openai/gpt-text-2',
        'openai/removed',
        'openai/paid-only',
        'openai/image-gen',
      ],
      modelMode: 'text',
      modelsByProvider: limitedCatalog,
      isAuthenticated: false,
      user: null,
      maxModelsLimit: 1,
    })

    expect(result).toEqual(['openai/gpt-text'])
  })
})
