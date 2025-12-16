/**
 * Custom hook for managing saved model selections
 *
 * Allows users to save, load, and delete named groups of model selections.
 * Persisted to localStorage with a maximum of 10 saved selections.
 */

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'compareintel_saved_model_selections'
const MAX_SAVED_SELECTIONS = 10

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
 * Load saved selections from localStorage
 */
function loadFromStorage(): SavedModelSelection[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
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
 * Save selections to localStorage
 */
function saveToStorage(selections: SavedModelSelection[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selections))
  } catch (error) {
    console.warn('Failed to save model selections to localStorage:', error)
  }
}

export function useSavedModelSelections(): UseSavedModelSelectionsReturn {
  const [savedSelections, setSavedSelections] = useState<SavedModelSelection[]>([])

  // Load saved selections from localStorage on mount
  useEffect(() => {
    setSavedSelections(loadFromStorage())
  }, [])

  // Check if user can save more selections
  const canSaveMore = savedSelections.length < MAX_SAVED_SELECTIONS

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
      if (savedSelections.length >= MAX_SAVED_SELECTIONS) {
        return {
          success: false,
          error: `Maximum of ${MAX_SAVED_SELECTIONS} saved selections reached. Please delete one to save a new selection.`,
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
      saveToStorage(updated)

      return { success: true }
    },
    [savedSelections]
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
      saveToStorage(updated)
    },
    [savedSelections]
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
      saveToStorage(updated)

      return { success: true }
    },
    [savedSelections]
  )

  return {
    savedSelections,
    saveSelection,
    loadSelection,
    deleteSelection,
    renameSelection,
    canSaveMore,
    maxSelections: MAX_SAVED_SELECTIONS,
  }
}
