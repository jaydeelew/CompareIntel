import type { ModelsByProvider } from '../types'

/**
 * Parse `?models=id1,id2` from a location search string.
 * Used by model-page CTAs to open the app with a model preselected.
 */
export function parseModelsQueryParam(search: string): string[] {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const raw = params.get('models')
  if (!raw) return []
  return raw
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
}

export function filterKnownModelIds(
  requestedIds: string[],
  modelsByProvider: ModelsByProvider
): string[] {
  const known = new Set(
    Object.values(modelsByProvider)
      .flat()
      .map(model => String(model.id))
  )
  return requestedIds.filter(id => known.has(id))
}
