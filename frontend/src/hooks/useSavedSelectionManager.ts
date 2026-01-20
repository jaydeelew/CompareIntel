import { useCallback } from 'react'

import type { CompareResponse } from '../types'
import type { ModelConversation } from '../types/conversation'
import type { ModelsByProvider } from '../types/models'
import { showNotification } from '../utils'

interface UseSavedSelectionManagerOptions {
  selectedModels: string[]
  modelsByProvider: ModelsByProvider
  maxModelsLimit: number
  response: CompareResponse | null
  conversations: ModelConversation[]
  saveModelSelection: (name: string, models: string[]) => { success: boolean; error?: string }
  loadModelSelectionFromStorage: (id: string) => string[] | null
  setSelectedModels: (models: string[]) => void
  setOpenDropdowns: React.Dispatch<React.SetStateAction<Set<string>>>
  setConversations: (conversations: ModelConversation[]) => void
  setResponse: (response: CompareResponse | null) => void
  getDefaultSelectionId: () => string | null
  setDefaultSelectionOverridden: (overridden: boolean) => void
  onSelectionSaved?: () => void
}

export function useSavedSelectionManager(options: UseSavedSelectionManagerOptions) {
  const {
    selectedModels,
    modelsByProvider,
    maxModelsLimit,
    response,
    conversations,
    saveModelSelection,
    loadModelSelectionFromStorage,
    setSelectedModels,
    setOpenDropdowns,
    setConversations,
    setResponse,
    getDefaultSelectionId,
    setDefaultSelectionOverridden,
    onSelectionSaved,
  } = options

  const handleSaveModelSelection = useCallback(
    (name: string) => {
      const result = saveModelSelection(name, selectedModels)
      if (result.success) {
        onSelectionSaved?.()
      }
      return result
    },
    [onSelectionSaved, saveModelSelection, selectedModels]
  )

  const handleLoadModelSelection = useCallback(
    (id: string) => {
      const modelIds = loadModelSelectionFromStorage(id)
      if (modelIds) {
        const validModelIds = modelIds.filter(modelId => {
          for (const providerModels of Object.values(modelsByProvider)) {
            if (providerModels.some(m => String(m.id) === modelId)) {
              return true
            }
          }
          return false
        })

        const limitedModelIds = validModelIds.slice(0, maxModelsLimit)

        if (limitedModelIds.length === 0) {
          showNotification('None of the saved models are available anymore', 'error')
          return
        }

        if (limitedModelIds.length < modelIds.length) {
          showNotification(
            'Some models were removed (not available or tier limit exceeded)',
            'success'
          )
        }

        setSelectedModels(limitedModelIds)

        setOpenDropdowns(prev => {
          const newSet = new Set(prev)
          let hasChanges = false

          for (const provider of prev) {
            const providerModels = modelsByProvider[provider]
            if (providerModels) {
              const hasSelectedModels = providerModels.some(model =>
                limitedModelIds.includes(String(model.id))
              )

              if (!hasSelectedModels) {
                newSet.delete(provider)
                hasChanges = true
              }
            }
          }

          for (const [provider, providerModels] of Object.entries(modelsByProvider)) {
            if (providerModels) {
              const hasSelectedModels = providerModels.some(model =>
                limitedModelIds.includes(String(model.id))
              )

              if (hasSelectedModels && !newSet.has(provider)) {
                newSet.add(provider)
                hasChanges = true
              }
            }
          }

          return hasChanges ? newSet : prev
        })

        if (response || conversations.length > 0) {
          setConversations([])
          setResponse(null)
        }

        const defaultSelectionId = getDefaultSelectionId()
        if (defaultSelectionId === id) {
          setDefaultSelectionOverridden(false)
        }
      }
    },
    [
      loadModelSelectionFromStorage,
      modelsByProvider,
      maxModelsLimit,
      setSelectedModels,
      setOpenDropdowns,
      response,
      conversations.length,
      setConversations,
      setResponse,
      getDefaultSelectionId,
      setDefaultSelectionOverridden,
    ]
  )

  return {
    handleSaveModelSelection,
    handleLoadModelSelection,
  }
}
