/**
 * Tests for image config validation - aspect ratio and image size vs model capabilities.
 * Uses remaining catalog models plus a 2K-only fixture for intersection edge cases.
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

function create2KOnlyModel() {
  return {
    id: 'test/2k-only-image',
    name: '2K Only Image',
    description: 'Fixture model that only supports 2K output',
    category: 'Image',
    provider: 'Test',
    supports_image_generation: true,
    image_aspect_ratios: ['9:16', '2:3', '3:4', '4:5', '1:1', '5:4', '4:3', '3:2', '16:9', '21:9'],
    image_sizes: ['2K'],
  }
}

function createModelsByProvider(models: unknown[]): ModelsByProvider {
  return {
    Test: models as ModelsByProvider['Test'],
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
    it('returns only 2K for a 2K-only model when it is the only selected model', () => {
      const model = create2KOnlyModel()
      const modelsByProvider = createModelsByProvider([model])
      const supported = getSupportedImageSizesForModels(['test/2k-only-image'], modelsByProvider)
      expect(supported).toEqual(['2K'])
    })

    it('disables 1K and 4K when a 2K-only model is selected', () => {
      const model = create2KOnlyModel()
      const modelsByProvider = createModelsByProvider([model])
      const supported = getSupportedImageSizesForModels(['test/2k-only-image'], modelsByProvider)
      expect(supported).not.toContain('1K')
      expect(supported).not.toContain('4K')
      expect(supported).toContain('2K')
    })
  })

  describe('getSupportedAspectRatiosForModels', () => {
    it('returns all aspect ratios for a 2K-only model with the default ratio set', () => {
      const model = create2KOnlyModel()
      const modelsByProvider = createModelsByProvider([model])
      const supported = getSupportedAspectRatiosForModels(['test/2k-only-image'], modelsByProvider)
      expect(supported).toContain('1:1')
      expect(supported).toContain('16:9')
      expect(supported).toContain('9:16')
    })
  })

  describe('isModelCompatibleWithConfig', () => {
    it('returns false for a 2K-only model with 1K', () => {
      const model = create2KOnlyModel()
      const modelsByProvider = createModelsByProvider([model])
      expect(isModelCompatibleWithConfig('test/2k-only-image', '1:1', '1K', modelsByProvider)).toBe(
        false
      )
    })

    it('returns false for a 2K-only model with 4K', () => {
      const model = create2KOnlyModel()
      const modelsByProvider = createModelsByProvider([model])
      expect(isModelCompatibleWithConfig('test/2k-only-image', '1:1', '4K', modelsByProvider)).toBe(
        false
      )
    })

    it('returns true for a 2K-only model with 2K', () => {
      const model = create2KOnlyModel()
      const modelsByProvider = createModelsByProvider([model])
      expect(isModelCompatibleWithConfig('test/2k-only-image', '1:1', '2K', modelsByProvider)).toBe(
        true
      )
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

    it('returns no shared image size for Gemini 2.5 Flash (1K only) + 2K-only model', () => {
      const modelsByProvider = createModelsByProvider([create2KOnlyModel()])
      const selected = ['google/gemini-2.5-flash-image', 'test/2k-only-image']
      const supported = getSupportedImageSizesForModels(selected, modelsByProvider)
      expect(supported).toEqual([])
      expect(hasCommonImageConfig(selected, modelsByProvider)).toBe(false)
    })
  })
})
