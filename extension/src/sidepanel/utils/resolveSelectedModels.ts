import {
  isModelIdSelectableForUser,
  type ModelResult,
  type ModelsByProvider,
  type User,
} from '@compareintel/core'

export function isModelCatalogReady(modelsByProvider: ModelsByProvider): boolean {
  return Object.values(modelsByProvider).some((models) => models.length > 0)
}

export function conversationModelIds(options: {
  selectedModels?: string[]
  results?: Array<{ modelId: string }>
  conversationHistory?: Array<{ role: string; model_id?: string }>
}): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  const add = (id: string | undefined) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }

  for (const id of options.selectedModels ?? []) add(id)
  for (const result of options.results ?? []) add(result.modelId)
  for (const message of options.conversationHistory ?? []) {
    if (message.role === 'assistant') add(message.model_id)
  }
  return ids
}

/** Restore the models still in the chat. A non-empty saved selection is kept as-is. */
export function hydrateSelectedModelIds(options: {
  selectedModels?: string[]
  results?: Array<{ modelId: string }>
  conversationHistory?: Array<{ role: string; model_id?: string }>
}): string[] {
  if (options.selectedModels && options.selectedModels.length > 0) {
    return [...options.selectedModels]
  }
  return conversationModelIds({
    results: options.results,
    conversationHistory: options.conversationHistory,
  })
}

export function sameModelIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function synthesizeResultsFromHistory(
  history: Array<{ role: string; content: string; model_id?: string }>,
  modelNameForId?: (modelId: string) => string
): ModelResult[] {
  const lastByModel = new Map<string, string>()
  for (const message of history) {
    if (message.role === 'assistant' && message.model_id) {
      lastByModel.set(message.model_id, message.content)
    }
  }
  return [...lastByModel.entries()].map(([modelId, content]) => ({
    modelId,
    modelName: modelNameForId?.(modelId) ?? modelId.split('/').pop() ?? modelId,
    content,
    isStreaming: false,
    error: null,
    isComplete: true,
  }))
}

export function hydrateConversationResults(
  results: ModelResult[] | undefined,
  history: Array<{ role: string; content: string; model_id?: string }>
): ModelResult[] {
  if (results && results.length > 0) return results
  return synthesizeResultsFromHistory(history)
}

/**
 * Keep an existing selection while the catalog is still loading.
 * If selection was wiped, recover model IDs from the current results.
 */
export function resolveSelectedModelsForCatalog(options: {
  selectedModels: string[]
  fallbackModelIds: string[]
  modelsByProvider: ModelsByProvider
  isAuthenticated: boolean
  user: User | null
}): string[] {
  const { selectedModels, fallbackModelIds, modelsByProvider, isAuthenticated, user } = options
  const source = selectedModels.length > 0 ? selectedModels : fallbackModelIds
  if (!isModelCatalogReady(modelsByProvider)) {
    return source
  }
  return source.filter((id) =>
    isModelIdSelectableForUser(id, modelsByProvider, isAuthenticated, user)
  )
}
