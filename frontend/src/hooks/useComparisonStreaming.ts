/**
 * useComparisonStreaming - Core streaming logic for AI model comparisons.
 * Uses SSE for streaming, activity-based timeout, partial result recovery.
 * Composes useStreamConnection, useModelFailureCheck, useStreamCompletion, useStreamTimeout.
 */

import { useCallback } from 'react'

import type { AttachedFile, StoredAttachedFile } from '../components/comparison'
import { getCreditAllocation, getDailyCreditLimit } from '../config/constants'
import { apiClient } from '../services/api/client'
import { compareStream } from '../services/compareService'
import { getCreditBalance } from '../services/creditService'
import type { CreditBalance } from '../services/creditService'
import { processComparisonStream, createStreamingMessage } from '../services/sseProcessor'
import type {
  CompareResponse,
  ModelConversation,
  ActiveResultTabs,
  ModelsByProvider,
} from '../types'
import { RESULT_TAB, createModelId } from '../types'
import type { ConversationMessage } from '../types/conversation'
import { validateComparisonInput } from '../utils/comparisonValidation'
import { prepareApiConversationHistory } from '../utils/conversationPreparer'
import logger from '../utils/logger'

import { useModelFailureCheck } from './useModelFailureCheck'
import { useStreamCompletion } from './useStreamCompletion'
import { useStreamConnection } from './useStreamConnection'
import { useStreamTimeout } from './useStreamTimeout'

interface TutorialState {
  isActive: boolean
  currentStep: string | null
}

export interface UseComparisonStreamingConfig {
  // User/Auth state
  isAuthenticated: boolean
  user: {
    is_verified?: boolean
    subscription_tier?: string
    monthly_credits_allocated?: number
    billing_period_start?: string
    billing_period_end?: string
    credits_reset_at?: string
    total_credits_used?: number
  } | null
  browserFingerprint: string

  // Model state
  selectedModels: string[]
  modelsByProvider: ModelsByProvider
  originalSelectedModels: string[]

  // Input state
  input: string
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  accurateInputTokens: number | null
  webSearchEnabled: boolean
  userLocation: string | null

  // Conversation state
  conversations: ModelConversation[]
  isFollowUpMode: boolean
  currentVisibleComparisonId: string | number | null

  // Credit state
  creditBalance: CreditBalance | null
  anonymousCreditsRemaining: number | null
  creditWarningType: 'none' | 'low' | 'insufficient'

  // Model errors state
  modelErrors: { [key: string]: boolean }

  // Tutorial state
  tutorialState: TutorialState

  // Refs
  userCancelledRef: React.MutableRefObject<boolean>
  hasScrolledToResultsRef: React.MutableRefObject<boolean>
  hasScrolledToResultsOnFirstChunkRef: React.MutableRefObject<boolean>
  scrolledToTopRef: React.MutableRefObject<Set<string>>
  shouldScrollToTopAfterFormattingRef: React.MutableRefObject<boolean>
  autoScrollPausedRef: React.MutableRefObject<Set<string>>
  userInteractingRef: React.MutableRefObject<Set<string>>
  lastScrollTopRef: React.MutableRefObject<Map<string, number>>
  lastAlignedRoundRef: React.MutableRefObject<number>
  isPageScrollingRef: React.MutableRefObject<boolean>
  scrollListenersRef: React.MutableRefObject<
    Map<
      string,
      {
        scroll: () => void
        wheel: (e: WheelEvent) => void
        touchstart: () => void
        mousedown: () => void
      }
    >
  >
  lastSubmittedInputRef: React.MutableRefObject<string>
}

export interface UseComparisonStreamingCallbacks {
  setError: (error: string | null) => void
  setIsLoading: (loading: boolean) => void
  setResponse: (response: CompareResponse | null) => void
  setProcessingTime: (time: number | null) => void
  setClosedCards: (cards: Set<string>) => void
  setModelErrors: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  setActiveResultTabs: React.Dispatch<React.SetStateAction<ActiveResultTabs>>
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setInput: (input: string) => void
  setIsModelsHidden: (hidden: boolean) => void
  setShowDoneSelectingCard: (show: boolean) => void
  setUserMessageTimestamp: (timestamp: string) => void
  setCurrentAbortController: (controller: AbortController | null) => void
  setOriginalSelectedModels: (models: string[]) => void
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>
  setAlreadyBrokenOutModels: (models: Set<string>) => void
  setIsScrollLocked: (locked: boolean) => void
  setUsageCount: React.Dispatch<React.SetStateAction<number>>
  setIsFollowUpMode: (mode: boolean) => void

  // Credit state setters
  setAnonymousCreditsRemaining: (credits: number | null) => void
  setCreditBalance: (balance: CreditBalance | null) => void
  setCreditWarningMessage: (message: string | null) => void
  setCreditWarningType: (type: 'none' | 'low' | 'insufficient') => void
  setCreditWarningDismissible: (dismissible: boolean) => void

  // Helper functions
  expandFiles: (files: (AttachedFile | StoredAttachedFile)[], text: string) => Promise<string>
  extractFileContentForStorage: (
    files: AttachedFile[]
  ) => Promise<Array<{ name: string; content: string; placeholder: string }>>
  setupScrollListener: (modelId: string) => boolean
  cleanupScrollListener: (modelId: string) => void
  saveConversationToLocalStorage: (
    inputData: string,
    models: string[],
    conversations: ModelConversation[],
    isUpdate: boolean,
    fileContents?: Array<{ name: string; content: string; placeholder: string }>
  ) => string | null
  syncHistoryAfterComparison: (input: string, models: string[]) => Promise<void>
  loadHistoryFromAPI: () => Promise<void>
  getFirstUserMessage: () => ConversationMessage | undefined
  getCreditWarningMessage: (
    type: 'low' | 'insufficient' | 'none',
    tier: string,
    remaining: number,
    estimated?: number,
    resetAt?: string
  ) => string
  isLowCreditWarningDismissed: (
    tier: string,
    periodType: 'daily' | 'monthly',
    resetAt?: string
  ) => boolean
  scrollConversationsToBottom: () => void
  refreshUser: () => Promise<void>
}

export interface UseComparisonStreamingReturn {
  submitComparison: () => Promise<void>
  cancelComparison: () => void
}

export function useComparisonStreaming(
  config: UseComparisonStreamingConfig,
  callbacks: UseComparisonStreamingCallbacks
): UseComparisonStreamingReturn {
  const { currentAbortControllerRef, cancelComparison } = useStreamConnection(
    {
      setIsLoading: callbacks.setIsLoading,
      setCurrentAbortController: callbacks.setCurrentAbortController,
    },
    config.userCancelledRef
  )

  const { isModelFailed, getSuccessfulModels } = useModelFailureCheck(
    config.modelErrors,
    config.conversations
  )

  const { applyStreamCompletion } = useStreamCompletion(
    {
      selectedModels: config.selectedModels,
      input: config.input,
      isFollowUpMode: config.isFollowUpMode,
      isAuthenticated: config.isAuthenticated,
      attachedFiles: config.attachedFiles,
      browserFingerprint: config.browserFingerprint,
      lastSubmittedInputRef: config.lastSubmittedInputRef,
    },
    {
      setError: callbacks.setError,
      setModelErrors: callbacks.setModelErrors,
      setActiveResultTabs: callbacks.setActiveResultTabs,
      setResponse: callbacks.setResponse,
      setConversations: callbacks.setConversations,
      setInput: callbacks.setInput,
      setCurrentVisibleComparisonId: callbacks.setCurrentVisibleComparisonId,
      setUsageCount: callbacks.setUsageCount,
      extractFileContentForStorage: callbacks.extractFileContentForStorage,
      saveConversationToLocalStorage: callbacks.saveConversationToLocalStorage,
      syncHistoryAfterComparison: callbacks.syncHistoryAfterComparison,
      getFirstUserMessage: callbacks.getFirstUserMessage,
      scrollConversationsToBottom: callbacks.scrollConversationsToBottom,
      refreshUser: callbacks.refreshUser,
    }
  )

  const { handleStreamError } = useStreamTimeout(
    {
      selectedModels: config.selectedModels,
      input: config.input,
      isFollowUpMode: config.isFollowUpMode,
      isAuthenticated: config.isAuthenticated,
      creditWarningType: config.creditWarningType,
      attachedFiles: config.attachedFiles,
      browserFingerprint: config.browserFingerprint,
      userCancelledRef: config.userCancelledRef,
      lastSubmittedInputRef: config.lastSubmittedInputRef,
    },
    {
      setError: callbacks.setError,
      setModelErrors: callbacks.setModelErrors,
      setActiveResultTabs: callbacks.setActiveResultTabs,
      setResponse: callbacks.setResponse,
      setConversations: callbacks.setConversations,
      setCurrentVisibleComparisonId: callbacks.setCurrentVisibleComparisonId,
      setCreditBalance: callbacks.setCreditBalance,
      setAnonymousCreditsRemaining: callbacks.setAnonymousCreditsRemaining,
      setIsFollowUpMode: callbacks.setIsFollowUpMode,
      extractFileContentForStorage: callbacks.extractFileContentForStorage,
      saveConversationToLocalStorage: callbacks.saveConversationToLocalStorage,
      syncHistoryAfterComparison: callbacks.syncHistoryAfterComparison,
      getFirstUserMessage: callbacks.getFirstUserMessage,
      refreshUser: callbacks.refreshUser,
    }
  )

  const {
    isAuthenticated,
    user,
    browserFingerprint,
    selectedModels,
    modelsByProvider,
    originalSelectedModels,
    input,
    attachedFiles,
    accurateInputTokens,
    webSearchEnabled,
    userLocation,
    conversations,
    isFollowUpMode,
    currentVisibleComparisonId,
    creditBalance,
    creditWarningType,
    tutorialState,
    userCancelledRef,
    hasScrolledToResultsOnFirstChunkRef,
    scrolledToTopRef,
    shouldScrollToTopAfterFormattingRef,
    autoScrollPausedRef,
    userInteractingRef,
    lastScrollTopRef,
    lastAlignedRoundRef,
    isPageScrollingRef,
    scrollListenersRef,
    lastSubmittedInputRef,
  } = config

  const {
    setError,
    setIsLoading,
    setResponse,
    setProcessingTime,
    setClosedCards,
    setModelErrors,
    setActiveResultTabs,
    setConversations,
    setInput,
    setIsModelsHidden,
    setShowDoneSelectingCard,
    setUserMessageTimestamp,
    setCurrentAbortController,
    setOriginalSelectedModels,
    setCurrentVisibleComparisonId,
    setAlreadyBrokenOutModels,
    setIsScrollLocked,
    setUsageCount,
    setIsFollowUpMode,
    setAnonymousCreditsRemaining,
    setCreditBalance,
    setCreditWarningMessage,
    setCreditWarningType,
    setCreditWarningDismissible,
    expandFiles,
    extractFileContentForStorage,
    setupScrollListener,
    cleanupScrollListener,
    saveConversationToLocalStorage,
    syncHistoryAfterComparison,
    loadHistoryFromAPI,
    getFirstUserMessage,
    getCreditWarningMessage,
    isLowCreditWarningDismissed,
    scrollConversationsToBottom,
    refreshUser,
  } = callbacks

  const submitComparison = useCallback(async () => {
    const validation = validateComparisonInput({
      user,
      input,
      selectedModels,
      modelsByProvider,
      accurateInputTokens,
    })
    if (!validation.valid) {
      setError(validation.error)
      if (validation.error?.includes('verify') || validation.error?.includes('too long')) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return
    }

    // Store original selected models for follow-up comparison logic (only for new comparisons, not follow-ups)
    if (!isFollowUpMode) {
      // Clear the currently visible comparison ID so the previous one will appear in history
      setCurrentVisibleComparisonId(null)
      // Clear already broken out models for new comparison
      setAlreadyBrokenOutModels(new Set())

      setOriginalSelectedModels([...selectedModels])

      // If there's an active conversation and we're starting a new one, save the previous one first
      if (!isAuthenticated && conversations.length > 0) {
        const previousModels =
          originalSelectedModels.length > 0
            ? originalSelectedModels
            : [...new Set(conversations.map(conv => conv.modelId))]

        const conversationsWithMessages = conversations.filter(
          conv => previousModels.includes(conv.modelId) && conv.messages.length > 0
        )

        // Only save if we have conversations with complete assistant messages
        const hasCompleteMessages = conversationsWithMessages.some(conv => {
          const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
          return (
            assistantMessages.length > 0 &&
            assistantMessages.some(msg => msg.content.trim().length > 0)
          )
        })

        if (hasCompleteMessages && conversationsWithMessages.length > 0) {
          const allUserMessages = conversationsWithMessages
            .flatMap(conv => conv.messages)
            .filter(msg => msg.type === 'user')
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

          const firstUserMessage = allUserMessages[0]

          if (firstUserMessage) {
            const inputData = firstUserMessage.content
            saveConversationToLocalStorage(
              inputData,
              previousModels,
              conversationsWithMessages,
              false
            )
          }
        }
      }
    }

    const apiConversationHistory = await prepareApiConversationHistory({
      isFollowUpMode,
      conversations,
      selectedModels,
      attachedFiles,
      expandFiles,
      getSuccessfulModels,
      isModelFailed,
    })

    setIsLoading(true)
    setError(null)
    // Clear insufficient/low credit warnings on submission
    if (creditWarningType === 'insufficient' || creditWarningType === 'low') {
      setCreditWarningMessage(null)
      setCreditWarningType('none')
      setCreditWarningDismissible(false)
    }
    setIsModelsHidden(true)
    setShowDoneSelectingCard(false)

    // Capture user timestamp when they actually submit
    const userTimestamp = new Date().toISOString()
    setUserMessageTimestamp(userTimestamp)

    setResponse(null)
    setClosedCards(new Set())
    setProcessingTime(null)
    userCancelledRef.current = false
    hasScrolledToResultsOnFirstChunkRef.current = false
    scrolledToTopRef.current.clear()
    shouldScrollToTopAfterFormattingRef.current = false
    autoScrollPausedRef.current.clear()
    userInteractingRef.current.clear()
    lastScrollTopRef.current.clear()
    lastAlignedRoundRef.current = 0
    setIsScrollLocked(false)

    // Clean up any existing scroll listeners from previous comparison
    scrollListenersRef.current.forEach((_listener, modelId) => {
      cleanupScrollListener(modelId)
    })

    const startTime = Date.now()
    let streamResult: Awaited<ReturnType<typeof processComparisonStream>> | null = null

    try {
      const controller = new AbortController()
      currentAbortControllerRef.current = controller
      setCurrentAbortController(controller)

      const conversationId =
        isAuthenticated && currentVisibleComparisonId
          ? typeof currentVisibleComparisonId === 'string'
            ? parseInt(currentVisibleComparisonId, 10)
            : currentVisibleComparisonId
          : null

      // Expand file contents before submission
      let expandedInput = input
      if (attachedFiles.length > 0) {
        try {
          expandedInput = await expandFiles(attachedFiles, input)
        } catch (error) {
          logger.error('Error expanding files:', error)
          setError('Failed to process attached files. Please try again.')
          setIsLoading(false)
          return
        }
      }

      lastSubmittedInputRef.current = expandedInput

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const modelsToUse = isFollowUpMode ? getSuccessfulModels(selectedModels) : selectedModels

      logger.debug('[API Request] user location:', userLocation ? 'sending' : 'none (IP fallback)')

      const stream = await compareStream(
        {
          input_data: expandedInput,
          models: modelsToUse,
          conversation_history: apiConversationHistory,
          browser_fingerprint: browserFingerprint,
          conversation_id: conversationId || undefined,
          estimated_input_tokens: accurateInputTokens || undefined,
          timezone: userTimezone,
          location: userLocation || undefined,
          enable_web_search: webSearchEnabled || false,
        },
        controller.signal
      )

      if (!stream) {
        throw new Error('Failed to start streaming comparison')
      }

      const reader = stream.getReader()

      setModelErrors({})

      // Set all selected models to 'raw' tab to show streaming content immediately
      const rawTabs: ActiveResultTabs = {} as ActiveResultTabs
      selectedModels.forEach(modelId => {
        rawTabs[createModelId(modelId)] = RESULT_TAB.RAW
      })
      setActiveResultTabs(rawTabs)

      // Initialize empty conversations immediately so cards appear during streaming
      if (!isFollowUpMode) {
        const emptyConversations: ModelConversation[] = selectedModels.map(modelId => ({
          modelId: createModelId(modelId),
          messages: [
            createStreamingMessage('user', input, userTimestamp),
            createStreamingMessage('assistant', '', userTimestamp),
          ],
        }))
        setConversations(emptyConversations)
      }

      // Adapter: sseProcessor passes partial balance objects; our setter expects CreditBalance | null
      const adaptedSetCreditBalance = (
        balance: {
          credits_allocated?: number
          credits_used_this_period?: number
          credits_used_today?: number
          credits_remaining?: number
          period_type?: string
          subscription_tier?: string
          credits_reset_at?: string
          billing_period_start?: string
          billing_period_end?: string
          total_credits_used?: number
        } | null
      ) => {
        if (!balance || typeof balance !== 'object' || Object.keys(balance).length === 0) {
          return
        }
        const merged: CreditBalance = {
          ...balance,
          credits_allocated: balance.credits_allocated ?? creditBalance?.credits_allocated ?? 0,
          credits_remaining: balance.credits_remaining ?? creditBalance?.credits_remaining ?? 0,
          period_type: (balance.period_type ?? creditBalance?.period_type ?? 'daily') as
            | 'daily'
            | 'monthly',
          subscription_tier:
            balance.subscription_tier ?? creditBalance?.subscription_tier ?? 'free',
        }
        setCreditBalance(merged)
      }

      streamResult = await processComparisonStream(reader, controller, {
        input,
        selectedModels,
        isFollowUpMode,
        isAuthenticated,
        user,
        creditBalance,
        browserFingerprint,
        startTime,
        userTimestamp,
        userCancelledRef,
        hasScrolledToResultsOnFirstChunkRef,
        shouldScrollToTopAfterFormattingRef,
        autoScrollPausedRef,
        isPageScrollingRef,
        tutorialState,
        setModelErrors,
        setActiveResultTabs,
        setConversations,
        setResponse,
        setProcessingTime,
        setCreditBalance: adaptedSetCreditBalance,
        setAnonymousCreditsRemaining,
        setupScrollListener,
        getCreditAllocation,
        getDailyCreditLimit,
        getCreditBalance,
        refreshUser,
        getCreditWarningMessage,
        isLowCreditWarningDismissed,
        setCreditWarningMessage,
        setCreditWarningType,
        setCreditWarningDismissible,
        setIsFollowUpMode,
        loadHistoryFromAPI,
        apiClientDeleteCache: (key: string) => apiClient.deleteCache(key),
      })

      await applyStreamCompletion(streamResult, startTime, userTimestamp)
    } catch (err) {
      handleStreamError(err, streamResult, startTime)
    } finally {
      currentAbortControllerRef.current = null
      setCurrentAbortController(null)
      userCancelledRef.current = false
      setIsLoading(false)
    }
  }, [
    // Config dependencies
    isAuthenticated,
    user,
    browserFingerprint,
    selectedModels,
    modelsByProvider,
    originalSelectedModels,
    input,
    attachedFiles,
    accurateInputTokens,
    webSearchEnabled,
    userLocation,
    conversations,
    isFollowUpMode,
    currentVisibleComparisonId,
    creditBalance,
    creditWarningType,
    tutorialState,
    // Refs (stable, but included for clarity)
    currentAbortControllerRef,
    userCancelledRef,
    hasScrolledToResultsOnFirstChunkRef,
    scrolledToTopRef,
    shouldScrollToTopAfterFormattingRef,
    autoScrollPausedRef,
    userInteractingRef,
    lastScrollTopRef,
    lastAlignedRoundRef,
    isPageScrollingRef,
    scrollListenersRef,
    lastSubmittedInputRef,
    // Callback dependencies
    setError,
    setIsLoading,
    setResponse,
    setProcessingTime,
    setClosedCards,
    setModelErrors,
    setActiveResultTabs,
    setConversations,
    setInput,
    setIsModelsHidden,
    setShowDoneSelectingCard,
    setUserMessageTimestamp,
    setCurrentAbortController,
    setOriginalSelectedModels,
    setCurrentVisibleComparisonId,
    setAlreadyBrokenOutModels,
    setIsScrollLocked,
    setUsageCount,
    setIsFollowUpMode,
    setAnonymousCreditsRemaining,
    setCreditBalance,
    setCreditWarningMessage,
    setCreditWarningType,
    setCreditWarningDismissible,
    expandFiles,
    extractFileContentForStorage,
    setupScrollListener,
    cleanupScrollListener,
    saveConversationToLocalStorage,
    syncHistoryAfterComparison,
    loadHistoryFromAPI,
    getFirstUserMessage,
    getCreditWarningMessage,
    isLowCreditWarningDismissed,
    scrollConversationsToBottom,
    refreshUser,
    // Helper functions
    getSuccessfulModels,
    isModelFailed,
    applyStreamCompletion,
    handleStreamError,
  ])

  return {
    submitComparison,
    cancelComparison,
  }
}
