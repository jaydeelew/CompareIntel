import { useEffect, useRef } from 'react'

import type { CreditBalance } from '../services/creditService'
import type { ActiveResultTabs, CompareResponse, ModelConversation } from '../types'

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

    // Clear state when signing in from unregistered
    if (wasUnregistered && isNowAuthenticated) {
      setInput('')
      setResponse(null)
      setError(null)
      setIsLoading(false)
      setConversations([])
      setProcessingTime(null)
      setIsFollowUpMode(false)
      setCurrentVisibleComparisonId(null)
      setSelectedModels([])
      setOriginalSelectedModels([])
      setClosedCards(new Set())
      setActiveResultTabs({})
      setShowDoneSelectingCard(false)
      setIsModelsHidden(false)
      setIsScrollLocked(false)
      setOpenDropdowns(new Set())
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
  }, [isAuthenticated, currentAbortController])
}
