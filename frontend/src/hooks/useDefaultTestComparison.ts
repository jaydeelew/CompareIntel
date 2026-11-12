/**
 * useDefaultTestComparison - Manages the system-owned "Starter Selection" for anonymous visitors
 *
 * This hook provides a discoverable starting point for new anonymous users by:
 * - Creating a deletable saved selection named "Starter Selection" on first visit
 * - Identifying it with systemKey (never by display name alone)
 * - Preselecting 2 popular models available to the unregistered tier
 * - Automatically updating the selection when models are added/removed from registry
 * - Respecting explicit user actions (deletion persists forever, manual selections not overwritten)
 *
 * Lifecycle:
 * - Fresh visit: creates "Starter Selection" with 2 models, marks as default, and activates them
 * - Returning visit: loads the selection if still default (no manual override)
 * - Registry changes: automatically replaces stale/removed/restricted models with eligible fallbacks
 * - Active sync: only updates active selection if user is following the default (no manual override)
 * - Opted-out visit: if the user deleted the system-managed entry, NEVER recreate
 *
 * Signed-in users are not affected (keyed by user ID, not anonymous ID).
 */

import { useEffect, useRef, useState } from 'react'

import type { SubscriptionTier } from '../config/constants'
import type { ModelsByProvider } from '../types'
import logger from '../utils/logger'

export const STARTER_SELECTION_NAME = 'Starter Selection'
export const ANONYMOUS_STARTER_SYSTEM_KEY = 'anonymous-starter'
const STARTER_SELECTION_OPTED_OUT_KEY = 'compareintel_starter_selection_opted_out'
const LEGACY_TEST_COMPARISON_OPTED_OUT_KEY = 'compareintel_test_comparison_opted_out'
const LEGACY_DISPLAY_NAME = 'Test Comparison'

/**
 * Model priority list for the anonymous Starter Selection.
 * Ordered by recognizability and popularity for anonymous users.
 * Must be models from unregistered_tier_models in backend/data/models_registry.json.
 */
const DEFAULT_MODEL_PRIORITY = [
  'google/gemini-2.5-flash', // Highly recognizable Google model
  'deepseek/deepseek-v4.1-flash-1017', // Very popular recent model
  'deepseek/deepseek-v4-flash', // Alternative DeepSeek
  'google/gemini-3.1-flash-lite-preview', // Alternative Google
  'microsoft/phi-4', // Recognizable Microsoft model
  'deepseek/deepseek-v3.2', // Alternative DeepSeek
  'google/gemma-4-31b-it', // Alternative Google
  'qwen/qwen3-coder-next', // Alternative popular model
] as const

interface SavedSelectionLike {
  id: string
  name: string
  modelIds: string[]
  systemKey?: string
}

interface UseDefaultTestComparisonParams {
  /** User ID (undefined for anonymous users) */
  userId: number | undefined
  /** Subscription tier */
  tier: SubscriptionTier
  /** Currently selected models */
  selectedModels: string[]
  /** Text vs image model listing mode */
  modelMode?: 'text' | 'image'
  /** Available models by provider */
  modelsByProvider: ModelsByProvider
  /** Whether models are loaded */
  modelsLoaded: boolean
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Existing saved selections (from useSavedSelectionsComplete) */
  savedSelections: SavedSelectionLike[]
  /** Whether user can save more selections */
  canSaveMore: boolean
  /** Max saved selections allowed */
  maxSelections: number
  /** Function to save a selection */
  saveSelection: (
    name: string,
    modelIds: string[],
    options?: { systemKey?: string }
  ) => { success: boolean; error?: string }
  /** Function to patch a selection in place (name/models/systemKey) */
  patchSelection: (
    id: string,
    patch: { name?: string; modelIds?: string[]; systemKey?: string }
  ) => { success: boolean; error?: string }
  /** Function to load a selection */
  handleLoadSelection: (id: string) => void
  /** Function to set default selection */
  setDefaultSelection: (id: string | null) => void
  /** Function to get default selection ID */
  getDefaultSelectionId: () => string | null
  /** When true, do not auto-load Starter Selection (onboarding tutorial owns model picks). */
  tutorialIsActive?: boolean
}

interface UseDefaultTestComparisonReturn {
  /** Whether the Starter Selection is currently opted out */
  isOptedOut: boolean
  /** Whether initialization is complete */
  isInitialized: boolean
}

function findManagedStarter(selections: SavedSelectionLike[]): SavedSelectionLike | undefined {
  return selections.find(sel => sel.systemKey === ANONYMOUS_STARTER_SYSTEM_KEY)
}

/**
 * Previous PR builds created the managed default by display name only. Adopt that entry
 * only when it is still the default — never rename other user-created "Test Comparison" rows.
 */
function findLegacyDefaultToAdopt(
  selections: SavedSelectionLike[],
  defaultId: string | null
): SavedSelectionLike | undefined {
  if (!defaultId) return undefined
  const currentDefault = selections.find(sel => sel.id === defaultId)
  if (
    currentDefault &&
    currentDefault.name === LEGACY_DISPLAY_NAME &&
    currentDefault.systemKey !== ANONYMOUS_STARTER_SYSTEM_KEY
  ) {
    return currentDefault
  }
  return undefined
}

function isStarterSelectionOptedOut(): boolean {
  try {
    return (
      localStorage.getItem(STARTER_SELECTION_OPTED_OUT_KEY) === 'true' ||
      localStorage.getItem(LEGACY_TEST_COMPARISON_OPTED_OUT_KEY) === 'true'
    )
  } catch (error) {
    logger.warn('Failed to check Starter Selection opt-out status:', error)
    return false
  }
}

function setStarterSelectionOptedOut(optedOut: boolean): void {
  try {
    if (optedOut) {
      localStorage.setItem(STARTER_SELECTION_OPTED_OUT_KEY, 'true')
      localStorage.setItem(LEGACY_TEST_COMPARISON_OPTED_OUT_KEY, 'true')
    } else {
      localStorage.removeItem(STARTER_SELECTION_OPTED_OUT_KEY)
      localStorage.removeItem(LEGACY_TEST_COMPARISON_OPTED_OUT_KEY)
    }
  } catch (error) {
    logger.warn('Failed to set Starter Selection opt-out status:', error)
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
function selectBestTwoModels(selectableModels: Set<string>): string[] {
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
 * Hook to manage the system-owned "Starter Selection" for anonymous users
 */
export function useDefaultTestComparison(
  params: UseDefaultTestComparisonParams
): UseDefaultTestComparisonReturn {
  const {
    selectedModels,
    modelMode = 'text',
    modelsByProvider,
    modelsLoaded,
    isAuthenticated,
    savedSelections,
    canSaveMore,
    maxSelections,
    saveSelection,
    patchSelection,
    handleLoadSelection,
    setDefaultSelection,
    getDefaultSelectionId,
    tutorialIsActive = false,
  } = params

  const [isInitialized, setIsInitialized] = useState(false)
  const [isOptedOut, setIsOptedOut] = useState(false)
  const initializationAttempted = useRef(false)
  const seenManagedRef = useRef(false)

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

    const optedOut = isStarterSelectionOptedOut()
    setIsOptedOut(optedOut)

    // If opted out, do not recreate
    if (optedOut) {
      logger.debug('Starter Selection opted out, not initializing')
      setIsInitialized(true)
      return
    }

    const selectableModels = getSelectableUnregisteredModels(modelsByProvider)

    if (selectableModels.size < 2) {
      logger.warn('Not enough unregistered-tier models available for Starter Selection', {
        available: selectableModels.size,
      })
      setIsInitialized(true)
      return
    }

    const bestTwoModels = selectBestTwoModels(selectableModels)
    const managed = findManagedStarter(savedSelections)
    const legacyDefault = managed
      ? undefined
      : findLegacyDefaultToAdopt(savedSelections, getDefaultSelectionId())
    const existing = managed ?? legacyDefault

    if (existing) {
      // Only count systemKey identity as "seen". A legacy default is adopted via patch;
      // marking seen before that lands would look like a deletion and persist opt-out.
      if (managed) {
        seenManagedRef.current = true
      }
      const validModels = existing.modelIds.filter(id => selectableModels.has(id))
      const needsName = existing.name !== STARTER_SELECTION_NAME
      const needsKey = existing.systemKey !== ANONYMOUS_STARTER_SYSTEM_KEY
      const needsModels = validModels.length < 2

      if (needsName || needsKey || needsModels) {
        const nameTaken =
          needsName &&
          savedSelections.some(
            sel =>
              sel.id !== existing.id &&
              sel.name.toLowerCase() === STARTER_SELECTION_NAME.toLowerCase()
          )
        const result = patchSelection(existing.id, {
          ...(!nameTaken && needsName ? { name: STARTER_SELECTION_NAME } : {}),
          ...(needsKey ? { systemKey: ANONYMOUS_STARTER_SYSTEM_KEY } : {}),
          ...(needsModels ? { modelIds: bestTwoModels } : {}),
        })
        if (!result.success) {
          logger.error('Failed to update Starter Selection', { error: result.error })
        }
      }

      setIsInitialized(true)
      return
    }

    if (bestTwoModels.length < 2) {
      logger.warn('Could not find 2 eligible models for Starter Selection')
      setIsInitialized(true)
      return
    }

    if (!canSaveMore) {
      logger.info('Cannot create Starter Selection - at max saved selections limit', {
        current: savedSelections.length,
        max: maxSelections,
      })
      setIsInitialized(true)
      return
    }

    const displayNameTaken = savedSelections.some(
      sel => sel.name.toLowerCase() === STARTER_SELECTION_NAME.toLowerCase()
    )
    if (displayNameTaken) {
      logger.info('Starter Selection name already used by a user entry; not auto-creating')
      setIsInitialized(true)
      return
    }

    logger.info('Creating Starter Selection on first visit', { models: bestTwoModels })

    const result = saveSelection(STARTER_SELECTION_NAME, bestTwoModels, {
      systemKey: ANONYMOUS_STARTER_SYSTEM_KEY,
    })

    if (!result.success) {
      logger.error('Failed to create Starter Selection', { error: result.error })
      setIsInitialized(true)
      return
    }

    logger.info('Starter Selection created successfully')
    setIsInitialized(true)
  }, [
    isAnonymous,
    modelsLoaded,
    modelsByProvider,
    savedSelections,
    canSaveMore,
    maxSelections,
    saveSelection,
    patchSelection,
    getDefaultSelectionId,
  ])

  // Load the managed default, or mark opt-out only after we have seen it in this session
  useEffect(() => {
    if (tutorialIsActive) return
    if (!isAnonymous || !isInitialized) return
    if (modelMode !== 'text') return

    const starter = findManagedStarter(savedSelections)

    if (starter) {
      seenManagedRef.current = true

      if (selectedModels.length === 0 && getDefaultSelectionId() === null) {
        logger.debug('Setting Starter Selection as default and loading')
        setDefaultSelection(starter.id)
        handleLoadSelection(starter.id)
      } else if (selectedModels.length === 0 && getDefaultSelectionId() === starter.id) {
        logger.debug('Loading Starter Selection (default selection)')
        handleLoadSelection(starter.id)
      }
    } else if (seenManagedRef.current && !isOptedOut) {
      logger.info('Starter Selection deleted, marking as opted out')
      setStarterSelectionOptedOut(true)
      setIsOptedOut(true)
    }
  }, [
    tutorialIsActive,
    isAnonymous,
    isInitialized,
    modelMode,
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
