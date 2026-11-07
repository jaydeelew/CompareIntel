/**
 * useDefaultTestComparison - Manages the "Test Comparison" default saved selection for anonymous visitors
 *
 * This hook provides a discoverable starting point for new anonymous users by:
 * - Creating a deletable saved selection named "Test Comparison" on first visit
 * - Preselecting 2 popular models available to the unregistered tier
 * - Automatically updating the selection when models are added/removed from registry
 * - Respecting explicit user actions (deletion persists forever, manual selections not overwritten)
 *
 * Lifecycle:
 * - Fresh visit: creates "Test Comparison" with 2 models, marks as default, and activates them
 * - Returning visit: loads the selection if still default (no manual override)
 * - Registry changes: automatically replaces stale/removed/restricted models with eligible fallbacks
 * - Active sync: only updates active selection if user is following the default (no manual override)
 * - Opted-out visit: if user deleted "Test Comparison", NEVER recreate (deletion persists forever)
 *
 * Signed-in users are not affected (keyed by user ID, not anonymous ID).
 */

import { useEffect, useRef, useState } from 'react'

import type { SubscriptionTier } from '../config/constants'
import type { ModelsByProvider } from '../types'
import logger from '../utils/logger'

const TEST_COMPARISON_NAME = 'Test Comparison'
const TEST_COMPARISON_OPTED_OUT_KEY = 'compareintel_test_comparison_opted_out'

/**
 * Model priority list for "Test Comparison" default selection.
 * Ordered by recognizability and popularity for anonymous users.
 * Must be models from unregistered_tier_models in backend/data/models_registry.json.
 */
const DEFAULT_MODEL_PRIORITY = [
  'google/gemini-2.5-flash', // Highly recognizable Google model
  'deepseek/deepseek-v4.1-flash', // Very popular recent model
  'deepseek/deepseek-v4-flash', // Alternative DeepSeek
  'google/gemini-3.1-flash-lite-preview', // Alternative Google
  'microsoft/phi-4', // Recognizable Microsoft model
  'deepseek/deepseek-v3.2', // Alternative DeepSeek
  'google/gemma-4-31b-it', // Alternative Google
  'qwen/qwen3-coder-next', // Alternative popular model
] as const

interface UseDefaultTestComparisonParams {
  /** User ID (undefined for anonymous users) */
  userId: number | undefined
  /** Subscription tier */
  tier: SubscriptionTier
  /** Currently selected models */
  selectedModels: string[]
  /** Available models by provider */
  modelsByProvider: ModelsByProvider
  /** Whether models are loaded */
  modelsLoaded: boolean
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Existing saved selections (from useSavedSelectionsComplete) */
  savedSelections: Array<{ id: string; name: string; modelIds: string[] }>
  /** Whether user can save more selections */
  canSaveMore: boolean
  /** Max saved selections allowed */
  maxSelections: number
  /** Function to save a selection */
  saveSelection: (name: string, modelIds: string[]) => { success: boolean; error?: string }
  /** Function to delete a selection */
  deleteSelection: (id: string) => void
  /** Function to load a selection */
  handleLoadSelection: (id: string) => void
  /** Function to set default selection */
  setDefaultSelection: (id: string | null) => void
  /** Function to get default selection ID */
  getDefaultSelectionId: () => string | null
}

interface UseDefaultTestComparisonReturn {
  /** Whether the Test Comparison is currently opted out */
  isOptedOut: boolean
  /** Whether initialization is complete */
  isInitialized: boolean
}

/**
 * Check if user has opted out of Test Comparison (deleted it explicitly)
 */
function isTestComparisonOptedOut(): boolean {
  try {
    return localStorage.getItem(TEST_COMPARISON_OPTED_OUT_KEY) === 'true'
  } catch (error) {
    logger.warn('Failed to check Test Comparison opt-out status:', error)
    return false
  }
}

/**
 * Mark user as opted out of Test Comparison
 */
function setTestComparisonOptedOut(optedOut: boolean): void {
  try {
    if (optedOut) {
      localStorage.setItem(TEST_COMPARISON_OPTED_OUT_KEY, 'true')
    } else {
      localStorage.removeItem(TEST_COMPARISON_OPTED_OUT_KEY)
    }
  } catch (error) {
    logger.warn('Failed to set Test Comparison opt-out status:', error)
  }
}

/**
 * Get selectable model IDs for unregistered tier from current registry
 */
function getSelectableUnregisteredModels(modelsByProvider: ModelsByProvider): Set<string> {
  const selectable = new Set<string>()
  for (const providerModels of Object.values(modelsByProvider)) {
    for (const model of providerModels) {
      // Only text models that are available and unregistered tier
      if (
        model.available !== false &&
        model.tier_access === 'unregistered' &&
        !model.supports_image_generation
      ) {
        selectable.add(String(model.id))
      }
    }
  }
  return selectable
}

/**
 * Select best 2 models from priority list that are currently available
 */
function selectBestTwoModels(
  modelsByProvider: ModelsByProvider,
  selectableModels: Set<string>
): string[] {
  const selected: string[] = []

  // Try priority list first
  for (const modelId of DEFAULT_MODEL_PRIORITY) {
    if (selectableModels.has(modelId)) {
      selected.push(modelId)
      if (selected.length === 2) {
        return selected
      }
    }
  }

  // If we don't have 2 yet, add any remaining selectable models
  if (selected.length < 2) {
    for (const modelId of selectableModels) {
      if (!selected.includes(modelId)) {
        selected.push(modelId)
        if (selected.length === 2) {
          break
        }
      }
    }
  }

  return selected
}

/**
 * Hook to manage "Test Comparison" default saved selection for anonymous users
 */
export function useDefaultTestComparison(
  params: UseDefaultTestComparisonParams
): UseDefaultTestComparisonReturn {
  const {
    selectedModels,
    modelsByProvider,
    modelsLoaded,
    isAuthenticated,
    savedSelections,
    canSaveMore,
    maxSelections,
    saveSelection,
    deleteSelection,
    handleLoadSelection,
    setDefaultSelection,
    getDefaultSelectionId,
  } = params

  const [isInitialized, setIsInitialized] = useState(false)
  const [isOptedOut, setIsOptedOut] = useState(false)
  const initializationAttempted = useRef(false)

  // Only applies to anonymous users
  const isAnonymous = !isAuthenticated

  useEffect(() => {
    // Only run for anonymous users
    if (!isAnonymous) {
      setIsInitialized(true)
      return
    }

    // Wait for models to load
    if (!modelsLoaded || Object.keys(modelsByProvider).length === 0) {
      return
    }

    // Only run once
    if (initializationAttempted.current) {
      return
    }

    initializationAttempted.current = true

    const optedOut = isTestComparisonOptedOut()
    setIsOptedOut(optedOut)

    // If opted out, do not recreate
    if (optedOut) {
      logger.debug('Test Comparison opted out, not initializing')
      setIsInitialized(true)
      return
    }

    // Check if Test Comparison already exists
    const existingTestComparison = savedSelections.find(sel => sel.name === TEST_COMPARISON_NAME)

    const selectableModels = getSelectableUnregisteredModels(modelsByProvider)

    if (selectableModels.size < 2) {
      // Not enough eligible models to create Test Comparison
      logger.warn('Not enough unregistered-tier models available for Test Comparison', {
        available: selectableModels.size,
      })
      setIsInitialized(true)
      return
    }

    const bestTwoModels = selectBestTwoModels(modelsByProvider, selectableModels)

    if (existingTestComparison) {
      // Test Comparison exists - validate its models are still eligible
      const validModels = existingTestComparison.modelIds.filter(id => selectableModels.has(id))

      if (validModels.length < 2) {
        // Models are stale or restricted - automatically update the selection
        logger.info('Test Comparison has stale models, automatically updating', {
          old: existingTestComparison.modelIds,
          new: bestTwoModels,
        })

        // Delete and recreate with new models (without marking as opted out)
        deleteSelection(existingTestComparison.id)

        // Create new selection with fresh models
        const result = saveSelection(TEST_COMPARISON_NAME, bestTwoModels)

        if (result.success) {
          logger.info('Test Comparison updated successfully with fresh models')
          // Note: We'll handle default setting and loading in the next effect
        } else {
          logger.error('Failed to update Test Comparison', { error: result.error })
        }
      }

      setIsInitialized(true)
      return
    }

    // First visit - create Test Comparison
    if (bestTwoModels.length < 2) {
      logger.warn('Could not find 2 eligible models for Test Comparison')
      setIsInitialized(true)
      return
    }

    // Check if we can save more selections
    if (!canSaveMore) {
      logger.info('Cannot create Test Comparison - at max saved selections limit', {
        current: savedSelections.length,
        max: maxSelections,
      })
      setIsInitialized(true)
      return
    }

    logger.info('Creating Test Comparison on first visit', { models: bestTwoModels })

    const result = saveSelection(TEST_COMPARISON_NAME, bestTwoModels)

    if (!result.success) {
      logger.error('Failed to create Test Comparison', { error: result.error })
      setIsInitialized(true)
      return
    }

    logger.info('Test Comparison created successfully')
    setIsInitialized(true)
  }, [
    isAnonymous,
    modelsLoaded,
    modelsByProvider,
    savedSelections,
    canSaveMore,
    maxSelections,
    saveSelection,
    deleteSelection,
    handleLoadSelection,
    setDefaultSelection,
    getDefaultSelectionId,
    selectedModels.length,
  ])

  // Monitor for Test Comparison creation and load it, or deletion to mark as opted out
  useEffect(() => {
    if (!isAnonymous || !isInitialized) return

    const testComparison = savedSelections.find(sel => sel.name === TEST_COMPARISON_NAME)

    if (testComparison) {
      // Test Comparison exists

      // If user hasn't selected any models and this is the default, load it
      if (
        selectedModels.length === 0 &&
        getDefaultSelectionId() === null &&
        !getDefaultSelectionId()
      ) {
        // On first creation, set as default and load
        logger.debug('Setting Test Comparison as default and loading')
        setDefaultSelection(testComparison.id)
        handleLoadSelection(testComparison.id)
      } else if (selectedModels.length === 0 && getDefaultSelectionId() === testComparison.id) {
        // Returning user with Test Comparison as default
        logger.debug('Loading Test Comparison (default selection)')
        handleLoadSelection(testComparison.id)
      }
    } else if (initializationAttempted.current && !isOptedOut) {
      // Test Comparison was deleted
      logger.info('Test Comparison deleted, marking as opted out')
      setTestComparisonOptedOut(true)
      setIsOptedOut(true)
    }
  }, [
    isAnonymous,
    isInitialized,
    savedSelections,
    isOptedOut,
    selectedModels.length,
    getDefaultSelectionId,
    setDefaultSelection,
    handleLoadSelection,
  ])

  return {
    isOptedOut,
    isInitialized,
  }
}
