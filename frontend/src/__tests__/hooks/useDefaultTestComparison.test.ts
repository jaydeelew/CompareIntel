/**
 * Tests for useDefaultTestComparison hook
 *
 * Tests the automatic "Starter Selection" saved selection for anonymous visitors:
 * - Fresh visit: creates "Starter Selection" with 2 models and systemKey
 * - Returning visit: respects existing system-managed entry
 * - Deletion/opt-out: persists and doesn't recreate
 * - Manual selection preservation: doesn't overwrite user selections
 * - Signed-in behavior: no-op for authenticated users
 * - Registry changes: patches stale models in place
 * - Does not rename user-created entries that share the old display name
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ANONYMOUS_STARTER_SYSTEM_KEY,
  STARTER_SELECTION_NAME,
  useDefaultTestComparison,
} from '../../hooks/useDefaultTestComparison'
import type { ModelsByProvider } from '../../types'

const STARTER_SELECTION_OPTED_OUT_KEY = 'compareintel_starter_selection_opted_out'
const LEGACY_TEST_COMPARISON_OPTED_OUT_KEY = 'compareintel_test_comparison_opted_out'
const LEGACY_DISPLAY_NAME = 'Test Comparison'

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

function managedSelection(
  overrides: Partial<{
    id: string
    name: string
    modelIds: string[]
    systemKey?: string
  }> = {}
) {
  return {
    id: 'starter-id',
    name: STARTER_SELECTION_NAME,
    modelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    systemKey: ANONYMOUS_STARTER_SYSTEM_KEY,
    ...overrides,
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
    patchSelection: vi.fn(() => ({ success: true })),
    handleLoadSelection: vi.fn(),
    setDefaultSelection: vi.fn(),
    getDefaultSelectionId: vi.fn(() => null),
    ...overrides,
  })

  describe('Fresh anonymous visit', () => {
    it('creates Starter Selection with 2 popular models and systemKey', async () => {
      const saveSelection = vi.fn(() => ({ success: true }))
      const params = createDefaultParams({ saveSelection })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(saveSelection).toHaveBeenCalledWith(
          STARTER_SELECTION_NAME,
          ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
          { systemKey: ANONYMOUS_STARTER_SYSTEM_KEY }
        )
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
    it('does not recreate Starter Selection if a system-managed entry exists', () => {
      const saveSelection = vi.fn()
      const patchSelection = vi.fn()
      const params = createDefaultParams({
        savedSelections: [managedSelection()],
        saveSelection,
        patchSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      expect(saveSelection).not.toHaveBeenCalled()
      expect(patchSelection).not.toHaveBeenCalled()
    })

    it('loads Starter Selection if no models selected and it is default', async () => {
      const handleLoadSelection = vi.fn()
      const setDefaultSelection = vi.fn()
      const params = createDefaultParams({
        savedSelections: [managedSelection()],
        selectedModels: [],
        getDefaultSelectionId: vi.fn(() => null),
        handleLoadSelection,
        setDefaultSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(setDefaultSelection).toHaveBeenCalledWith('starter-id')
        expect(handleLoadSelection).toHaveBeenCalledWith('starter-id')
      })
    })
  })

  describe('Display name identity', () => {
    it('does not rename a user-created Test Comparison that is not the default', async () => {
      const saveSelection = vi.fn(() => ({ success: true }))
      const patchSelection = vi.fn(() => ({ success: true }))
      const userCreated = {
        id: 'user-test-comparison',
        name: LEGACY_DISPLAY_NAME,
        modelIds: ['microsoft/phi-4'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [userCreated],
        getDefaultSelectionId: vi.fn(() => null),
        saveSelection,
        patchSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(saveSelection).toHaveBeenCalledWith(STARTER_SELECTION_NAME, expect.any(Array), {
          systemKey: ANONYMOUS_STARTER_SYSTEM_KEY,
        })
      })
      expect(patchSelection).not.toHaveBeenCalled()
    })

    it('adopts a legacy default Test Comparison: stamps systemKey and renames in place', async () => {
      const saveSelection = vi.fn()
      const patchSelection = vi.fn(() => ({ success: true }))
      const legacy = {
        id: 'legacy-id',
        name: LEGACY_DISPLAY_NAME,
        modelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [legacy],
        getDefaultSelectionId: vi.fn(() => 'legacy-id'),
        saveSelection,
        patchSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(patchSelection).toHaveBeenCalledWith('legacy-id', {
          name: STARTER_SELECTION_NAME,
          systemKey: ANONYMOUS_STARTER_SYSTEM_KEY,
        })
      })
      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('does not treat a user-created Starter Selection without systemKey as managed', async () => {
      const saveSelection = vi.fn(() => ({ success: true }))
      const patchSelection = vi.fn()
      const userCreated = {
        id: 'user-starter',
        name: STARTER_SELECTION_NAME,
        modelIds: ['microsoft/phi-4'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [userCreated],
        saveSelection,
        patchSelection,
      })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })
      expect(saveSelection).not.toHaveBeenCalled()
      expect(patchSelection).not.toHaveBeenCalled()
    })

    it('adopts a legacy default without renaming when Starter Selection name is already taken', async () => {
      const saveSelection = vi.fn()
      const patchSelection = vi.fn(() => ({ success: true }))
      const userStarter = {
        id: 'user-starter',
        name: STARTER_SELECTION_NAME,
        modelIds: ['microsoft/phi-4'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const legacy = {
        id: 'legacy-id',
        name: LEGACY_DISPLAY_NAME,
        modelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [userStarter, legacy],
        getDefaultSelectionId: vi.fn(() => 'legacy-id'),
        saveSelection,
        patchSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(patchSelection).toHaveBeenCalledWith('legacy-id', {
          systemKey: ANONYMOUS_STARTER_SYSTEM_KEY,
        })
      })
      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('does not persist opt-out while adopting a legacy default', async () => {
      const legacy = {
        id: 'legacy-id',
        name: LEGACY_DISPLAY_NAME,
        modelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const params = createDefaultParams({
        savedSelections: [legacy],
        getDefaultSelectionId: vi.fn(() => 'legacy-id'),
      })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })
      expect(result.current.isOptedOut).toBe(false)
      expect(localStorageMock.getItem(STARTER_SELECTION_OPTED_OUT_KEY)).toBeNull()
      expect(localStorageMock.getItem(LEGACY_TEST_COMPARISON_OPTED_OUT_KEY)).toBeNull()
    })
  })

  describe('Deletion and opt-out', () => {
    it('marks user as opted out when the system-managed Starter Selection is deleted', async () => {
      const existingSelection = managedSelection()

      const params = createDefaultParams({
        savedSelections: [existingSelection],
      })
      const { result, rerender } = renderHook(p => useDefaultTestComparison(p), {
        initialProps: params,
      })

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })

      rerender(
        createDefaultParams({
          savedSelections: [],
        })
      )

      await waitFor(() => {
        expect(localStorageMock.getItem(STARTER_SELECTION_OPTED_OUT_KEY)).toBe('true')
        expect(localStorageMock.getItem(LEGACY_TEST_COMPARISON_OPTED_OUT_KEY)).toBe('true')
      })
    })

    it('does not recreate Starter Selection if user opted out via new key', async () => {
      localStorageMock.setItem(STARTER_SELECTION_OPTED_OUT_KEY, 'true')

      const saveSelection = vi.fn()
      const params = createDefaultParams({ saveSelection })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isOptedOut).toBe(true)
        expect(result.current.isInitialized).toBe(true)
      })

      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('honors legacy Test Comparison opt-out key without resetting it', async () => {
      localStorageMock.setItem(LEGACY_TEST_COMPARISON_OPTED_OUT_KEY, 'true')

      const saveSelection = vi.fn()
      const params = createDefaultParams({ saveSelection })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isOptedOut).toBe(true)
        expect(result.current.isInitialized).toBe(true)
      })

      expect(saveSelection).not.toHaveBeenCalled()
      expect(localStorageMock.getItem(LEGACY_TEST_COMPARISON_OPTED_OUT_KEY)).toBe('true')
    })
  })

  describe('Manual selection preservation', () => {
    it('does not load Starter Selection if user has manually selected models', async () => {
      const handleLoadSelection = vi.fn()
      const params = createDefaultParams({
        savedSelections: [managedSelection()],
        selectedModels: ['microsoft/phi-4'],
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
    it('patches Starter Selection in place when models become stale', async () => {
      const patchSelection = vi.fn(() => ({ success: true }))
      const saveSelection = vi.fn()
      const params = createDefaultParams({
        savedSelections: [managedSelection({ modelIds: ['removed/model-1', 'removed/model-2'] })],
        patchSelection,
        saveSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(patchSelection).toHaveBeenCalledWith('starter-id', {
          modelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
        })
      })
      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('automatically updates when only 1 model is still valid', async () => {
      const patchSelection = vi.fn(() => ({ success: true }))
      const params = createDefaultParams({
        savedSelections: [
          managedSelection({
            modelIds: ['google/gemini-2.5-flash', 'removed/model'],
          }),
        ],
        patchSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(patchSelection).toHaveBeenCalledWith('starter-id', {
          modelIds: expect.any(Array),
        })
        const newModels = patchSelection.mock.calls[0][1].modelIds
        expect(newModels).toHaveLength(2)
      })
    })

    it('does not update when both models are still valid', async () => {
      const patchSelection = vi.fn()
      const saveSelection = vi.fn()
      const params = createDefaultParams({
        savedSelections: [managedSelection()],
        patchSelection,
        saveSelection,
      })

      renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(patchSelection).not.toHaveBeenCalled()
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
        expect(saveSelection).toHaveBeenCalledWith(STARTER_SELECTION_NAME, expect.any(Array), {
          systemKey: ANONYMOUS_STARTER_SYSTEM_KEY,
        })
        const calledWith = saveSelection.mock.calls[0][1]
        expect(calledWith).toHaveLength(2)
        expect(calledWith).toContain('microsoft/phi-4')
        expect(calledWith).toContain('deepseek/deepseek-v3.2')
      })
    })

    it('handles update failure gracefully', async () => {
      const patchSelection = vi.fn(() => ({ success: false, error: 'Patch failed' }))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const params = createDefaultParams({
        savedSelections: [managedSelection({ modelIds: ['removed/model-1', 'removed/model-2'] })],
        patchSelection,
      })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
        expect(patchSelection).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalled()
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Insufficient eligible models', () => {
    it('does not create Starter Selection when fewer than 2 unregistered models exist', async () => {
      const saveSelection = vi.fn()
      const modelsByProvider: ModelsByProvider = {
        Google: [createModel('google/gemini-2.5-flash', 'Google', 'unregistered')],
      }
      const params = createDefaultParams({ modelsByProvider, saveSelection })

      const { result } = renderHook(() => useDefaultTestComparison(params))

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
      })

      expect(saveSelection).not.toHaveBeenCalled()
    })

    it('does not create Starter Selection when all models are paid tier', async () => {
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
        expect(saveSelection).toHaveBeenCalledWith(
          STARTER_SELECTION_NAME,
          ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
          { systemKey: ANONYMOUS_STARTER_SYSTEM_KEY }
        )
      })

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
        expect(saveSelection).toHaveBeenCalledWith(
          STARTER_SELECTION_NAME,
          ['google/gemini-2.5-flash', 'deepseek/deepseek-v4.1-flash'],
          { systemKey: ANONYMOUS_STARTER_SYSTEM_KEY }
        )
      })

      expect(saveSelection.mock.calls[0][1]).not.toContain('google/unavailable-model')
    })
  })

  describe('At max saved selections limit', () => {
    it('does not create Starter Selection when at limit', async () => {
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
