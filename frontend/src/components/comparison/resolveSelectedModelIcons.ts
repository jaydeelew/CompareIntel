import type { ModelsByProvider } from '../../types'

export interface SelectedModelIconItem {
  modelId: string
  provider: string
  displayName: string
}

/**
 * Map active selected model IDs to provider + display name in selection order.
 * Unknown IDs (catalog still loading) are omitted so the row stays empty until
 * the live selection can be resolved — no hardcoded defaults.
 */
export function resolveSelectedModelIcons(
  selectedModels: string[],
  modelsByProvider: ModelsByProvider
): SelectedModelIconItem[] {
  const catalog = new Map<string, SelectedModelIconItem>()
  for (const [providerKey, models] of Object.entries(modelsByProvider)) {
    for (const model of models) {
      catalog.set(model.id, {
        modelId: model.id,
        provider: model.provider || providerKey,
        displayName: model.name,
      })
    }
  }
  const items: SelectedModelIconItem[] = []
  for (const modelId of selectedModels) {
    const entry = catalog.get(modelId)
    if (entry) items.push(entry)
  }
  return items
}
