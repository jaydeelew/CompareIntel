/**
 * useModelManagement - Manages model selection with tier-based restrictions
 *
 * ## Why This Hook Exists
 *
 * Model selection has complex business rules that would clutter the UI component:
 * - Different tiers have different model limits (3 for free, up to 12 for Pro+)
 * - Some models are restricted to paid tiers only
 * - Follow-up mode restricts selection to originally selected models
 * - Provider "Select All" needs to respect all these constraints
 *
 * This hook encapsulates all selection logic so components only need to call
 * `handleModelToggle(modelId)` or `toggleAllForProvider(provider)`.
 *
 * ## Subscription Tiers and Model Access
 *
 * | Tier         | Max Models | Model Access                |
 * |--------------|------------|----------------------------|
 * | Unregistered | 3          | tier_access='unregistered' |
 * | Free         | 3          | tier_access != 'paid'      |
 * | Starter(+)   | 6          | All models                 |
 * | Pro          | 9          | All models                 |
 * | Pro+         | 12         | All models                 |
 *
 * ## Follow-up Mode Behavior
 *
 * When in follow-up mode (continuing a conversation), users can only:
 * - Toggle models that were in the original selection
 * - Must keep at least one model selected
 * - Cannot add new models (must start new comparison)
 *
 * This ensures conversation context is maintained for the selected models.
 *
 * @example
 * ```typescript
 * const {
 *   handleModelToggle,
 *   toggleAllForProvider,
 *   openDropdowns,
 *   toggleDropdown,
 * } = useModelManagement({
 *   selectedModels,
 *   setSelectedModels,
 *   maxModelsLimit: 6,
 *   isFollowUpMode: false,
 *   // ...other options
 * });
 *
 * // In model checkbox:
 * <input
 *   type="checkbox"
 *   checked={selectedModels.includes(model.id)}
 *   onChange={() => handleModelToggle(model.id)}
 * />
 *
 * // In provider header:
 * <button onClick={() => toggleAllForProvider('OpenAI')}>
 *   Select All
 * </button>
 * ```
 */

import { useState, useCallback } from 'react'

import type { Model, ModelsByProvider, User } from '../types'

/**
 * Configuration options for the model management hook
 */
export interface UseModelManagementOptions {
  /** Currently selected model IDs */
  selectedModels: string[]
  /** Function to update selected models */
  setSelectedModels: React.Dispatch<React.SetStateAction<string[]>>
  /** Originally selected models (for follow-up mode restrictions) */
  originalSelectedModels: string[]
  /** Maximum number of models that can be selected (tier-based limit) */
  maxModelsLimit: number
  /** Models organized by provider */
  modelsByProvider: ModelsByProvider
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Current user (for tier access) */
  user: User | null
  /** Whether in follow-up mode (restricts model selection) */
  isFollowUpMode: boolean
  /** Current error message (for clearing related errors) */
  error: string | null
  /** Function to set error message */
  setError: (error: string | null) => void
  /** Accurate token count for input validation */
  accurateInputTokens: number | null
}

export interface UseModelManagementReturn {
  /** Set of currently open provider dropdowns */
  openDropdowns: Set<string>
  /** Function to update open dropdowns */
  setOpenDropdowns: React.Dispatch<React.SetStateAction<Set<string>>>
  /** Toggle a provider dropdown open/closed */
  toggleDropdown: (provider: string) => void
  /** Collapse all provider dropdowns */
  collapseAllDropdowns: () => void
  /** Toggle all models for a provider (select all / deselect all) */
  toggleAllForProvider: (provider: string) => void
  /** Toggle a single model selection */
  handleModelToggle: (modelId: string) => void
}

/**
 * Determine user's subscription tier and paid status
 *
 * @param isAuthenticated - Whether user is logged in
 * @param user - User object (may be null)
 * @returns Object with userTier string and isPaidTier boolean
 */
function getUserTierInfo(isAuthenticated: boolean, user: User | null) {
  const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
  const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)
  return { userTier, isPaidTier }
}

/**
 * Check if a model is restricted for the user's subscription tier
 *
 * Model access is determined by the model's `tier_access` field:
 * - 'unregistered': Available to everyone including anonymous users
 * - 'free': Available to free tier and above (not anonymous)
 * - 'paid': Only available to paying subscribers
 *
 * @param model - Model to check
 * @param userTier - User's subscription tier
 * @param isPaidTier - Whether user is on a paid tier
 * @returns True if model is restricted (user cannot access it)
 */
function isModelRestricted(model: Model, userTier: string, isPaidTier: boolean): boolean {
  if (isPaidTier) return false
  if (userTier === 'unregistered') return model.tier_access !== 'unregistered'
  if (userTier === 'free') return model.tier_access === 'paid'
  return false
}

/**
 * Find a model by ID across all providers
 *
 * @param modelsByProvider - Models organized by provider
 * @param modelId - Model ID to find
 * @returns Model object or null if not found
 */
function findModelById(modelsByProvider: ModelsByProvider, modelId: string): Model | null {
  for (const providerModels of Object.values(modelsByProvider)) {
    const model = providerModels.find(m => m.id === modelId)
    if (model) return model
  }
  return null
}

/**
 * Hook for managing model selection with tier-based restrictions
 *
 * @param options - Configuration including current selection, limits, and callbacks
 * @returns Object with dropdown state and selection handlers
 */
export function useModelManagement({
  selectedModels,
  setSelectedModels,
  originalSelectedModels,
  maxModelsLimit,
  modelsByProvider,
  isAuthenticated,
  user,
  isFollowUpMode,
  error,
  setError,
  accurateInputTokens,
}: UseModelManagementOptions): UseModelManagementReturn {
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set())

  const toggleDropdown = useCallback((provider: string) => {
    setOpenDropdowns(prev => {
      const newSet = new Set(prev)
      if (newSet.has(provider)) {
        newSet.delete(provider)
      } else {
        newSet.add(provider)
      }
      return newSet
    })
  }, [])

  const collapseAllDropdowns = useCallback(() => {
    setOpenDropdowns(new Set())
  }, [])

  const toggleAllForProvider = useCallback(
    (provider: string) => {
      const providerModels = modelsByProvider[provider] || []
      const { userTier, isPaidTier } = getUserTierInfo(isAuthenticated, user)

      // Filter out unavailable models and restricted models based on tier
      const availableProviderModels = providerModels.filter(model => {
        if (model.available === false) return false
        if (isPaidTier) return true
        if (userTier === 'unregistered') return model.tier_access === 'unregistered'
        if (userTier === 'free') return model.tier_access !== 'paid'
        return true
      })

      const providerModelIds = availableProviderModels.map(model => model.id)

      // Check if all provider models are currently selected
      const allProviderModelsSelected = providerModelIds.every(id =>
        selectedModels.includes(String(id))
      )

      if (allProviderModelsSelected) {
        // Deselecting - check if this would leave us with no models
        const providerModelIdsStrings = providerModelIds.map(id => String(id))
        const modelsAfterDeselect = selectedModels.filter(
          id => !providerModelIdsStrings.includes(id)
        )

        // In follow-up mode, show error if deselecting would leave zero models total
        if (isFollowUpMode && modelsAfterDeselect.length === 0) {
          setError('Must have at least one model to process')
          setTimeout(() => setError(null), 5000)
          return
        }
      }

      // Track if we couldn't select all models for the provider
      let couldNotSelectAll = false

      if (!allProviderModelsSelected && !isFollowUpMode) {
        const alreadySelectedFromProvider = providerModelIds.filter(id =>
          selectedModels.includes(String(id))
        ).length
        const remainingSlots =
          maxModelsLimit - (selectedModels.length - alreadySelectedFromProvider)
        const modelsToAdd = providerModelIds.slice(0, remainingSlots)
        couldNotSelectAll = modelsToAdd.length < providerModelIds.length
      }

      setSelectedModels(prev => {
        const newSelection = new Set(prev)

        if (allProviderModelsSelected) {
          // Deselect all provider models
          providerModelIds.forEach(id => newSelection.delete(id))
        } else {
          // In follow-up mode, only allow selecting models that were originally selected
          if (isFollowUpMode) {
            const modelsToAdd = providerModelIds.filter(
              id => originalSelectedModels.includes(id) && !prev.includes(id)
            )
            modelsToAdd.forEach(id => newSelection.add(id))
          } else {
            // Select all provider models, but respect the limit
            const alreadySelectedFromProvider = providerModelIds.filter(id =>
              prev.includes(id)
            ).length
            const remainingSlots = maxModelsLimit - (prev.length - alreadySelectedFromProvider)
            const modelsToAdd = providerModelIds.slice(0, remainingSlots)
            modelsToAdd.forEach(id => newSelection.add(id))
          }
        }

        return Array.from(newSelection)
      })

      // Show warning if not all models could be selected due to tier limit
      if (couldNotSelectAll && !allProviderModelsSelected && !isFollowUpMode) {
        const tierName = !isAuthenticated ? 'Unregistered' : user?.subscription_tier || 'free'
        setError(
          `Your ${tierName} tier allows a maximum of ${maxModelsLimit} models per comparison. Not all available models from ${provider} could be selected.`
        )
        setTimeout(() => setError(null), 10000)
        return
      }

      // Clear any previous error when successfully adding models (only when selecting, not deselecting)
      if (
        !allProviderModelsSelected &&
        error &&
        (error.includes('Maximum') ||
          error.includes('Must have at least one model') ||
          error.includes('Please select at least one model'))
      ) {
        setError(null)
      }
    },
    [
      modelsByProvider,
      isAuthenticated,
      user,
      selectedModels,
      isFollowUpMode,
      maxModelsLimit,
      originalSelectedModels,
      setSelectedModels,
      setError,
      error,
    ]
  )

  const handleModelToggle = useCallback(
    (modelId: string) => {
      if (selectedModels.includes(modelId)) {
        // Check if this is the last selected model - only prevent in follow-up mode
        if (selectedModels.length === 1 && isFollowUpMode) {
          setError('Must have at least one model to process')
          setTimeout(() => setError(null), 5000)
          return
        }

        // Allow deselection in both normal and follow-up mode
        const updatedSelectedModels = selectedModels.filter(id => id !== modelId)
        setSelectedModels(updatedSelectedModels)

        // Clear "input too long" error only if all problematic models are deselected
        if (
          error &&
          error.includes('Your input is too long for one or more of the selected models')
        ) {
          if (accurateInputTokens !== null && updatedSelectedModels.length > 0) {
            const remainingModelInfo = updatedSelectedModels
              .map(id => {
                const model = findModelById(modelsByProvider, id)
                if (model?.max_input_tokens) {
                  return { id, maxInputTokens: model.max_input_tokens }
                }
                return null
              })
              .filter((info): info is { id: string; maxInputTokens: number } => info !== null)

            const stillHasProblemModels = remainingModelInfo.some(
              m => m.maxInputTokens < accurateInputTokens
            )

            if (!stillHasProblemModels) {
              setError(null)
            }
          } else {
            setError(null)
          }
        }

        // Clear any previous error when deselecting a model
        if (error && error.includes('Maximum')) {
          setError(null)
        }
      } else {
        // In follow-up mode, only allow reselecting models that were originally selected
        if (isFollowUpMode) {
          if (originalSelectedModels.includes(modelId)) {
            setSelectedModels(prev => [...prev, modelId])
            if (
              error &&
              (error.includes('Maximum') ||
                error.includes('Must have at least one model') ||
                error.includes('Please select at least one model'))
            ) {
              setError(null)
            }
          } else {
            setError(
              'Cannot add new models during follow-up. Please start a new comparison to select different models.'
            )
            setTimeout(() => setError(null), 5000)
          }
          return
        }

        // Check if model is restricted for user's tier
        const { userTier, isPaidTier } = getUserTierInfo(isAuthenticated, user)
        const modelInfo = findModelById(modelsByProvider, modelId)

        if (modelInfo && isModelRestricted(modelInfo, userTier, isPaidTier)) {
          const tierName = !isAuthenticated ? 'Unregistered' : user?.subscription_tier || 'free'
          const upgradeMsg =
            tierName === 'Unregistered'
              ? ' Sign up for a free account or upgrade to a paid tier to access premium models.'
              : tierName === 'free'
                ? ' Upgrade to Starter ($9.95/month) or higher to access all premium models.'
                : ' This model requires a paid subscription.'
          setError(
            `The model "${modelInfo.name}" is not available for your ${tierName} tier.${upgradeMsg}`
          )
          setTimeout(() => setError(null), 10000)
          return
        }

        // Check limit before adding (only in normal mode)
        if (selectedModels.length >= maxModelsLimit) {
          const tierName = !isAuthenticated ? 'Unregistered' : user?.subscription_tier || 'free'
          const upgradeMsg =
            tierName === 'Unregistered'
              ? ' Sign up for a free account to get 3 models.'
              : tierName === 'free'
                ? ' Upgrade to Starter for 6 models or Pro for 9 models.'
                : tierName === 'starter' || tierName === 'starter_plus'
                  ? ' Upgrade to Pro for 9 models or Pro+ for 12 models.'
                  : tierName === 'pro'
                    ? ' Upgrade to Pro+ for 12 models.'
                    : ''
          setError(
            `Your ${tierName} tier allows maximum ${maxModelsLimit} models per comparison.${upgradeMsg}`
          )
          return
        }

        setSelectedModels(prev => [...prev, modelId])

        // Clear any previous error when successfully adding a model
        if (
          error &&
          (error.includes('Maximum') ||
            error.includes('Must have at least one model') ||
            error.includes('Please select at least one model'))
        ) {
          setError(null)
        }
      }
    },
    [
      selectedModels,
      isFollowUpMode,
      originalSelectedModels,
      isAuthenticated,
      user,
      modelsByProvider,
      maxModelsLimit,
      error,
      accurateInputTokens,
      setSelectedModels,
      setError,
    ]
  )

  return {
    openDropdowns,
    setOpenDropdowns,
    toggleDropdown,
    collapseAllDropdowns,
    toggleAllForProvider,
    handleModelToggle,
  }
}
