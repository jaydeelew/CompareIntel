import type { Model } from '../../types'

/**
 * The selected-models rail names models the user already picked.
 * Tutorial provider steps replace the visible list with only the model for the
 * current step, so an earlier selection is no longer in that list.
 */
export function modelForSelectedRail(
  modelId: string,
  visibleModels: readonly Model[],
  catalogModels?: readonly Model[] | null
): Model | undefined {
  return (
    catalogModels?.find(model => model.id === modelId) ??
    visibleModels.find(model => model.id === modelId)
  )
}
