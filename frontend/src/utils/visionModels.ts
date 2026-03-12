/**
 * Vision model utilities - helps detect when selected models can interpret images.
 * Used when API metadata (supports_vision) is missing or stale.
 */

import type { ModelsByProvider } from '../types'

/** Known vision-capable model IDs from Best for images and common vision models */
export const KNOWN_VISION_MODEL_IDS = new Set([
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.1',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'google/gemini-3-flash-preview',
  'google/gemini-2.0-flash-001',
  'mistralai/mistral-medium-3.1',
])

/**
 * Returns true if the given model supports vision (can interpret images).
 * Checks modelsByProvider first via supports_vision, then falls back to known list.
 */
export function modelSupportsVision(modelId: string, modelsByProvider: ModelsByProvider): boolean {
  const idStr = String(modelId)
  for (const providerModels of Object.values(modelsByProvider)) {
    const model = providerModels.find(m => String(m.id) === idStr)
    if (model?.supports_vision) return true
  }
  return KNOWN_VISION_MODEL_IDS.has(idStr)
}

/**
 * Returns true if at least one of the selected models supports vision.
 */
export function hasVisionModelSelected(
  selectedModels: string[],
  modelsByProvider: ModelsByProvider
): boolean {
  return selectedModels.some(modelId => modelSupportsVision(modelId, modelsByProvider))
}

/**
 * Returns display names for model IDs (for notifications, etc.).
 * Falls back to model ID if name not found.
 */
export function getModelNames(modelIds: string[], modelsByProvider: ModelsByProvider): string[] {
  return modelIds.map(id => {
    const idStr = String(id)
    for (const providerModels of Object.values(modelsByProvider)) {
      const model = providerModels.find(m => String(m.id) === idStr)
      if (model?.name) return model.name
    }
    return idStr
  })
}

/**
 * Filter models to only those that support vision (image interpretation).
 */
export function filterToVisionModels<T extends { id: string }>(
  models: T[],
  modelsByProvider: ModelsByProvider
): T[] {
  return models.filter(m => modelSupportsVision(String(m.id), modelsByProvider))
}
