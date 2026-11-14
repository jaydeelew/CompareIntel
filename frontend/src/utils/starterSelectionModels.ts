import type { ModelsByProvider } from '../types'

/**
 * Model priority list for the anonymous Starter Selection and onboarding tutorial.
 * Ordered by recognizability and popularity for anonymous users.
 * Must be models from unregistered_tier_models in backend/data/models_registry.json.
 */
export const DEFAULT_MODEL_PRIORITY = [
  'google/gemini-2.5-flash',
  'deepseek/deepseek-v4.1-flash-1017',
  'deepseek/deepseek-v4-flash',
  'google/gemini-3.1-flash-lite-preview',
  'microsoft/phi-4',
  'deepseek/deepseek-v3.2',
  'google/gemma-4-31b-it',
  'qwen/qwen3-coder-next',
] as const

/** Selectable unregistered text models from the current registry listing. */
export function getSelectableUnregisteredTextModels(
  modelsByProvider: ModelsByProvider
): Set<string> {
  const selectable = new Set<string>()
  for (const providerModels of Object.values(modelsByProvider)) {
    for (const model of providerModels) {
      if (
        model.available !== false &&
        model.tier_access === 'unregistered' &&
        !model.supports_image_generation
      ) {
        selectable.add(String(model.id))
      }
    }
  }
  return selectable
}

/** Pick up to two models using {@link DEFAULT_MODEL_PRIORITY}, with registry fallback. */
export function selectStarterSelectionModels(selectableModels: Set<string>): string[] {
  const selected: string[] = []

  for (const modelId of DEFAULT_MODEL_PRIORITY) {
    if (selectableModels.has(modelId)) {
      selected.push(modelId)
      if (selected.length === 2) {
        return selected
      }
    }
  }

  if (selected.length < 2) {
    for (const modelId of selectableModels) {
      if (!selected.includes(modelId)) {
        selected.push(modelId)
        if (selected.length === 2) {
          break
        }
      }
    }
  }

  return selected
}

/** Same model IDs the anonymous Starter Selection uses on first visit. */
export function resolveStarterSelectionModelIds(modelsByProvider: ModelsByProvider): string[] {
  return selectStarterSelectionModels(getSelectableUnregisteredTextModels(modelsByProvider))
}

export function getProvidersForModelIds(
  modelsByProvider: ModelsByProvider,
  modelIds: readonly string[]
): string[] {
  const allowed = new Set(modelIds.map(String))
  const providers: string[] = []
  for (const [providerName, models] of Object.entries(modelsByProvider)) {
    if (models.some(m => allowed.has(String(m.id)))) {
      providers.push(providerName)
    }
  }
  return providers
}

export function isAnyProviderExpanded(
  openDropdowns: Set<string>,
  providerNames: readonly string[]
): boolean {
  return providerNames.some(name => openDropdowns.has(name))
}