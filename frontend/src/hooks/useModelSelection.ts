/**
 * Custom hook for managing model selection
 *
 * Handles selected models state, validation against tier limits,
 * and provides helper functions for model selection.
 */

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

export function useModelSelection({
  isAuthenticated,
  user,
}: UseModelSelectionOptions): UseModelSelectionReturn {
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [originalSelectedModels, setOriginalSelectedModels] = useState<string[]>([])

  // Get max models based on user tier
  const maxModelsLimit = useMemo(() => {
    if (!isAuthenticated || !user) {
      return getModelLimit('unregistered')
    }
    return getModelLimit(user.subscription_tier)
  }, [isAuthenticated, user])

  // Check if user can select more models
  const canSelectMore = useMemo(() => {
    return selectedModels.length < maxModelsLimit
  }, [selectedModels.length, maxModelsLimit])

  // Check if a model is selected
  const isModelSelected = useCallback(
    (modelId: string): boolean => {
      return selectedModels.includes(modelId)
    },
    [selectedModels]
  )

  // Toggle model selection
  const toggleModelSelection = useCallback(
    (modelId: string) => {
      setSelectedModels(prev => {
        if (prev.includes(modelId)) {
          // Deselect
          return prev.filter(id => id !== modelId)
        } else if (prev.length < maxModelsLimit) {
          // Select (if under limit)
          return [...prev, modelId]
        }
        // At limit, don't add
        return prev
      })
    },
    [maxModelsLimit]
  )

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedModels([])
  }, [])

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
