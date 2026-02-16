/**
 * useComparisonStreaming - Core streaming logic for AI model comparisons.
 * Uses SSE for streaming, activity-based timeout, partial result recovery.
 * Receives config/callbacks; parent owns state, hook orchestrates mutations.
 */

import { useCallback, useRef } from 'react'

import type { AttachedFile, StoredAttachedFile } from '../components/comparison'
import { getCreditAllocation, getDailyCreditLimit } from '../config/constants'
import { apiClient } from '../services/api/client'
import { ApiError, PaymentRequiredError } from '../services/api/errors'
import { compareStream, getRateLimitStatus } from '../services/compareService'
import { getCreditBalance } from '../services/creditService'
import type { CreditBalance } from '../services/creditService'
import {
  processComparisonStream,
  createStreamingMessage,
  estimateTokensSimple,
} from '../services/sseProcessor'
import type {
  CompareResponse,
  ConversationMessage,
  ModelConversation,
  ActiveResultTabs,
  ModelsByProvider,
} from '../types'
import { RESULT_TAB, createModelId } from '../types'
import { validateComparisonInput } from '../utils/comparisonValidation'
import { prepareApiConversationHistory } from '../utils/conversationPreparer'
import { isErrorMessage } from '../utils/error'
import logger from '../utils/logger'

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
  /** Tracks the current AbortController for cancellation support */
  const currentAbortControllerRef = useRef<AbortController | null>(null)

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
    modelErrors,
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

  // Helper to check if a model has failed
  const isModelFailed = useCallback(
    (modelId: string): boolean => {
      const formattedModelId = createModelId(modelId)

      // Check if model has error flag (check both raw and formatted IDs)
      if (modelErrors[modelId] === true || modelErrors[formattedModelId] === true) {
        return true
      }

      // Check if model has error or empty/blank content in conversation
      const conversation = conversations.find(
        conv => conv.modelId === modelId || conv.modelId === formattedModelId
      )
      if (conversation) {
        const assistantMessages = conversation.messages.filter(msg => msg.type === 'assistant')
        if (assistantMessages.length === 0) return true
        const lastMessage = assistantMessages[assistantMessages.length - 1]
        if (
          lastMessage &&
          (isErrorMessage(lastMessage.content) || !(lastMessage.content || '').trim())
        ) {
          return true
        }
      }

      return false
    },
    [modelErrors, conversations]
  )

  // Helper to get successful models (filter out failed ones)
  const getSuccessfulModels = useCallback(
    (models: string[]): string[] => {
      return models.filter(modelId => !isModelFailed(modelId))
    },
    [isModelFailed]
  )

  const cancelComparison = useCallback(() => {
    if (currentAbortControllerRef.current) {
      userCancelledRef.current = true
      currentAbortControllerRef.current.abort()
      currentAbortControllerRef.current = null
    }
    setIsLoading(false)
    setCurrentAbortController(null)
  }, [setIsLoading, setCurrentAbortController, userCancelledRef])

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

      const {
        streamingResults,
        completedModels,
        localModelErrors,
        modelStartTimes,
        modelCompletionTimes,
        streamingMetadata,
        streamError,
      } = streamResult

      if (streamError) {
        const errorModelErrors: { [key: string]: boolean } = { ...localModelErrors }
        selectedModels.forEach(modelId => {
          const createdModelId = createModelId(modelId)
          if (!completedModels.has(createdModelId)) {
            errorModelErrors[createdModelId] = true
          }
        })
        setModelErrors(errorModelErrors)
        setError(`Streaming error: ${streamError.message}. Partial results have been saved.`)
        setTimeout(() => setError(null), 10000)
      }

      const finalModelErrors: { [key: string]: boolean } = { ...localModelErrors }
      selectedModels.forEach(modelId => {
        const createdModelId = createModelId(modelId)
        if (!completedModels.has(createdModelId)) {
          const content = streamingResults[createdModelId] || ''
          if (content.trim().length === 0) {
            finalModelErrors[createdModelId] = true
          }
        }
      })
      setModelErrors(finalModelErrors)

      const formattedTabs: ActiveResultTabs = {} as ActiveResultTabs
      selectedModels.forEach(modelId => {
        const createdModelId = createModelId(modelId)
        const content = streamingResults[createdModelId] || ''
        const hasError = finalModelErrors[createdModelId] === true || isErrorMessage(content)
        if (!hasError && content.trim().length > 0) {
          formattedTabs[createdModelId] = RESULT_TAB.FORMATTED
        }
      })
      setActiveResultTabs(prev => ({ ...prev, ...formattedTabs }))

      setResponse({
        results: { ...streamingResults },
        metadata: {
          input_length: input.length,
          models_requested: selectedModels.length,
          models_successful: Object.keys(streamingResults).filter(
            modelId =>
              !isErrorMessage(streamingResults[modelId]) &&
              (streamingResults[modelId] || '').trim().length > 0
          ).length,
          models_failed: Object.keys(streamingResults).filter(
            modelId =>
              isErrorMessage(streamingResults[modelId]) ||
              (streamingResults[modelId] || '').trim().length === 0
          ).length,
          timestamp: new Date().toISOString(),
          processing_time_ms: Date.now() - startTime,
        },
      })

      if (!isFollowUpMode) {
        setConversations(prevConversations => {
          const updated = prevConversations.map(conv => {
            let content = streamingResults[conv.modelId] || ''
            if (!content.trim()) content = 'Error: No response received'
            const startT = modelStartTimes[conv.modelId]
            const completionTime = modelCompletionTimes[conv.modelId]
            return {
              ...conv,
              messages: conv.messages.map((msg, idx) => {
                if (idx === 0 && msg.type === 'user') {
                  return { ...msg, timestamp: startT || msg.timestamp }
                }
                if (idx === 1 && msg.type === 'assistant') {
                  return {
                    ...msg,
                    content,
                    timestamp: completionTime || msg.timestamp,
                    output_tokens: msg.output_tokens || estimateTokensSimple(content),
                  }
                }
                return msg
              }),
            }
          })
          return updated
        })
      } else {
        setConversations(prevConversations => {
          const updated = prevConversations.map(conv => {
            const content = streamingResults[conv.modelId]
            const contentStr = content ?? ''
            // Don't add follow-up to failed models: not in response, error, or empty
            const isFailed =
              content === undefined || isErrorMessage(contentStr) || !contentStr.trim()
            if (isFailed) return conv

            const completionTime = modelCompletionTimes[conv.modelId]
            const outputTokens = estimateTokensSimple(contentStr)
            const hasNewUserMessage = conv.messages.some(
              (msg, idx) =>
                msg.type === 'user' && msg.content === input && idx >= conv.messages.length - 2
            )
            if (!hasNewUserMessage) {
              const startT = modelStartTimes[conv.modelId]
              const assistantMessage = createStreamingMessage(
                'assistant',
                contentStr,
                completionTime || new Date().toISOString()
              )
              assistantMessage.output_tokens = outputTokens
              return {
                ...conv,
                messages: [
                  ...conv.messages,
                  createStreamingMessage('user', input, startT || userTimestamp),
                  assistantMessage,
                ],
              }
            }
            return {
              ...conv,
              messages: conv.messages.map((msg, idx) => {
                if (idx === conv.messages.length - 1 && msg.type === 'assistant') {
                  return {
                    ...msg,
                    content: contentStr || msg.content,
                    timestamp: completionTime || msg.timestamp,
                    output_tokens: outputTokens,
                  }
                }
                return msg
              }),
            }
          })
          return updated
        })
      }

      const saveToHistoryAfterStream = () => {
        if (!isAuthenticated && !isFollowUpMode) {
          setTimeout(() => {
            setConversations(currentConversations => {
              const conversationsWithMessages = currentConversations.filter(
                conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
              )
              const hasCompleteMessages = conversationsWithMessages.some(conv => {
                const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
                return (
                  assistantMessages.length > 0 &&
                  assistantMessages.some(msg => msg.content.trim().length > 0)
                )
              })
              if (hasCompleteMessages && conversationsWithMessages.length > 0) {
                const firstUserMessage = conversationsWithMessages
                  .flatMap(conv => conv.messages)
                  .filter(msg => msg.type === 'user')
                  .sort(
                    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                  )[0]
                if (firstUserMessage) {
                  const inputData = firstUserMessage.content
                  ;(async () => {
                    let fileContentsForSave: Array<{
                      name: string
                      content: string
                      placeholder: string
                    }> = []
                    const attachedFilesToExtract = attachedFiles.filter(
                      (f): f is AttachedFile => 'file' in f
                    )
                    if (attachedFilesToExtract.length > 0) {
                      fileContentsForSave =
                        await extractFileContentForStorage(attachedFilesToExtract)
                    } else {
                      const storedFiles = attachedFiles.filter(
                        (f): f is StoredAttachedFile => 'content' in f
                      )
                      fileContentsForSave = storedFiles.map(f => ({
                        name: f.name,
                        content: f.content,
                        placeholder: f.placeholder,
                      }))
                    }
                    const savedId = saveConversationToLocalStorage(
                      inputData,
                      selectedModels,
                      conversationsWithMessages,
                      false,
                      fileContentsForSave
                    )
                    if (savedId) setCurrentVisibleComparisonId(savedId)
                  })()
                }
              }
              return currentConversations
            })
          }, 200)
        } else if (isAuthenticated && !isFollowUpMode) {
          setTimeout(async () => {
            const inputToMatch =
              lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
            if (inputToMatch) await syncHistoryAfterComparison(inputToMatch, selectedModels)
          }, 500)
        } else if (!isAuthenticated && isFollowUpMode) {
          setTimeout(() => {
            setConversations(currentConversations => {
              const conversationsWithMessages = currentConversations.filter(
                conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
              )
              const hasCompleteMessages = conversationsWithMessages.some(conv => {
                const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
                return (
                  assistantMessages.length > 0 &&
                  assistantMessages.some(msg => msg.content.trim().length > 0)
                )
              })
              if (hasCompleteMessages && conversationsWithMessages.length > 0) {
                const firstUserMessage = conversationsWithMessages
                  .flatMap(conv => conv.messages)
                  .filter(msg => msg.type === 'user')
                  .sort(
                    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                  )[0]
                if (firstUserMessage) {
                  const inputData = firstUserMessage.content
                  ;(async () => {
                    let fileContentsForSave: Array<{
                      name: string
                      content: string
                      placeholder: string
                    }> = []
                    const attachedFilesToExtract = attachedFiles.filter(
                      (f): f is AttachedFile => 'file' in f
                    )
                    if (attachedFilesToExtract.length > 0) {
                      fileContentsForSave =
                        await extractFileContentForStorage(attachedFilesToExtract)
                    } else {
                      const storedFiles = attachedFiles.filter(
                        (f): f is StoredAttachedFile => 'content' in f
                      )
                      fileContentsForSave = storedFiles.map(f => ({
                        name: f.name,
                        content: f.content,
                        placeholder: f.placeholder,
                      }))
                    }
                    const savedId = saveConversationToLocalStorage(
                      inputData,
                      selectedModels,
                      conversationsWithMessages,
                      true,
                      fileContentsForSave
                    )
                    if (savedId) setCurrentVisibleComparisonId(savedId)
                  })()
                }
              }
              return currentConversations
            })
          }, 200)
        } else if (isAuthenticated && isFollowUpMode) {
          setTimeout(async () => {
            const inputToMatch =
              lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
            if (inputToMatch) await syncHistoryAfterComparison(inputToMatch, selectedModels)
          }, 500)
        }
      }
      saveToHistoryAfterStream()

      // Set final response with metadata
      const filteredData = {
        results: streamingResults,
        metadata: streamingMetadata || {
          input_length: input.length,
          models_requested: selectedModels.length,
          models_successful: Object.keys(streamingResults).filter(
            modelId =>
              !isErrorMessage(streamingResults[modelId]) &&
              (streamingResults[modelId] || '').trim().length > 0
          ).length,
          models_failed: Object.keys(streamingResults).filter(
            modelId =>
              isErrorMessage(streamingResults[modelId]) ||
              (streamingResults[modelId] || '').trim().length === 0
          ).length,
          timestamp: new Date().toISOString(),
          processing_time_ms: Date.now() - startTime,
        },
      }

      setResponse(filteredData)

      // Clear input field only if at least one model succeeded
      if (filteredData.metadata.models_successful > 0) {
        setInput('')
      }

      // Track usage only if at least one model succeeded
      if (filteredData.metadata.models_successful > 0) {
        if (isAuthenticated) {
          try {
            await refreshUser()
          } catch (error) {
            logger.error('Failed to refresh user data:', error)
          }
        }

        try {
          const cacheKey = browserFingerprint
            ? `GET:/rate-limit-status?fingerprint=${encodeURIComponent(browserFingerprint)}`
            : 'GET:/rate-limit-status'
          apiClient.deleteCache(cacheKey)

          const data = await getRateLimitStatus(browserFingerprint)
          const newCount = data.fingerprint_usage || data.daily_usage || 0
          setUsageCount(newCount)

          const today = new Date().toDateString()
          localStorage.setItem(
            'compareintel_usage',
            JSON.stringify({
              count: newCount,
              date: today,
            })
          )
        } catch (error) {
          if (error instanceof Error && error.name === 'CancellationError') {
            // Silently handle
          } else {
            logger.error('Failed to sync usage count after comparison:', error)
          }
        }
      } else {
        setError(
          'All models failed to respond. This comparison did not count towards your daily limit. Please try again in a moment.'
        )
        setTimeout(() => {
          setError(null)
        }, 8000)
      }

      // Scroll conversations to show the results
      if (isFollowUpMode) {
        setTimeout(() => {
          scrollConversationsToBottom()
        }, 600)
      } else {
        setTimeout(() => {
          scrollConversationsToBottom()
        }, 500)
      }
    } catch (err) {
      const sr = streamResult
      const streamingResults = sr?.streamingResults ?? {}
      const completedModels = sr?.completedModels ?? new Set<string>()
      const localModelErrors = sr?.localModelErrors ?? {}
      const modelStartTimes = sr?.modelStartTimes ?? {}
      const modelCompletionTimes = sr?.modelCompletionTimes ?? {}

      const savePartialResultsOnError = () => {
        const hasAnyResults = Object.keys(streamingResults).some(
          modelId => (streamingResults[modelId] || '').trim().length > 0
        )

        if (!hasAnyResults) return

        const errorModelErrors: { [key: string]: boolean } = { ...localModelErrors }
        if (selectedModels && Array.isArray(selectedModels)) {
          selectedModels.forEach(modelId => {
            try {
              const rawModelId = modelId
              const formattedModelId = createModelId(modelId)
              if (!completedModels.has(rawModelId) && !completedModels.has(formattedModelId)) {
                errorModelErrors[rawModelId] = true
                errorModelErrors[formattedModelId] = true
              }
            } catch (error) {
              logger.error('Error processing model in savePartialResultsOnError:', error)
            }
          })
        }
        setModelErrors(errorModelErrors)

        setResponse({
          results: { ...streamingResults },
          metadata: {
            input_length: input.length,
            models_requested: selectedModels.length,
            models_successful: Object.keys(streamingResults).filter(
              modelId =>
                !isErrorMessage(streamingResults[modelId]) &&
                (streamingResults[modelId] || '').trim().length > 0
            ).length,
            models_failed: Object.keys(streamingResults).filter(
              modelId =>
                isErrorMessage(streamingResults[modelId]) ||
                (streamingResults[modelId] || '').trim().length === 0
            ).length,
            timestamp: new Date().toISOString(),
            processing_time_ms: Date.now() - startTime,
          },
        })

        // Update conversations with partial results
        if (!isFollowUpMode) {
          setConversations(prevConversations => {
            return prevConversations.map(conv => {
              const rawModelId =
                selectedModels && Array.isArray(selectedModels)
                  ? selectedModels.find(m => createModelId(m) === conv.modelId) || conv.modelId
                  : conv.modelId
              const content =
                (streamingResults &&
                  (streamingResults[rawModelId] || streamingResults[conv.modelId])) ||
                ''
              const startT =
                (modelStartTimes &&
                  (modelStartTimes[rawModelId] || modelStartTimes[conv.modelId])) ||
                undefined
              const completionTime =
                (modelCompletionTimes &&
                  (modelCompletionTimes[rawModelId] || modelCompletionTimes[conv.modelId])) ||
                undefined

              return {
                ...conv,
                messages: conv.messages.map((msg, idx) => {
                  if (idx === 0 && msg.type === 'user') {
                    return { ...msg, timestamp: startT || msg.timestamp }
                  } else if (idx === 1 && msg.type === 'assistant') {
                    return {
                      ...msg,
                      content,
                      timestamp: completionTime || msg.timestamp,
                    }
                  }
                  return msg
                }),
              }
            })
          })
        }

        // Save to history
        setTimeout(() => {
          if (!isAuthenticated && !isFollowUpMode) {
            setConversations(currentConversations => {
              const conversationsWithMessages = currentConversations.filter(
                conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
              )

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
                  ;(async () => {
                    let fileContentsForSave: Array<{
                      name: string
                      content: string
                      placeholder: string
                    }> = []
                    const attachedFilesToExtract = attachedFiles.filter(
                      (f): f is AttachedFile => 'file' in f && f.file instanceof File
                    )
                    if (attachedFilesToExtract.length > 0) {
                      fileContentsForSave =
                        await extractFileContentForStorage(attachedFilesToExtract)
                    } else {
                      const storedFiles = attachedFiles.filter(
                        (f): f is StoredAttachedFile => 'content' in f && !('file' in f)
                      )
                      fileContentsForSave = storedFiles.map(f => ({
                        name: f.name,
                        content: f.content,
                        placeholder: f.placeholder,
                      }))
                    }
                    const savedId = saveConversationToLocalStorage(
                      inputData,
                      selectedModels,
                      conversationsWithMessages,
                      false,
                      fileContentsForSave
                    )
                    if (savedId) {
                      setCurrentVisibleComparisonId(savedId)
                    }
                  })()
                }
              }

              return currentConversations
            })
          } else if (isAuthenticated && !isFollowUpMode) {
            setTimeout(async () => {
              const inputToMatch =
                lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
              if (inputToMatch) {
                await syncHistoryAfterComparison(inputToMatch, selectedModels)
              }
            }, 500)
          }
        }, 200)
      }

      // Handle cancellation errors
      if (
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'CancellationError')
      ) {
        if (userCancelledRef.current) {
          setError('Model comparison cancelled by user.')
          return
        }

        // Handle timeout
        if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
          setError('Request timed out after 1 minute of inactivity.')
          return
        }

        const timeoutModelErrors: { [key: string]: boolean } = { ...(localModelErrors || {}) }
        selectedModels.forEach(modelId => {
          try {
            const rawModelId = modelId
            const formattedModelId = createModelId(modelId)
            if (!completedModels.has(rawModelId) && !completedModels.has(formattedModelId)) {
              timeoutModelErrors[rawModelId] = true
              timeoutModelErrors[formattedModelId] = true
            }
          } catch (error) {
            logger.error('Error processing model in timeout handler:', error)
          }
        })
        setModelErrors(timeoutModelErrors)

        // Switch successful models to formatted view even on timeout
        const formattedTabs: ActiveResultTabs = {} as ActiveResultTabs
        selectedModels.forEach(modelId => {
          try {
            const rawModelId = modelId
            const formattedModelId = createModelId(modelId)
            const content =
              (streamingResults &&
                (streamingResults[rawModelId] || streamingResults[formattedModelId])) ||
              ''
            const hasError =
              timeoutModelErrors[rawModelId] === true ||
              timeoutModelErrors[formattedModelId] === true ||
              isErrorMessage(content)
            if (!hasError && content.trim().length > 0) {
              formattedTabs[formattedModelId] = RESULT_TAB.FORMATTED
            }
          } catch (error) {
            logger.error('Error formatting model tab:', error)
          }
        })
        setActiveResultTabs(prev => ({ ...prev, ...formattedTabs }))

        // Final state update for conversations with timeout handling
        if (!isFollowUpMode) {
          setConversations(prevConversations => {
            return prevConversations.map(conv => {
              const rawModelId =
                selectedModels.find(m => createModelId(m) === conv.modelId) || conv.modelId
              const content = streamingResults[rawModelId] || streamingResults[conv.modelId] || ''
              const startT = modelStartTimes[rawModelId] || modelStartTimes[conv.modelId]
              const completionTime =
                modelCompletionTimes[rawModelId] || modelCompletionTimes[conv.modelId]

              return {
                ...conv,
                messages: conv.messages.map((msg, idx) => {
                  if (idx === 0 && msg.type === 'user') {
                    return { ...msg, timestamp: startT || msg.timestamp }
                  } else if (idx === 1 && msg.type === 'assistant') {
                    return {
                      ...msg,
                      content,
                      timestamp: completionTime || msg.timestamp,
                    }
                  }
                  return msg
                }),
              }
            })
          })
        }

        // Refresh credits if any models completed successfully before timeout
        const successfulModelsCount = (
          selectedModels && Array.isArray(selectedModels) ? selectedModels : []
        ).filter(modelId => {
          try {
            const rawModelId = modelId
            const formattedModelId = createModelId(modelId)
            const hasCompleted =
              completedModels.has(rawModelId) || completedModels.has(formattedModelId)
            const hasError =
              (timeoutModelErrors &&
                (timeoutModelErrors[rawModelId] === true ||
                  timeoutModelErrors[formattedModelId] === true)) ||
              false
            const content =
              (streamingResults &&
                (streamingResults[rawModelId] || streamingResults[formattedModelId])) ||
              ''
            const isError = isErrorMessage(content)
            return hasCompleted && !hasError && !isError && content.trim().length > 0
          } catch (error) {
            logger.error('Error checking successful model:', error)
            return false
          }
        }).length

        if (successfulModelsCount > 0) {
          if (isAuthenticated) {
            refreshUser()
              .then(() => getCreditBalance())
              .then(balance => {
                setCreditBalance(balance)
              })
              .catch(error =>
                logger.error('Failed to refresh credit balance after timeout:', error)
              )
          } else {
            getCreditBalance(browserFingerprint)
              .then(balance => {
                setAnonymousCreditsRemaining(balance.credits_remaining)
                setCreditBalance(balance)
              })
              .catch(error =>
                logger.error('Failed to refresh anonymous credit balance after timeout:', error)
              )
          }
        }

        if (userCancelledRef.current) {
          const elapsedTime = Date.now() - startTime
          const elapsedSeconds = (elapsedTime / 1000).toFixed(1)
          setError(`Comparison cancelled by user after ${elapsedSeconds} seconds`)
        } else {
          if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
            setError('Request timed out after 1 minute of inactivity.')
            return
          }

          const totalCount = selectedModels.length
          let successfulCount = 0
          let failedCount = 0
          let timedOutCount = 0

          selectedModels.forEach(modelId => {
            try {
              const rawModelId = modelId
              const formattedModelId = createModelId(modelId)
              const modelIdToCheck = completedModels.has(rawModelId) ? rawModelId : formattedModelId

              if (completedModels.has(modelIdToCheck)) {
                const hasError =
                  (localModelErrors &&
                    (localModelErrors[rawModelId] === true ||
                      localModelErrors[formattedModelId] === true)) ||
                  false
                const content =
                  (streamingResults &&
                    (streamingResults[rawModelId] || streamingResults[formattedModelId])) ||
                  ''
                const isError = hasError || isErrorMessage(content)

                if (isError || content.trim().length === 0) {
                  failedCount++
                } else {
                  successfulCount++
                }
              } else {
                timedOutCount++
              }
            } catch (modelError) {
              logger.error('Error processing model in timeout handler:', modelError)
              timedOutCount++
            }
          })

          let errorMessage: string

          if (successfulCount === 0 && failedCount === 0 && timedOutCount === totalCount) {
            const modelText = totalCount === 1 ? 'model' : 'models'
            const suggestionText =
              totalCount === 1
                ? 'Please wait a moment and try again.'
                : 'Try selecting fewer models, or wait a moment and try again.'
            errorMessage = `Request timed out after 1 minute with no response (${totalCount} ${modelText}). ${suggestionText}`
          } else {
            const parts: string[] = []

            if (successfulCount > 0) {
              const text =
                successfulCount === 1
                  ? 'model completed successfully'
                  : 'models completed successfully'
              parts.push(`${successfulCount} ${text}`)
            }

            if (failedCount > 0) {
              const text = failedCount === 1 ? 'model failed' : 'models failed'
              parts.push(`${failedCount} ${text}`)
            }

            if (timedOutCount > 0) {
              const text = timedOutCount === 1 ? 'model timed out' : 'models timed out'
              parts.push(`${timedOutCount} ${text} after 1 minute of inactivity`)
            }

            if (parts.length > 0) {
              errorMessage = parts.join(', ') + '.'
            } else {
              errorMessage = 'Request timed out after 1 minute of inactivity.'
            }
          }

          setError(errorMessage)
        }

        try {
          savePartialResultsOnError()
        } catch (saveError) {
          logger.error('Error saving partial results on timeout:', saveError)
        }
      } else if (err instanceof PaymentRequiredError) {
        if (isFollowUpMode) {
          setIsFollowUpMode(false)
        }
        if (creditWarningType !== 'none') {
          setError(
            err.message ||
              'Insufficient credits for this request. Please upgrade your plan or wait for credits to reset.'
          )
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (err instanceof ApiError && err.status === 402) {
        if (isFollowUpMode) {
          setIsFollowUpMode(false)
        }
        if (creditWarningType !== 'none') {
          const errorMessage =
            err.response?.detail || err.message || 'Insufficient credits for this request.'
          setError(errorMessage)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (err instanceof Error && err.message.includes('Failed to fetch')) {
        setError('Unable to connect to the server. Please check if the backend is running.')
        savePartialResultsOnError()
      } else if (err instanceof Error) {
        setError(err.message || 'An unexpected error occurred')
        savePartialResultsOnError()
      } else {
        setError('An unexpected error occurred')
        savePartialResultsOnError()
      }
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
  ])

  return {
    submitComparison,
    cancelComparison,
  }
}
