import type { ModelsByProvider } from '../types'

/** A catalog row used only for id membership and an optional display name. */
export interface KnownCatalogModel {
  id: string
  name?: string
}

export interface ConversationModelPartition {
  /**
   * False when the catalog has not loaded. Callers must keep every id;
   * an empty catalog is not evidence that models were removed.
   */
  catalogReady: boolean
  /** Ids still listed in the catalog, in input order, duplicates removed. */
  available: string[]
  /** Ids missing from the catalog, in input order, duplicates removed. */
  removed: string[]
}

export function isModelCatalogReady(modelsByProvider: ModelsByProvider): boolean {
  return Object.values(modelsByProvider).some(models => models.length > 0)
}

function knownModelsFromCatalog(modelsByProvider: ModelsByProvider): KnownCatalogModel[] {
  return Object.values(modelsByProvider).flat()
}

/**
 * Split stored conversation model ids into those still in the lineup and those
 * removed for any reason. `knownModels === null` means the catalog is not ready.
 */
export function partitionAgainstKnownModels(
  modelIds: readonly string[],
  knownModels: readonly KnownCatalogModel[] | null
): ConversationModelPartition {
  if (knownModels === null) {
    return {
      catalogReady: false,
      available: modelIds.map(id => String(id)),
      removed: [],
    }
  }

  const byId = new Map<string, KnownCatalogModel>()
  for (const model of knownModels) {
    byId.set(String(model.id), model)
  }

  const available: string[] = []
  const removed: string[] = []
  const seen = new Set<string>()
  for (const id of modelIds) {
    const key = String(id)
    if (seen.has(key)) continue
    seen.add(key)
    if (byId.has(key)) available.push(key)
    else removed.push(key)
  }
  return { catalogReady: true, available, removed }
}

/** Partition against the live models-by-provider catalog. */
export function partitionConversationModels(
  modelIds: readonly string[],
  modelsByProvider: ModelsByProvider
): ConversationModelPartition {
  if (!isModelCatalogReady(modelsByProvider)) {
    return partitionAgainstKnownModels(modelIds, null)
  }
  return partitionAgainstKnownModels(modelIds, knownModelsFromCatalog(modelsByProvider))
}

/** Catalog display name when the id is still listed, otherwise the id itself. */
export function modelDisplayLabel(
  modelId: string,
  knownModels: readonly KnownCatalogModel[] | null | undefined
): string {
  const key = String(modelId)
  const match = knownModels?.find(model => String(model.id) === key)
  const name = match?.name?.trim()
  return name || key
}

function formatNameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

/**
 * One short notice for models dropped from follow-ups.
 * `availableCount` is how many conversation models are still in the lineup.
 */
export function retiredFollowUpNotice(labels: string[], availableCount: number): string | null {
  const names = labels.map(label => label.trim()).filter(Boolean)
  if (names.length === 0) return null
  const listed = formatNameList(names)
  const verb = names.length === 1 ? 'is' : 'are'
  if (availableCount <= 0) {
    return `${listed} ${verb} no longer available. Start a new comparison to continue.`
  }
  return `${listed} ${verb} no longer available, so follow-ups will go to the remaining models.`
}

/** Follow-up selection for a stored model list. Unready catalogs keep every id. */
export function followUpModelIds(
  modelIds: readonly string[],
  modelsByProvider: ModelsByProvider
): string[] {
  return partitionConversationModels(modelIds, modelsByProvider).available
}
