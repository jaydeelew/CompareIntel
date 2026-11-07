/**
 * Tests for useDefaultTestComparison hook
 *
 * Tests the automatic "Test Comparison" saved selection for anonymous visitors:
 * - Fresh visit: creates "Test Comparison" with 2 models
 * - Returning visit: respects existing "Test Comparison"
 * - Deletion/opt-out: persists and doesn't recreate
 * - Manual selection preservation: doesn't overwrite user selections
 * - Signed-in behavior: no-op for authenticated users
 * - Registry changes: validates model eligibility
 * - Insufficient models: handles gracefully
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDefaultTestComparison } from '../../hooks/useDefaultTestComparison'
import type { ModelsByProvider } from '../../types'

const TEST_COMPARISON_NAME = 'Test Comparison'
const TEST_COMPARISON_OPTED_OUT_KEY = 'compareintel_test_comparison_opted_out'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function createModel(
  id: string,
  provider: string,
  tierAccess: 'unregistered' | 'free' | 'paid' = 'unregistered',
  opts: { available?: boolean; supportsImageGen?: boolean } = {}
) {
  return {
    id,
    name: id.split('/')[1] || id,
    description: `Test model ${id}`,
    category: provider.toLowerCase(),
    provider,
    available: opts.available ?? true,
    tier_access: tierAccess,
    supports_image_generation: opts.supportsImageGen ?? false,
  }
}

describe('useDefaultTestComparison', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorageMock.clear()
  })

  const createMockModelsByProvider = (): ModelsByProvider => ({
    Google: [
      createModel('google/gemini-2.5-flash', 'Google', 'unregistered'),
      createModel('google/gemini-3.1-flash-lite-preview', 'Google', 'unregistered'),
    ],
    DeepSeek: [
      createModel('deepseek/deepseek-v4.1-flash', 'DeepSeek', 'unregistered'),
      createModel('deepseek/deepseek-v4-flash', 'DeepSeek', 'unregistered'),
    ],
    Microsoft: [createModel('microsoft/phi-4', 'Microsoft', 'unregistered')],
  })

  const createDefaultParams = (overrides = {}) => ({
    userId: undefined,
    tier: 'unregistered' as const,
    selectedModels: [],
    modelsByProvider: createMockModelsByProvider(),
    modelsLoaded: true,
    isAuthenticated: false,
    savedSelections: [],
    canSaveMore: true,
    maxSelections: 2,
    saveSelection: vi.fn(() => ({ success: true })),
    deleteSelection: vi.fn(),
    handleLoadSelection: vi.fn(),
    setDefaultSelection: vi.fn(),
    getDefaultSelectionId: vi.fn(() => null),
    ...overrides,
  })

  describe('Fresh anonymous visit', () => {
    it('creates Test Comparison with 2 popular models on first visit', async () => {
      const saveSelection = vi.fn(() => ({ success: true }))
      const params = createDefaultParams({ saveSelection })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(saveSelection).toHaveBeenCalledWith(TEST_COMPARISON_NAME, [
          'google/gemini-2.5-flash',
          'deepseek/deepseek-v4.1-flash',
        ])
      })
    })

    it('sets isInitialized to true after creation', async () => {
      const params = createDefaultParams()
      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })
    })

    it('does not recreate if models are loading', () => {
      const saveSelection = vi.fn()
      const params = createDefaultParams({ modelsLoaded: false, saveSelection })

      renderHook(() => useDefaultTestComparison(params))

      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('does not recreate if modelsByProvider is empty', () => {
      const saveSelection = vi.fn()
      const params = createDefaultParams({ modelsByProvider: {}, saveSelection })

      renderHook(() => useDefaultTestComparison(params))

      expect(saveSelection).not.toHaveBeenCalled()
    })
  })

  describe('Returning anonymous visit', () => {
    it('does not recreate Test Comparison if it already exists', () => {
      const saveSelection = vi.fn()
      const existingSelection = {
        id: 'test-id',
        name: TEST_COMPARISON_NAME,
        modelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [existingSelection],
        saveSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('loads Test Comparison if no models selected and it is default', async () => {
      const handleLoadSelection = vi.fn()
      const setDefaultSelection = vi.fn()
      const existingSelection = {
        id: 'test-id',
        name: TEST_COMPARISON_NAME,
        modelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [existingSelection],
        selectedModels: [],
        getDefaultSelectionId: vi.fn(() => null),
        handleLoadSelection,
        setDefaultSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(setDefaultSelection).toHaveBeenCalledWith('test-id')
        expect(handleLoadSelection).toHaveBeenCalledWith('test-id')
      })
    })
  })

  describe('Deletion and opt-out', () => {
    it('marks user as opted out when Test Comparison is deleted', async () => {
      const existingSelection = {
        id: 'test-id',
        name: TEST_COMPARISON_NAME,
        modelIds: ['google/gemini-2.5-flash'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // First render with Test Comparison present
      const params = createDefaultParams({
        savedSelections: [existingSelection],
      })
      const { rerender, result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })

      // Rerender without Test Comparison (simulating deletion)
      rerender()

      const paramsAfterDeletion = createDefaultParams({
        savedSelections: [],
      })

      renderHook(() => useDefaultTestComparison(paramsAfterDeletion))

      await waitFor(() => {
        expect(localStorageMock.getItem(TEST_COMPARISON_OPTED_OUT_KEY)).toBe('true')
      })
    })

    it('does not recreate Test Comparison if user opted out', async () => {
      localStorageMock.setItem(TEST_COMPARISON_OPTED_OUT_KEY, 'true')

      const saveSelection = vi.fn()
      const params = createDefaultParams({ saveSelection })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isOptedOut).toBe(true)
        expect(result.current.isInitialized).toBe(true)
      })

      expect(saveSelection).not.toHaveBeenCalled()
    })
  })

  describe('Manual selection preservation', () => {
    it('does not load Test Comparison if user has manually selected models', async () => {
      const handleLoadSelection = vi.fn()
      const existingSelection = {
        id: 'test-id',
        name: TEST_COMPARISON_NAME,
        modelIds: ['google/gemini-2.5-flash'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [existingSelection],
        selectedModels: ['microsoft/phi-4'], // User has manually selected a model
        handleLoadSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      expect(handleLoadSelection).not.toHaveBeenCalled()
    })
  })

  describe('Signed-in user behavior', () => {
    it('does nothing for authenticated users', async () => {
      const saveSelection = vi.fn()
      const handleLoadSelection = vi.fn()
      const params = createDefaultParams({
        userId: 123,
        isAuthenticated: true,
        saveSelection,
        handleLoadSelection,
      })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })

      expect(saveSelection).not.toHaveBeenCalled()
      expect(handleLoadSelection).not.toHaveBeenCalled()
    })
  })

  describe('Registry changes and model validation', () => {
    it('automatically updates Test Comparison when models become stale', async () => {
      const deleteSelection = vi.fn()
      const saveSelection = vi.fn(() => ({ success: true }))
      const existingSelection = {
        id: 'test-id',
        name: TEST_COMPARISON_NAME,
        modelIds: ['removed/model-1', 'removed/model-2'], // Models no longer in registry
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [existingSelection],
        deleteSelection,
        saveSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        // Should delete old selection
        expect(deleteSelection).toHaveBeenCalledWith('test-id')
        // Should create new selection with fresh models
        expect(saveSelection).toHaveBeenCalledWith(TEST_COMPARISON_NAME, [
          'google/gemini-2.5-flash',
          'deepseek/deepseek-v4.1-flash',
        ])
      })
    })

    it('automatically updates when only 1 model is still valid', async () => {
      const deleteSelection = vi.fn()
      const saveSelection = vi.fn(() => ({ success: true }))
      const existingSelection = {
        id: 'test-id',
        name: TEST_COMPARISON_NAME,
        modelIds: ['google/gemini-2.5-flash', 'removed/model'], // Only 1 valid
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [existingSelection],
        deleteSelection,
        saveSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(deleteSelection).toHaveBeenCalledWith('test-id')
        expect(saveSelection).toHaveBeenCalledWith(TEST_COMPARISON_NAME, expect.any(Array))
        const newModels = saveSelection.mock.calls[0][1]
        expect(newModels).toHaveLength(2)
      })
    })

    it('does not update when both models are still valid', async () => {
      const deleteSelection = vi.fn()
      const saveSelection = vi.fn()
      const existingSelection = {
        id: 'test-id',
        name: TEST_COMPARISON_NAME,
        modelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'], // Both valid
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [existingSelection],
        deleteSelection,
        saveSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(deleteSelection).not.toHaveBeenCalled()
        expect(saveSelection).not.toHaveBeenCalled()
      })
    })

    it('falls back to alternative models when priority models are unavailable', async () => {
      const saveSelection = vi.fn(() => ({ success: true }))
      const modelsByProvider: ModelsByProvider = {
        Microsoft: [createModel('microsoft/phi-4', 'Microsoft', 'unregistered')],
        DeepSeek: [createModel('deepseek/deepseek-v3.2', 'DeepSeek', 'unregistered')],
      }
      const params = createDefaultParams({ modelsByProvider, saveSelection })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(saveSelection).toHaveBeenCalledWith(TEST_COMPARISON_NAME, expect.any(Array))
        const calledWith = saveSelection.mock.calls[0][1]
        expect(calledWith).toHaveLength(2)
        expect(calledWith).toContain('microsoft/phi-4')
        expect(calledWith).toContain('deepseek/deepseek-v3.2')
      })
    })

    it('handles update failure gracefully', async () => {
      const deleteSelection = vi.fn()
      const saveSelection = vi.fn(() => ({ success: false, error: 'Save failed' }))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const existingSelection = {
        id: 'test-id',
        name: TEST_COMPARISON_NAME,
        modelIds: ['removed/model-1', 'removed/model-2'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [existingSelection],
        deleteSelection,
        saveSelection,
      })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
        expect(deleteSelection).toHaveBeenCalled()
        expect(saveSelection).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalled()
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Insufficient eligible models', () => {
    it('does not create Test Comparison when fewer than 2 unregistered models exist', async () => {
      const saveSelection = vi.fn()
      const modelsByProvider: ModelsByProvider = {
        Google: [createModel('google/gemini-2.5-flash', 'Google', 'unregistered')],
        // Only 1 unregistered model available
      }
      const params = createDefaultParams({ modelsByProvider, saveSelection })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })

      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('does not create Test Comparison when all models are paid tier', async () => {
      const saveSelection = vi.fn()
      const modelsByProvider: ModelsByProvider = {
        Google: [createModel('google/gemini-pro', 'Google', 'paid')],
        OpenAI: [createModel('openai/gpt-4', 'OpenAI', 'paid')],
      }
      const params = createDefaultParams({ modelsByProvider, saveSelection })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })

      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('excludes image generation models from selection', async () => {
      const saveSelection = vi.fn(() => ({ success: true }))
      const modelsByProvider: ModelsByProvider = {
        Google: [
          createModel('google/gemini-2.5-flash', 'Google', 'unregistered'),
          createModel('google/gemini-2.5-flash-image', 'Google', 'unregistered', {
            supportsImageGen: true,
          }),
        ],
        DeepSeek: [createModel('deepseek/deepseek-v4.1-flash', 'DeepSeek', 'unregistered')],
      }
      const params = createDefaultParams({ modelsByProvider, saveSelection })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(saveSelection).toHaveBeenCalledWith(TEST_COMPARISON_NAME, [
          'google/gemini-2.5-flash',
          'deepseek/deepseek-v4.1-flash',
        ])
      })

      // Should not include the image model
      expect(saveSelection.mock.calls[0][1]).not.toContain('google/gemini-2.5-flash-image')
    })

    it('excludes unavailable models from selection', async () => {
      const saveSelection = vi.fn(() => ({ success: true }))
      const modelsByProvider: ModelsByProvider = {
        Google: [
          createModel('google/gemini-2.5-flash', 'Google', 'unregistered'),
          createModel('google/unavailable-model', 'Google', 'unregistered', {
            available: false,
          }),
        ],
        DeepSeek: [createModel('deepseek/deepseek-v4.1-flash', 'DeepSeek', 'unregistered')],
      }
      const params = createDefaultParams({ modelsByProvider, saveSelection })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(saveSelection).toHaveBeenCalledWith(TEST_COMPARISON_NAME, [
          'google/gemini-2.5-flash',
          'deepseek/deepseek-v4.1-flash',
        ])
      })

      // Should not include unavailable model
      expect(saveSelection.mock.calls[0][1]).not.toContain('google/unavailable-model')
    })
  })

  describe('At max saved selections limit', () => {
    it('does not create Test Comparison when at limit', async () => {
      const saveSelection = vi.fn()
      const existingSelections = [
        {
          id: 'sel-1',
          name: 'Selection 1',
          modelIds: ['google/gemini-2.5-flash'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'sel-2',
          name: 'Selection 2',
          modelIds: ['deepseek/deepseek-v4.1-flash'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]
      const params = createDefaultParams({
        savedSelections: existingSelections,
        canSaveMore: false,
        maxSelections: 2,
        saveSelection,
      })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })

      expect(saveSelection).not.toHaveBeenCalled()
    })
  })
})
