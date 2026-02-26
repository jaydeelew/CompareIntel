import { useEffect, useRef } from 'react'

import type { CreditBalance } from '../services/creditService'
import type { ActiveResultTabs, CompareResponse, ModelConversation } from '../types'
import { loadSessionState, clearSessionState } from '../utils/sessionState'

interface UseAuthStateEffectsConfig {
  isAuthenticated: boolean
  userId: number | undefined
  currentAbortController: AbortController | null
}

interface UseAuthStateEffectsCallbacks {
  setError: (error: string | null) => void
  setInput: (input: string) => void
  setResponse: (response: CompareResponse | null) => void
  setIsLoading: (loading: boolean) => void
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setProcessingTime: (time: number | null) => void
  setIsFollowUpMode: (mode: boolean) => void
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedModels: (models: string[]) => void
  setOriginalSelectedModels: (models: string[]) => void
  setClosedCards: (cards: Set<string>) => void
  setActiveResultTabs: React.Dispatch<React.SetStateAction<ActiveResultTabs>>
  setShowDoneSelectingCard: (show: boolean) => void
  setIsModelsHidden: (hidden: boolean) => void
  setIsScrollLocked: (locked: boolean) => void
  setOpenDropdowns: React.Dispatch<React.SetStateAction<Set<string>>>
  setDefaultSelectionOverridden: (overridden: boolean) => void
  setCreditBalance: (balance: CreditBalance | null) => void
  setAnonymousCreditsRemaining: (credits: number | null) => void
  setCurrentAbortController: (controller: AbortController | null) => void
  setWebSearchEnabled: (enabled: boolean) => void
  setTemperature: (temp: number) => void
  setTopP: (v: number) => void
  setMaxTokens: (v: number | null) => void
  hasScrolledToResultsRef: React.MutableRefObject<boolean>
  shouldScrollToTopAfterFormattingRef: React.MutableRefObject<boolean>
}

export function useAuthStateEffects(
  config: UseAuthStateEffectsConfig,
  callbacks: UseAuthStateEffectsCallbacks
) {
  const { isAuthenticated, userId, currentAbortController } = config
  const {
    setError,
    setInput,
    setResponse,
    setIsLoading,
    setConversations,
    setProcessingTime,
    setIsFollowUpMode,
    setCurrentVisibleComparisonId,
    setSelectedModels,
    setOriginalSelectedModels,
    setClosedCards,
    setActiveResultTabs,
    setShowDoneSelectingCard,
    setIsModelsHidden,
    setIsScrollLocked,
    setOpenDropdowns,
    setDefaultSelectionOverridden,
    setCreditBalance,
    setAnonymousCreditsRemaining,
    setCurrentAbortController,
    setWebSearchEnabled,
    setTemperature,
    setTopP,
    setMaxTokens,
    hasScrolledToResultsRef,
    shouldScrollToTopAfterFormattingRef,
  } = callbacks

  const prevIsAuthenticatedRef = useRef<boolean | null>(null)
  const prevUserIdRef = useRef<number | null | undefined>(null)
  const isInitialMountRef = useRef<boolean>(true)

  // Clear error when user changes
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      prevUserIdRef.current = userId
      return
    }

    if (prevUserIdRef.current !== userId) {
      setError(null)
    }

    prevUserIdRef.current = userId
  }, [userId, setError])

  // Handle auth state transitions (login/logout)
  useEffect(() => {
    if (prevIsAuthenticatedRef.current === null) {
      prevIsAuthenticatedRef.current = isAuthenticated
      return
    }

    const wasUnregistered = prevIsAuthenticatedRef.current === false
    const isNowAuthenticated = isAuthenticated === true
    const wasAuthenticated = prevIsAuthenticatedRef.current === true
    const isNowUnregistered = isAuthenticated === false

    // Handle signing in from unregistered - try to restore saved state
    if (wasUnregistered && isNowAuthenticated && userId) {
      // Check for saved session state (from "remember state on logout" feature)
      const savedState = loadSessionState(userId)

      if (savedState) {
        setInput(savedState.input || '')
        setResponse(savedState.response as CompareResponse | null)
        setIsFollowUpMode(savedState.isFollowUpMode || false)
        setWebSearchEnabled(savedState.webSearchEnabled || false)
        if (savedState.temperature != null) {
          setTemperature(Math.max(0, Math.min(2, savedState.temperature)))
        }
        if (savedState.topP != null) {
          setTopP(Math.max(0, Math.min(1, savedState.topP)))
        }
        if (savedState.maxTokens != null) {
          setMaxTokens(savedState.maxTokens)
        }

        // Restore model selections
        if (savedState.selectedModels && savedState.selectedModels.length > 0) {
          setSelectedModels(savedState.selectedModels)
          setOriginalSelectedModels(savedState.selectedModels)
        } else {
          setSelectedModels([])
          setOriginalSelectedModels([])
        }

        // Restore conversations (for follow-up mode)
        if (savedState.conversations && savedState.conversations.length > 0) {
          setConversations(savedState.conversations as ModelConversation[])
        } else {
          setConversations([])
        }

        // When restoring saved state, collapse models section and all provider dropdowns
        setIsModelsHidden(true)
        setOpenDropdowns(new Set())

        // Clear the saved state after restoring
        clearSessionState()
      } else {
        // No saved state - clear everything as before
        setInput('')
        setResponse(null)
        setIsFollowUpMode(false)
        setWebSearchEnabled(false)
        setTemperature(0.7)
        setTopP(1)
        setMaxTokens(null)
        setSelectedModels([])
        setOriginalSelectedModels([])
        setConversations([])
      }

      // Always reset these regardless of saved state
      setError(null)
      setIsLoading(false)
      setProcessingTime(null)
      setCurrentVisibleComparisonId(null)
      setClosedCards(new Set())
      setActiveResultTabs({})
      setShowDoneSelectingCard(false)
      // Only set isModelsHidden and openDropdowns if not restoring saved state
      // (they are set above when restoring saved state)
      if (!savedState) {
        setIsModelsHidden(false)
        setOpenDropdowns(new Set())
      }
      setIsScrollLocked(false)
      setDefaultSelectionOverridden(false)
      setCreditBalance(null)
      setAnonymousCreditsRemaining(null)
      if (currentAbortController) {
        currentAbortController.abort()
        setCurrentAbortController(null)
      }
      hasScrolledToResultsRef.current = false
      shouldScrollToTopAfterFormattingRef.current = false
    }

    // Reset default selection on logout
    if (wasAuthenticated && isNowUnregistered) {
      setDefaultSelectionOverridden(false)
      setInput('')
      setResponse(null)
      setError(null)
      setIsLoading(false)
      setConversations([])
      setProcessingTime(null)
      setIsFollowUpMode(false)
      setCurrentVisibleComparisonId(null)
      setCreditBalance(null)
      setAnonymousCreditsRemaining(null)
    }

    prevIsAuthenticatedRef.current = isAuthenticated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, userId, currentAbortController])
}
