/**
 * useSavedSelectionsComplete - Combined saved model selections hook
 *
 * This hook combines useSavedModelSelections and useSavedSelectionManager into
 * a single cohesive hook following 2025 React best practices:
 * - Single responsibility: manages all saved selection operations
 * - Cleaner component API with fewer hook calls
 * - Better encapsulation of storage and UI logic
 */

import { useState, useCallback, useEffect, useMemo } from 'react'

import { getSavedModelSelectionLimit, type SubscriptionTier } from '../config/constants'
import type { CompareResponse } from '../types'
import type { ModelConversation } from '../types/conversation'
import type { ModelsByProvider } from '../types/models'
import { showNotification } from '../utils'

// Storage keys
const STORAGE_KEY_PREFIX = 'compareintel_saved_model_selections'
const DEFAULT_SELECTION_KEY_PREFIX = 'compareintel_default_model_selection'
const ANONYMOUS_ID_KEY = 'compareintel_anonymous_id'

export interface SavedModelSelection {
  id: string
  name: string
  modelIds: string[]
  createdAt: string
  updatedAt: string
}

export interface UseSavedSelectionsCompleteConfig {
  /** User ID (undefined for anonymous users) */
  userId: number | undefined
  /** Subscription tier */
  tier: SubscriptionTier
  /** Currently selected models */
  selectedModels: string[]
  /** Available models by provider */
  modelsByProvider: ModelsByProvider
  /** Maximum models user can select */
  maxModelsLimit: number
  /** Current comparison response */
  response: CompareResponse | null
  /** Current conversations */
  conversations: ModelConversation[]
  /** Callback when selection is saved (for tutorial tracking) */
  onSelectionSaved?: () => void
}

export interface UseSavedSelectionsCompleteCallbacks {
  setSelectedModels: (models: string[]) => void
  setOpenDropdowns: React.Dispatch<React.SetStateAction<Set<string>>>
  setConversations: (conversations: ModelConversation[]) => void
  setResponse: (response: CompareResponse | null) => void
  setDefaultSelectionOverridden: (overridden: boolean) => void
}

export interface UseSavedSelectionsCompleteReturn {
  // Data
  savedSelections: SavedModelSelection[]
  defaultSelectionId: string | null
  canSaveMore: boolean
  maxSelections: number

  // Core operations (from useSavedModelSelections)
  saveSelection: (name: string, modelIds: string[]) => { success: boolean; error?: string }
  loadSelectionRaw: (id: string) => string[] | null
  deleteSelection: (id: string) => void
  renameSelection: (id: string, newName: string) => { success: boolean; error?: string }
  setDefaultSelection: (id: string | null) => void
  getDefaultSelection: () => SavedModelSelection | null

  // UI operations (from useSavedSelectionManager)
  handleSaveSelection: (name: string) => { success: boolean; error?: string }
  handleLoadSelection: (id: string) => void
}

// ============================================
// Helper Functions
// ============================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function getAnonymousId(): string {
  try {
    let anonymousId = localStorage.getItem(ANONYMOUS_ID_KEY)
    if (!anonymousId) {
      anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
      localStorage.setItem(ANONYMOUS_ID_KEY, anonymousId)
    }
    return anonymousId
  } catch (error) {
    console.warn('Failed to access localStorage for anonymous ID:', error)
    return `anon_session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }
}

function getStorageKey(userId: number | undefined): string {
  if (userId !== undefined) {
    return `${STORAGE_KEY_PREFIX}_user_${userId}`
  }
  return `${STORAGE_KEY_PREFIX}_${getAnonymousId()}`
}

function getDefaultSelectionKey(userId: number | undefined): string {
  if (userId !== undefined) {
    return `${DEFAULT_SELECTION_KEY_PREFIX}_user_${userId}`
  }
  return `${DEFAULT_SELECTION_KEY_PREFIX}_${getAnonymousId()}`
}

function loadFromStorage(storageKey: string): SavedModelSelection[] {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch (error) {
    console.warn('Failed to load saved model selections from localStorage:', error)
  }
  return []
}

function saveToStorage(storageKey: string, selections: SavedModelSelection[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(selections))
  } catch (error) {
    console.warn('Failed to save model selections to localStorage:', error)
  }
}

function loadDefaultSelectionId(defaultKey: string): string | null {
  try {
    return localStorage.getItem(defaultKey) || null
  } catch (error) {
    console.warn('Failed to load default selection ID:', error)
    return null
  }
}

function saveDefaultSelectionId(defaultKey: string, selectionId: string | null): void {
  try {
    if (selectionId === null) {
      localStorage.removeItem(defaultKey)
    } else {
      localStorage.setItem(defaultKey, selectionId)
    }
  } catch (error) {
    console.warn('Failed to save default selection ID:', error)
  }
}

// ============================================
// Main Hook
// ============================================

export function useSavedSelectionsComplete(
  config: UseSavedSelectionsCompleteConfig,
  callbacks: UseSavedSelectionsCompleteCallbacks
): UseSavedSelectionsCompleteReturn {
  const {
    userId,
    tier,
    selectedModels,
    modelsByProvider,
    maxModelsLimit,
    response,
    conversations,
    onSelectionSaved,
  } = config

  const {
    setSelectedModels,
    setOpenDropdowns,
    setConversations,
    setResponse,
    setDefaultSelectionOverridden,
  } = callbacks

  // State
  const [savedSelections, setSavedSelections] = useState<SavedModelSelection[]>([])
  const [defaultSelectionId, setDefaultSelectionIdState] = useState<string | null>(null)

  // Computed values
  const storageKey = useMemo(() => getStorageKey(userId), [userId])
  const defaultSelectionKey = useMemo(() => getDefaultSelectionKey(userId), [userId])
  const maxSelections = useMemo(() => getSavedModelSelectionLimit(tier), [tier])
  const canSaveMore = savedSelections.length < maxSelections

  // Load selections when storage key changes
  useEffect(() => {
    setSavedSelections(loadFromStorage(storageKey))
    setDefaultSelectionIdState(loadDefaultSelectionId(defaultSelectionKey))
  }, [storageKey, defaultSelectionKey])

  // ============================================
  // Core Operations (from useSavedModelSelections)
  // ============================================

  const saveSelection = useCallback(
    (name: string, modelIds: string[]): { success: boolean; error?: string } => {
      const trimmedName = name.trim()

      if (!trimmedName) {
        return { success: false, error: 'Please enter a name for this selection' }
      }

      if (trimmedName.length > 50) {
        return { success: false, error: 'Name must be 50 characters or less' }
      }

      if (modelIds.length === 0) {
        return { success: false, error: 'Please select at least one model to save' }
      }

      if (savedSelections.length >= maxSelections) {
        return {
          success: false,
          error: `Maximum of ${maxSelections} saved selections reached. Please delete one to save a new selection.`,
        }
      }

      if (savedSelections.some(s => s.name.toLowerCase() === trimmedName.toLowerCase())) {
        return { success: false, error: 'A selection with this name already exists' }
      }

      const now = new Date().toISOString()
      const newSelection: SavedModelSelection = {
        id: generateId(),
        name: trimmedName,
        modelIds: [...modelIds],
        createdAt: now,
        updatedAt: now,
      }

      const updated = [...savedSelections, newSelection]
      setSavedSelections(updated)
      saveToStorage(storageKey, updated)

      return { success: true }
    },
    [savedSelections, storageKey, maxSelections]
  )

  const loadSelectionRaw = useCallback(
    (id: string): string[] | null => {
      const selection = savedSelections.find(s => s.id === id)
      return selection ? [...selection.modelIds] : null
    },
    [savedSelections]
  )

  const deleteSelection = useCallback(
    (id: string): void => {
      const updated = savedSelections.filter(s => s.id !== id)
      setSavedSelections(updated)
      saveToStorage(storageKey, updated)

      if (defaultSelectionId === id) {
        setDefaultSelectionIdState(null)
        saveDefaultSelectionId(defaultSelectionKey, null)
      }
    },
    [savedSelections, storageKey, defaultSelectionId, defaultSelectionKey]
  )

  const renameSelection = useCallback(
    (id: string, newName: string): { success: boolean; error?: string } => {
      const trimmedName = newName.trim()

      if (!trimmedName) {
        return { success: false, error: 'Please enter a name' }
      }

      if (trimmedName.length > 50) {
        return { success: false, error: 'Name must be 50 characters or less' }
      }

      if (
        savedSelections.some(s => s.id !== id && s.name.toLowerCase() === trimmedName.toLowerCase())
      ) {
        return { success: false, error: 'A selection with this name already exists' }
      }

      const updated = savedSelections.map(s => {
        if (s.id === id) {
          return { ...s, name: trimmedName, updatedAt: new Date().toISOString() }
        }
        return s
      })

      setSavedSelections(updated)
      saveToStorage(storageKey, updated)

      return { success: true }
    },
    [savedSelections, storageKey]
  )

  const setDefaultSelection = useCallback(
    (id: string | null): void => {
      if (id !== null && !savedSelections.some(s => s.id === id)) {
        console.warn('Cannot set default: selection not found')
        return
      }

      setDefaultSelectionIdState(id)
      saveDefaultSelectionId(defaultSelectionKey, id)
    },
    [savedSelections, defaultSelectionKey]
  )

  const getDefaultSelection = useCallback((): SavedModelSelection | null => {
    if (!defaultSelectionId) return null
    return savedSelections.find(s => s.id === defaultSelectionId) || null
  }, [defaultSelectionId, savedSelections])

  // ============================================
  // UI Operations (from useSavedSelectionManager)
  // ============================================

  const handleSaveSelection = useCallback(
    (name: string) => {
      const result = saveSelection(name, selectedModels)
      if (result.success) {
        onSelectionSaved?.()
      }
      return result
    },
    [saveSelection, selectedModels, onSelectionSaved]
  )

  const handleLoadSelection = useCallback(
    (id: string) => {
      const modelIds = loadSelectionRaw(id)
      if (!modelIds) return

      // Filter to only available models
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

      // Update selected models
      setSelectedModels(limitedModelIds)

      // Update open dropdowns to match selected models
      setOpenDropdowns(prev => {
        const newSet = new Set(prev)
        let hasChanges = false

        // Remove dropdowns with no selected models
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

        // Add dropdowns for providers with selected models
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

      // Clear conversations if loading a different selection
      if (response || conversations.length > 0) {
        setConversations([])
        setResponse(null)
      }

      // Update default selection override status
      if (defaultSelectionId === id) {
        setDefaultSelectionOverridden(false)
      }
    },
    [
      loadSelectionRaw,
      modelsByProvider,
      maxModelsLimit,
      setSelectedModels,
      setOpenDropdowns,
      response,
      conversations.length,
      setConversations,
      setResponse,
      defaultSelectionId,
      setDefaultSelectionOverridden,
    ]
  )

  return {
    // Data
    savedSelections,
    defaultSelectionId,
    canSaveMore,
    maxSelections,

    // Core operations
    saveSelection,
    loadSelectionRaw,
    deleteSelection,
    renameSelection,
    setDefaultSelection,
    getDefaultSelection,

    // UI operations
    handleSaveSelection,
    handleLoadSelection,
  }
}
