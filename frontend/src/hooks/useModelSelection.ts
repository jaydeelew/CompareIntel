import { useState, useCallback, useMemo } from 'react'

import { getModelLimit } from '../config/constants'
import type { User } from '../types'

export interface UseModelSelectionOptions {
  isAuthenticated: boolean
  user: User | null
}

export interface UseModelSelectionReturn {
  selectedModels: string[]
  setSelectedModels: React.Dispatch<React.SetStateAction<string[]>>
  originalSelectedModels: string[]
  setOriginalSelectedModels: React.Dispatch<React.SetStateAction<string[]>>
  maxModelsLimit: number
  canSelectMore: boolean
  isModelSelected: (modelId: string) => boolean
  toggleModelSelection: (modelId: string) => void
  clearSelection: () => void
}

// Manages model selection with tier-based limits
export function useModelSelection({
  isAuthenticated,
  user,
}: UseModelSelectionOptions): UseModelSelectionReturn {
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [originalSelectedModels, setOriginalSelectedModels] = useState<string[]>([])

  const maxModelsLimit = useMemo(() => {
    if (!isAuthenticated || !user) return getModelLimit('unregistered')
    return getModelLimit(user.subscription_tier)
  }, [isAuthenticated, user])

  const canSelectMore = selectedModels.length < maxModelsLimit

  const isModelSelected = useCallback(
    (modelId: string) => selectedModels.includes(modelId),
    [selectedModels]
  )

  const toggleModelSelection = useCallback(
    (modelId: string) => {
      setSelectedModels(prev => {
        if (prev.includes(modelId)) return prev.filter(id => id !== modelId)
        if (prev.length < maxModelsLimit) return [...prev, modelId]
        return prev
      })
    },
    [maxModelsLimit]
  )

  const clearSelection = useCallback(() => setSelectedModels([]), [])

  return {
    selectedModels,
    setSelectedModels,
    originalSelectedModels,
    setOriginalSelectedModels,
    maxModelsLimit,
    canSelectMore,
    isModelSelected,
    toggleModelSelection,
    clearSelection,
  }
}
