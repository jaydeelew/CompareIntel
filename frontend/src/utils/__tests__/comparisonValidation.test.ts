/**
 * Unit tests for comparison input validation (including vision model validation)
 */

import { describe, it, expect } from 'vitest'

import type { ModelsByProvider } from '../../types'
import { validateComparisonInput } from '../comparisonValidation'

const createModelsByProvider = (
  models: Array<{ id: string; name: string; supports_vision?: boolean; max_input_tokens?: number }>
): ModelsByProvider => {
  const byProvider: ModelsByProvider = {}
  for (const m of models) {
    const provider = m.id.split('/')[0]
    if (!byProvider[provider]) byProvider[provider] = []
    byProvider[provider].push({
      id: m.id,
      name: m.name,
      description: '',
      category: 'default',
      provider,
      supports_vision: m.supports_vision,
      max_input_tokens: m.max_input_tokens ?? 128000,
    } as ModelsByProvider[string][number])
  }
  return byProvider
}

describe('validateComparisonInput', () => {
  const baseParams = {
    user: { is_verified: true },
    input: 'Compare these models',
    selectedModels: [] as string[],
    modelsByProvider: createModelsByProvider([]),
    accurateInputTokens: 10,
  }

  describe('vision model validation (hasAttachedImages)', () => {
    it('returns invalid when image attached but no vision-capable model selected', () => {
      const modelsByProvider = createModelsByProvider([
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', supports_vision: false },
      ])
      const result = validateComparisonInput({
        ...baseParams,
        selectedModels: ['anthropic/claude-3-haiku'],
        modelsByProvider,
        hasAttachedImages: true,
      })
      expect(result).toEqual({
        valid: false,
        error: expect.stringContaining(
          "You've attached an image, but none of the selected models can interpret images"
        ),
      })
    })

    it('returns valid when image attached and vision-capable model selected', () => {
      const modelsByProvider = createModelsByProvider([
        { id: 'openai/gpt-4o', name: 'GPT-4o', supports_vision: true },
      ])
      const result = validateComparisonInput({
        ...baseParams,
        selectedModels: ['openai/gpt-4o'],
        modelsByProvider,
        hasAttachedImages: true,
      })
      expect(result).toEqual({ valid: true })
    })

    it('returns valid when image attached and at least one of multiple models supports vision', () => {
      const modelsByProvider = createModelsByProvider([
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', supports_vision: false },
        { id: 'openai/gpt-4o', name: 'GPT-4o', supports_vision: true },
      ])
      const result = validateComparisonInput({
        ...baseParams,
        selectedModels: ['anthropic/claude-3-haiku', 'openai/gpt-4o'],
        modelsByProvider,
        hasAttachedImages: true,
      })
      expect(result).toEqual({ valid: true })
    })

    it('does not require vision model when no images attached', () => {
      const modelsByProvider = createModelsByProvider([
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', supports_vision: false },
      ])
      const result = validateComparisonInput({
        ...baseParams,
        selectedModels: ['anthropic/claude-3-haiku'],
        modelsByProvider,
        hasAttachedImages: false,
      })
      expect(result).toEqual({ valid: true })
    })

    it('returns "select at least one model" when image attached but no models selected', () => {
      const result = validateComparisonInput({
        ...baseParams,
        selectedModels: [],
        modelsByProvider: createModelsByProvider([]),
        hasAttachedImages: true,
      })
      expect(result).toEqual({
        valid: false,
        error: 'Please select at least one model',
      })
    })
  })

  describe('basic validation', () => {
    it('returns invalid for empty input', () => {
      const result = validateComparisonInput({
        ...baseParams,
        input: '   ',
        selectedModels: ['openai/gpt-4o'],
        modelsByProvider: createModelsByProvider([{ id: 'openai/gpt-4o', name: 'GPT-4o' }]),
      })
      expect(result).toEqual({
        valid: false,
        error: 'Please enter some text to compare',
      })
    })

    it('returns invalid when no models selected', () => {
      const result = validateComparisonInput({
        ...baseParams,
        selectedModels: [],
        modelsByProvider: createModelsByProvider([]),
      })
      expect(result).toEqual({
        valid: false,
        error: 'Please select at least one model',
      })
    })

    it('returns valid for valid input with model selected', () => {
      const modelsByProvider = createModelsByProvider([{ id: 'openai/gpt-4o', name: 'GPT-4o' }])
      const result = validateComparisonInput({
        ...baseParams,
        selectedModels: ['openai/gpt-4o'],
        modelsByProvider,
      })
      expect(result).toEqual({ valid: true })
    })
  })
})
