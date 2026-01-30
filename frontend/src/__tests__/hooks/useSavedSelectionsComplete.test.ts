/**
 * Tests for useSavedSelectionsComplete hook
 *
 * Tests the combined saved selections hook that merges
 * useSavedModelSelections and useSavedSelectionManager.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useSavedSelectionsComplete } from '../../hooks/useSavedSelectionsComplete'
import type { ModelsByProvider } from '../../types/models'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock showNotification
vi.mock('../../utils', () => ({
  showNotification: vi.fn(),
}))

describe('useSavedSelectionsComplete', () => {
  const mockSetSelectedModels = vi.fn()
  const mockSetOpenDropdowns = vi.fn()
  const mockSetConversations = vi.fn()
  const mockSetResponse = vi.fn()
  const mockSetDefaultSelectionOverridden = vi.fn()
  const mockOnSelectionSaved = vi.fn()

  const defaultConfig = {
    userId: 1,
    tier: 'free' as const,
    selectedModels: ['model-1', 'model-2'],
    modelsByProvider: {
      OpenAI: [
        { id: 'model-1', name: 'GPT-4', provider: 'OpenAI', available: true },
        { id: 'model-2', name: 'GPT-3.5', provider: 'OpenAI', available: true },
      ],
    } as ModelsByProvider,
    maxModelsLimit: 9,
    response: null,
    conversations: [],
    onSelectionSaved: mockOnSelectionSaved,
  }

  const defaultCallbacks = {
    setSelectedModels: mockSetSelectedModels,
    setOpenDropdowns: mockSetOpenDropdowns,
    setConversations: mockSetConversations,
    setResponse: mockSetResponse,
    setDefaultSelectionOverridden: mockSetDefaultSelectionOverridden,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  describe('initialization', () => {
    it('should initialize with empty selections', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      expect(result.current.savedSelections).toEqual([])
      expect(result.current.defaultSelectionId).toBe(null)
      expect(result.current.canSaveMore).toBe(true)
    })

    it('should have correct max selections based on tier', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      // Free tier should have some limit
      expect(result.current.maxSelections).toBeGreaterThan(0)
    })
  })

  describe('saveSelection', () => {
    it('should save a new selection', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        const saveResult = result.current.saveSelection('My Selection', ['model-1', 'model-2'])
        expect(saveResult.success).toBe(true)
      })

      expect(result.current.savedSelections.length).toBe(1)
      expect(result.current.savedSelections[0].name).toBe('My Selection')
      expect(result.current.savedSelections[0].modelIds).toEqual(['model-1', 'model-2'])
    })

    it('should reject empty name', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      let saveResult: { success: boolean; error?: string }
      act(() => {
        saveResult = result.current.saveSelection('', ['model-1'])
      })

      expect(saveResult!.success).toBe(false)
      expect(saveResult!.error).toContain('name')
    })

    it('should reject duplicate names', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        result.current.saveSelection('My Selection', ['model-1'])
      })

      let saveResult: { success: boolean; error?: string }
      act(() => {
        saveResult = result.current.saveSelection('My Selection', ['model-2'])
      })

      expect(saveResult!.success).toBe(false)
      expect(saveResult!.error).toContain('already exists')
    })

    it('should reject empty model list', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      let saveResult: { success: boolean; error?: string }
      act(() => {
        saveResult = result.current.saveSelection('My Selection', [])
      })

      expect(saveResult!.success).toBe(false)
      expect(saveResult!.error).toContain('at least one model')
    })
  })

  describe('handleSaveSelection', () => {
    it('should save selection and call onSelectionSaved callback', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        const saveResult = result.current.handleSaveSelection('Test Selection')
        expect(saveResult.success).toBe(true)
      })

      expect(mockOnSelectionSaved).toHaveBeenCalled()
    })

    it('should not call onSelectionSaved on failure', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete({ ...defaultConfig, selectedModels: [] }, defaultCallbacks)
      )

      act(() => {
        result.current.handleSaveSelection('Test Selection')
      })

      expect(mockOnSelectionSaved).not.toHaveBeenCalled()
    })
  })

  describe('deleteSelection', () => {
    it('should delete a selection', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        result.current.saveSelection('To Delete', ['model-1'])
      })

      const selectionId = result.current.savedSelections[0].id

      act(() => {
        result.current.deleteSelection(selectionId)
      })

      expect(result.current.savedSelections.length).toBe(0)
    })

    it('should clear default selection if deleting default', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        result.current.saveSelection('Default Selection', ['model-1'])
      })

      const selectionId = result.current.savedSelections[0].id

      act(() => {
        result.current.setDefaultSelection(selectionId)
      })

      expect(result.current.defaultSelectionId).toBe(selectionId)

      act(() => {
        result.current.deleteSelection(selectionId)
      })

      expect(result.current.defaultSelectionId).toBe(null)
    })
  })

  describe('renameSelection', () => {
    it('should rename a selection', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        result.current.saveSelection('Original Name', ['model-1'])
      })

      const selectionId = result.current.savedSelections[0].id

      let renameResult: { success: boolean; error?: string }
      act(() => {
        renameResult = result.current.renameSelection(selectionId, 'New Name')
      })

      expect(renameResult!.success).toBe(true)
      expect(result.current.savedSelections[0].name).toBe('New Name')
    })

    it('should reject duplicate names when renaming', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      // Save two selections in separate act() calls to ensure state updates
      act(() => {
        result.current.saveSelection('Selection 1', ['model-1'])
      })

      act(() => {
        result.current.saveSelection('Selection 2', ['model-2'])
      })

      // Get the second selection's id
      const selections = result.current.savedSelections
      expect(selections.length).toBe(2)

      const secondSelection = selections.find(s => s.name === 'Selection 2')
      expect(secondSelection).toBeDefined()

      let renameResult: { success: boolean; error?: string }
      act(() => {
        renameResult = result.current.renameSelection(secondSelection!.id, 'Selection 1')
      })

      expect(renameResult!.success).toBe(false)
      expect(renameResult!.error).toContain('already exists')
    })
  })

  describe('setDefaultSelection', () => {
    it('should set a selection as default', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        result.current.saveSelection('My Default', ['model-1'])
      })

      const selectionId = result.current.savedSelections[0].id

      act(() => {
        result.current.setDefaultSelection(selectionId)
      })

      expect(result.current.defaultSelectionId).toBe(selectionId)
    })

    it('should allow clearing default selection', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        result.current.saveSelection('My Default', ['model-1'])
      })

      const selectionId = result.current.savedSelections[0].id

      act(() => {
        result.current.setDefaultSelection(selectionId)
      })

      act(() => {
        result.current.setDefaultSelection(null)
      })

      expect(result.current.defaultSelectionId).toBe(null)
    })
  })

  describe('getDefaultSelection', () => {
    it('should return null when no default', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      expect(result.current.getDefaultSelection()).toBe(null)
    })

    it('should return default selection when set', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        result.current.saveSelection('My Default', ['model-1'])
      })

      const selection = result.current.savedSelections[0]

      act(() => {
        result.current.setDefaultSelection(selection.id)
      })

      expect(result.current.getDefaultSelection()).toEqual(selection)
    })
  })

  describe('handleLoadSelection', () => {
    it('should load selection and update state', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      act(() => {
        result.current.saveSelection('Saved Selection', ['model-1', 'model-2'])
      })

      const selectionId = result.current.savedSelections[0].id

      act(() => {
        result.current.handleLoadSelection(selectionId)
      })

      expect(mockSetSelectedModels).toHaveBeenCalledWith(['model-1', 'model-2'])
      expect(mockSetOpenDropdowns).toHaveBeenCalled()
    })

    it('should filter out unavailable models when loading', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      // Save with a model that will be "unavailable"
      act(() => {
        result.current.saveSelection('Has Unavailable', ['model-1', 'unavailable-model'])
      })

      const selectionId = result.current.savedSelections[0].id

      act(() => {
        result.current.handleLoadSelection(selectionId)
      })

      // Should only include model-1 (available) not unavailable-model
      expect(mockSetSelectedModels).toHaveBeenCalledWith(['model-1'])
    })
  })

  describe('canSaveMore', () => {
    it('should be true when under limit', () => {
      const { result } = renderHook(() =>
        useSavedSelectionsComplete(defaultConfig, defaultCallbacks)
      )

      expect(result.current.canSaveMore).toBe(true)
    })

    it('should be false when at limit', () => {
      // Use unregistered tier which has lower limit
      const { result } = renderHook(() =>
        useSavedSelectionsComplete({ ...defaultConfig, tier: 'unregistered' }, defaultCallbacks)
      )

      // Fill up to the limit
      const maxSelections = result.current.maxSelections

      for (let i = 0; i < maxSelections; i++) {
        act(() => {
          result.current.saveSelection(`Selection ${i}`, ['model-1'])
        })
      }

      expect(result.current.canSaveMore).toBe(false)
    })
  })
})
