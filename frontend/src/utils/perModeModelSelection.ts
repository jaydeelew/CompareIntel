import type { ModelsByProvider, User } from '../types'

import { isModelIdSelectableForUser } from './modelTierAccess'
import { filterModelsByProviderToImage, filterModelsByProviderToText } from './visionModels'

export type ModelMode = 'text' | 'image'

export interface PerModeSelectionCache {
  text: string[]
  image: string[]
}

export function createEmptyPerModeSelectionCache(): PerModeSelectionCache {
  return { text: [], image: [] }
}

export function getModelIdsInMode(
  modelMode: ModelMode,
  modelsByProvider: ModelsByProvider
): Set<string> {
  const filtered =
    modelMode === 'image'
      ? filterModelsByProviderToImage(modelsByProvider)
      : filterModelsByProviderToText(modelsByProvider)
  return new Set(
    Object.values(filtered)
      .flat()
      .map(m => String(m.id))
  )
}

export function filterModelIdsToMode(
  modelIds: string[],
  modelMode: ModelMode,
  modelsByProvider: ModelsByProvider
): string[] {
  const allowed = getModelIdsInMode(modelMode, modelsByProvider)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of modelIds) {
    const key = String(id)
    if (!allowed.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export function splitModelIdsByMode(
  modelIds: string[],
  modelsByProvider: ModelsByProvider
): PerModeSelectionCache {
  return {
    text: filterModelIdsToMode(modelIds, 'text', modelsByProvider),
    image: filterModelIdsToMode(modelIds, 'image', modelsByProvider),
  }
}

export interface SanitizeModeSelectionOptions {
  modelIds: string[]
  modelMode: ModelMode
  modelsByProvider: ModelsByProvider
  isAuthenticated: boolean
  user: User | null
  maxModelsLimit: number
}

/** Keep only models valid for the mode, available to the user, within tier count limits. */
export function sanitizeModeSelection({
  modelIds,
  modelMode,
  modelsByProvider,
  isAuthenticated,
  user,
  maxModelsLimit,
}: SanitizeModeSelectionOptions): string[] {
  const inMode = filterModelIdsToMode(modelIds, modelMode, modelsByProvider)
  const selectable = inMode.filter(id =>
    isModelIdSelectableForUser(id, modelsByProvider, isAuthenticated, user)
  )
  return selectable.slice(0, maxModelsLimit)
}

export function sanitizePerModeCache(
  cache: PerModeSelectionCache,
  modelsByProvider: ModelsByProvider,
  isAuthenticated: boolean,
  user: User | null,
  maxModelsLimit: number
): PerModeSelectionCache {
  return {
    text: sanitizeModeSelection({
      modelIds: cache.text,
      modelMode: 'text',
      modelsByProvider,
      isAuthenticated,
      user,
      maxModelsLimit,
    }),
    image: sanitizeModeSelection({
      modelIds: cache.image,
      modelMode: 'image',
      modelsByProvider,
      isAuthenticated,
      user,
      maxModelsLimit,
    }),
  }
}
