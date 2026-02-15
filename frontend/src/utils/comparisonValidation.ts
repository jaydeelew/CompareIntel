/**
 * Input validation for comparison submissions
 */

import type { ModelsByProvider } from '../types'

import { formatNumber } from './format'

export interface ValidationParams {
  user: { is_verified?: boolean } | null
  input: string
  selectedModels: string[]
  modelsByProvider: ModelsByProvider
  accurateInputTokens: number | null
}

export type ValidationResult = { valid: true } | { valid: false; error: string }

export function validateComparisonInput(params: ValidationParams): ValidationResult {
  const { user, input, selectedModels, modelsByProvider, accurateInputTokens } = params

  if (user && !user.is_verified) {
    return {
      valid: false,
      error:
        'Please verify your email address before making comparisons. Check your inbox for a verification link from CompareIntel.',
    }
  }

  if (selectedModels.length > 0) {
    const modelInfo = selectedModels
      .map(modelId => {
        for (const providerModels of Object.values(modelsByProvider)) {
          const model = providerModels.find(m => m.id === modelId)
          if (model && model.max_input_tokens) {
            return { id: modelId, name: model.name, maxInputTokens: model.max_input_tokens }
          }
        }
        return null
      })
      .filter((info): info is { id: string; name: string; maxInputTokens: number } => info !== null)

    if (modelInfo.length > 0 && accurateInputTokens !== null && accurateInputTokens > 0) {
      const minMaxInputTokens = Math.min(...modelInfo.map(m => m.maxInputTokens))
      if (accurateInputTokens > minMaxInputTokens) {
        const problemModels = modelInfo
          .filter(m => m.maxInputTokens < accurateInputTokens)
          .map(m => m.name)
        const approxMaxChars = minMaxInputTokens * 4
        const approxInputChars = accurateInputTokens * 4
        const problemModelsText =
          problemModels.length > 0 ? ` Problem model(s): ${problemModels.join(', ')}.` : ''

        return {
          valid: false,
          error: `Your input is too long for one or more of the selected models. The maximum input length is approximately ${formatNumber(approxMaxChars)} characters, but your input is approximately ${formatNumber(approxInputChars)} characters.${problemModelsText} Please shorten your input or select different models that support longer inputs.`,
        }
      }
    }
  }

  if (!input.trim()) {
    return { valid: false, error: 'Please enter some text to compare' }
  }

  if (selectedModels.length === 0) {
    return { valid: false, error: 'Please select at least one model' }
  }

  return { valid: true }
}
