/**
 * Qwen's first image model shares the qwen/ prefix with text models.
 * The image tab must list it under Qwen and leave text models on the text tab.
 */

import { describe, expect, it } from 'vitest'

import type { ModelsByProvider } from '../../types'
import { filterModelsByProviderToImage, filterModelsByProviderToText } from '../visionModels'

function models(): ModelsByProvider {
  return {
    Qwen: [
      {
        id: 'qwen/qwen3.8-max-0902',
        name: 'Qwen3.8 Max',
        description: '',
        category: 'Language',
        provider: 'Qwen',
        supports_image_generation: false,
      },
      {
        id: 'qwen/qwen-image-2.1-pro',
        name: 'Qwen Image 2.1 Pro',
        description: '',
        category: 'Image',
        provider: 'Qwen',
        supports_image_generation: true,
      },
    ],
    OpenAI: [
      {
        id: 'openai/gpt-6-astra',
        name: 'Gpt 6 Astra',
        description: '',
        category: 'Language',
        provider: 'OpenAI',
        supports_image_generation: false,
      },
    ],
  } as ModelsByProvider
}

describe('Qwen image listing', () => {
  it('shows Qwen on the image tab with only the image model', () => {
    const imageProviders = filterModelsByProviderToImage(models())
    expect(Object.keys(imageProviders)).toEqual(['Qwen'])
    expect(imageProviders.Qwen?.map(model => model.id)).toEqual(['qwen/qwen-image-2.1-pro'])
  })

  it('keeps Qwen text models on the text tab', () => {
    const textProviders = filterModelsByProviderToText(models())
    expect(textProviders.Qwen?.map(model => model.id)).toEqual(['qwen/qwen3.8-max-0902'])
    expect(textProviders.OpenAI?.map(model => model.id)).toEqual(['openai/gpt-6-astra'])
  })
})
