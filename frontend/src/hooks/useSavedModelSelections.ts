/**
 * Custom hook for managing saved model selections
 *
 * Allows users to save, load, and delete named groups of model selections.
 * Persisted to localStorage with tier-based limits on saved selections.
 *
 * Each user (registered or unregistered) has their own independent collection:
 * - Registered users: keyed by their user ID
 * - Unregistered users: keyed by a persistent unregistered ID stored in localStorage
 */
import { useState, useCallback, useEffect, useMemo } from 'react'

import { getSavedModelSelectionLimit, type SubscriptionTier } from '../config/constants'

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

export interface UseSavedModelSelectionsReturn {
  savedSelections: SavedModelSelection[]
  saveSelection: (name: string, modelIds: string[]) => { success: boolean; error?: string }
  loadSelection: (id: string) => string[] | null
  deleteSelection: (id: string) => void
  renameSelection: (id: string, newName: string) => { success: boolean; error?: string }
  setDefaultSelection: (id: string | null) => void
  getDefaultSelectionId: () => string | null
  getDefaultSelection: () => SavedModelSelection | null
  canSaveMore: boolean
  maxSelections: number
}

/**
 * Generate a unique ID for a saved selection
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Get or create an unregistered user ID
 * This ID persists in localStorage so unregistered users keep their selections
 */
function getAnonymousId(): string {
  try {
    let anonymousId = localStorage.getItem(ANONYMOUS_ID_KEY)
    if (!anonymousId) {
      anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
      localStorage.setItem(ANONYMOUS_ID_KEY, anonymousId)
    }
    return anonymousId
  } catch (error) {
    // If localStorage fails, generate a session-only ID
    console.warn('Failed to access localStorage for anonymous ID:', error)
    return `anon_session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }
}

/**
 * Get the storage key for a specific user
 * @param userId - The user ID (number for registered users, undefined for anonymous)
 */
function getStorageKey(userId: number | undefined): string {
  if (userId !== undefined) {
    return `${STORAGE_KEY_PREFIX}_user_${userId}`
  }
  return `${STORAGE_KEY_PREFIX}_${getAnonymousId()}`
}

/**
 * Get the default selection storage key for a specific user
 * @param userId - The user ID (number for registered users, undefined for anonymous)
 */
function getDefaultSelectionKey(userId: number | undefined): string {
  if (userId !== undefined) {
    return `${DEFAULT_SELECTION_KEY_PREFIX}_user_${userId}`
  }
  return `${DEFAULT_SELECTION_KEY_PREFIX}_${getAnonymousId()}`
}

/**
 * Load default selection ID from localStorage
 */
function loadDefaultSelectionId(defaultKey: string): string | null {
  try {
    const stored = localStorage.getItem(defaultKey)
    return stored || null
  } catch (error) {
    console.warn('Failed to load default selection ID from localStorage:', error)
    return null
  }
}

/**
 * Save default selection ID to localStorage
 */
function saveDefaultSelectionId(defaultKey: string, selectionId: string | null): void {
  try {
    if (selectionId === null) {
      localStorage.removeItem(defaultKey)
    } else {
      localStorage.setItem(defaultKey, selectionId)
    }
  } catch (error) {
    console.warn('Failed to save default selection ID to localStorage:', error)
  }
}

/**
 * Load saved selections from localStorage for a specific user
 */
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

/**
 * Save selections to localStorage for a specific user
 */
function saveToStorage(storageKey: string, selections: SavedModelSelection[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(selections))
  } catch (error) {
    console.warn('Failed to save model selections to localStorage:', error)
  }
}

/**
 * Hook for managing saved model selections
 * @param userId - The user ID (number for registered users, undefined for anonymous)
 * @param tier - The subscription tier (defaults to 'unregistered' if not provided)
 */
export function useSavedModelSelections(
  userId: number | undefined,
  tier: SubscriptionTier = 'unregistered'
): UseSavedModelSelectionsReturn {
  const [savedSelections, setSavedSelections] = useState<SavedModelSelection[]>([])
  const [defaultSelectionId, setDefaultSelectionId] = useState<string | null>(null)

  // Compute the storage key based on user ID
  const storageKey = useMemo(() => getStorageKey(userId), [userId])
  const defaultSelectionKey = useMemo(() => getDefaultSelectionKey(userId), [userId])

  // Calculate max selections based on tier
  const maxSelections = useMemo(() => getSavedModelSelectionLimit(tier), [tier])

  // Load saved selections from localStorage when storage key changes
  useEffect(() => {
    setSavedSelections(loadFromStorage(storageKey))
    setDefaultSelectionId(loadDefaultSelectionId(defaultSelectionKey))
  }, [storageKey, defaultSelectionKey])

  // Check if user can save more selections
  const canSaveMore = savedSelections.length < maxSelections

  /**
   * Save a new model selection with a name
   */
  const saveSelection = useCallback(
    (name: string, modelIds: string[]): { success: boolean; error?: string } => {
      // Validate name
      const trimmedName = name.trim()
      if (!trimmedName) {
        return { success: false, error: 'Please enter a name for this selection' }
      }

      if (trimmedName.length > 50) {
        return { success: false, error: 'Name must be 50 characters or less' }
      }

      // Validate model selection
      if (modelIds.length === 0) {
        return { success: false, error: 'Please select at least one model to save' }
      }

      // Check if at limit
      if (savedSelections.length >= maxSelections) {
        return {
          success: false,
          error: `Maximum of ${maxSelections} saved selections reached. Please delete one to save a new selection.`,
        }
      }

      // Check for duplicate name
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

  /**
   * Load a saved selection by ID and return the model IDs
   */
  const loadSelection = useCallback(
    (id: string): string[] | null => {
      const selection = savedSelections.find(s => s.id === id)
      if (selection) {
        return [...selection.modelIds]
      }
      return null
    },
    [savedSelections]
  )

  /**
   * Delete a saved selection by ID
   */
  const deleteSelection = useCallback(
    (id: string): void => {
      const updated = savedSelections.filter(s => s.id !== id)
      setSavedSelections(updated)
      saveToStorage(storageKey, updated)

      // If the deleted selection was the default, clear the default
      if (defaultSelectionId === id) {
        setDefaultSelectionId(null)
        saveDefaultSelectionId(defaultSelectionKey, null)
      }
    },
    [savedSelections, storageKey, defaultSelectionId, defaultSelectionKey]
  )

  /**
   * Rename a saved selection
   */
  const renameSelection = useCallback(
    (id: string, newName: string): { success: boolean; error?: string } => {
      const trimmedName = newName.trim()
      if (!trimmedName) {
        return { success: false, error: 'Please enter a name' }
      }

      if (trimmedName.length > 50) {
        return { success: false, error: 'Name must be 50 characters or less' }
      }

      // Check for duplicate name (excluding the current selection)
      if (
        savedSelections.some(s => s.id !== id && s.name.toLowerCase() === trimmedName.toLowerCase())
      ) {
        return { success: false, error: 'A selection with this name already exists' }
      }

      const updated = savedSelections.map(s => {
        if (s.id === id) {
          return {
            ...s,
            name: trimmedName,
            updatedAt: new Date().toISOString(),
          }
        }
        return s
      })

      setSavedSelections(updated)
      saveToStorage(storageKey, updated)

      return { success: true }
    },
    [savedSelections, storageKey]
  )

  /**
   * Set the default selection (only one can be default at a time)
   */
  const setDefaultSelection = useCallback(
    (id: string | null): void => {
      // If setting a new default, verify the selection exists
      if (id !== null && !savedSelections.some(s => s.id === id)) {
        console.warn('Cannot set default: selection not found')
        return
      }

      setDefaultSelectionId(id)
      saveDefaultSelectionId(defaultSelectionKey, id)
    },
    [savedSelections, defaultSelectionKey]
  )

  /**
   * Get the default selection ID
   */
  const getDefaultSelectionId = useCallback((): string | null => {
    return defaultSelectionId
  }, [defaultSelectionId])

  /**
   * Get the default selection object
   */
  const getDefaultSelection = useCallback((): SavedModelSelection | null => {
    if (!defaultSelectionId) {
      return null
    }
    return savedSelections.find(s => s.id === defaultSelectionId) || null
  }, [defaultSelectionId, savedSelections])

  return {
    savedSelections,
    saveSelection,
    loadSelection,
    deleteSelection,
    renameSelection,
    setDefaultSelection,
    getDefaultSelectionId,
    getDefaultSelection,
    canSaveMore,
    maxSelections,
  }
}
