/**
 * Tests for image config validation - aspect ratio and image size vs model capabilities.
 * Ensures that models like Flux 2 Flex (which only support 2K) correctly disable 1K and 4K.
 */

import type { ModelsByProvider } from '../../types'
import {
  getSupportedAspectRatiosForModels,
  getSupportedImageSizesForModels,
  hasCommonImageConfig,
  isModelCompatibleWithConfig,
  orderAspectRatiosLikeAdvanced,
  orderImageSizesLikeAdvanced,
} from '../imageConfigValidation'

function createFlux2FlexModel() {
  return {
    id: 'black-forest-labs/flux.2-flex',
    name: 'Flux 2 Flex',
    description: 'Flexible image generation model',
    category: 'Image',
    provider: 'Black Forest Labs',
    supports_image_generation: true,
    image_aspect_ratios: ['9:16', '2:3', '3:4', '4:5', '1:1', '5:4', '4:3', '3:2', '16:9', '21:9'],
    image_sizes: ['2K'], // Only 2K passes validation per test results (RES_MISMATCH for 1K, 4K)
  }
}

function createModelsByProvider(models: unknown[]): ModelsByProvider {
  return {
    'Black Forest Labs': models as ModelsByProvider['Black Forest Labs'],
  }
}

describe('imageConfigValidation', () => {
  describe('orderAspectRatiosLikeAdvanced', () => {
    it('orders by Advanced / portrait-to-landscape canonical order', () => {
      const shuffled = ['16:9', '1:1', '9:16', '4:3']
      expect(orderAspectRatiosLikeAdvanced(shuffled)).toEqual(['9:16', '1:1', '4:3', '16:9'])
    })

    it('appends ratios not in the canonical list after ordered ones', () => {
      expect(orderAspectRatiosLikeAdvanced(['10:10', '1:1'])).toEqual(['1:1', '10:10'])
    })
  })

  describe('orderImageSizesLikeAdvanced', () => {
    it('orders as 1K, 2K, 4K when present', () => {
      expect(orderImageSizesLikeAdvanced(['4K', '1K'])).toEqual(['1K', '4K'])
    })
  })

  describe('getSupportedImageSizesForModels', () => {
    it('returns only 2K for Flux 2 Flex when it is the only selected model', () => {
      const fluxModel = createFlux2FlexModel()
      const modelsByProvider = createModelsByProvider([fluxModel])
      const supported = getSupportedImageSizesForModels(
        ['black-forest-labs/flux.2-flex'],
        modelsByProvider
      )
      expect(supported).toEqual(['2K'])
    })

    it('disables 1K and 4K when Flux 2 Flex is selected', () => {
      const fluxModel = createFlux2FlexModel()
      const modelsByProvider = createModelsByProvider([fluxModel])
      const supported = getSupportedImageSizesForModels(
        ['black-forest-labs/flux.2-flex'],
        modelsByProvider
      )
      expect(supported).not.toContain('1K')
      expect(supported).not.toContain('4K')
      expect(supported).toContain('2K')
    })
  })

  describe('getSupportedAspectRatiosForModels', () => {
    it('returns all aspect ratios for Flux 2 Flex (all pass at 2K)', () => {
      const fluxModel = createFlux2FlexModel()
      const modelsByProvider = createModelsByProvider([fluxModel])
      const supported = getSupportedAspectRatiosForModels(
        ['black-forest-labs/flux.2-flex'],
        modelsByProvider
      )
      expect(supported).toContain('1:1')
      expect(supported).toContain('16:9')
      expect(supported).toContain('9:16')
    })
  })

  describe('isModelCompatibleWithConfig', () => {
    it('returns false for Flux 2 Flex with 1K (RES_MISMATCH)', () => {
      const fluxModel = createFlux2FlexModel()
      const modelsByProvider = createModelsByProvider([fluxModel])
      expect(
        isModelCompatibleWithConfig('black-forest-labs/flux.2-flex', '1:1', '1K', modelsByProvider)
      ).toBe(false)
    })

    it('returns false for Flux 2 Flex with 4K (RES_MISMATCH)', () => {
      const fluxModel = createFlux2FlexModel()
      const modelsByProvider = createModelsByProvider([fluxModel])
      expect(
        isModelCompatibleWithConfig('black-forest-labs/flux.2-flex', '1:1', '4K', modelsByProvider)
      ).toBe(false)
    })

    it('returns true for Flux 2 Flex with 2K', () => {
      const fluxModel = createFlux2FlexModel()
      const modelsByProvider = createModelsByProvider([fluxModel])
      expect(
        isModelCompatibleWithConfig('black-forest-labs/flux.2-flex', '1:1', '2K', modelsByProvider)
      ).toBe(true)
    })

    it('returns only 2K and 4K for Seedream 4.5 (1K has RES_MISMATCH per test results)', () => {
      const supported = getSupportedImageSizesForModels(
        ['bytedance-seed/seedream-4.5'],
        {} as ModelsByProvider
      )
      expect(supported).toEqual(['2K', '4K'])
      expect(supported).not.toContain('1K')
    })

    it('excludes 4:5 and 5:4 for Seedream 4.5 (AR_MISMATCH at 1K per test results)', () => {
      const supported = getSupportedAspectRatiosForModels(
        ['bytedance-seed/seedream-4.5'],
        {} as ModelsByProvider
      )
      expect(supported).not.toContain('4:5')
      expect(supported).not.toContain('5:4')
      expect(supported).toContain('1:1')
    })

    it('returns only 1:1 for OpenAI GPT-5 image models (1:1 @ 1K only per test results)', () => {
      const supported = getSupportedAspectRatiosForModels(
        ['openai/gpt-5-image'],
        {} as ModelsByProvider
      )
      expect(supported).toEqual(['1:1'])
      expect(supported).not.toContain('16:9')
    })

    it('returns only 1K for OpenAI GPT-5 image models', () => {
      const supported = getSupportedImageSizesForModels(
        ['openai/gpt-5-image'],
        {} as ModelsByProvider
      )
      expect(supported).toEqual(['1K'])
    })

    it('returns only 1K for Gemini 2.5 Flash Image (1K only per test results)', () => {
      const supported = getSupportedImageSizesForModels(
        ['google/gemini-2.5-flash-image'],
        {} as ModelsByProvider
      )
      expect(supported).toEqual(['1K'])
      expect(supported).not.toContain('2K')
    })

    it('returns no shared image size for Gemini 2.5 Flash (1K only) + Flux 2 Flex (2K only)', () => {
      const supported = getSupportedImageSizesForModels(
        ['google/gemini-2.5-flash-image', 'black-forest-labs/flux.2-flex'],
        {} as ModelsByProvider
      )
      expect(supported).toEqual([])
      expect(
        hasCommonImageConfig(
          ['google/gemini-2.5-flash-image', 'black-forest-labs/flux.2-flex'],
          {} as ModelsByProvider
        )
      ).toBe(false)
    })
  })
})
