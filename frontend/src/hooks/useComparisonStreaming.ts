/**
 * useComparisonStreaming - Core streaming logic for AI model comparisons.
 * Uses SSE for streaming, activity-based timeout, partial result recovery.
 * Composes useStreamConnection, useModelFailureCheck, useStreamCompletion, useStreamTimeout.
 */

import { useCallback } from 'react'

import { getCreditAllocation, getDailyCreditLimit } from '../config/constants'
import { apiClient } from '../services/api/client'
import { ApiError } from '../services/api/errors'
import { compareStream } from '../services/compareService'
import { getCreditBalance } from '../services/creditService'
import type { CreditBalance } from '../services/creditService'
import { processComparisonStream, createStreamingMessage } from '../services/sseProcessor'
import type { ModelConversation, ActiveResultTabs } from '../types'
import { RESULT_TAB, createModelId } from '../types'
import type {
  StreamingAuthInfo,
  StreamingModelSelection,
  StreamingInputState,
  StreamingConversationState,
  StreamingCreditState,
  StreamingRefs,
  StreamingStateCallbacks,
  StreamingCreditCallbacks,
  StreamingHelperCallbacks,
} from '../types/streamingConfig'
import { validateComparisonInput } from '../utils/comparisonValidation'
import { prepareApiConversationHistory } from '../utils/conversationPreparer'
import logger from '../utils/logger'
import { modelSupportsImageGeneration } from '../utils/visionModels'

import { useModelFailureCheck } from './useModelFailureCheck'
import { useStreamCompletion } from './useStreamCompletion'
import { useStreamConnection } from './useStreamConnection'
import { useStreamTimeout } from './useStreamTimeout'

export interface UseComparisonStreamingConfig {
  auth: StreamingAuthInfo
  models: StreamingModelSelection
  input: StreamingInputState
  conversation: StreamingConversationState
  credit: StreamingCreditState
  refs: StreamingRefs
  modelErrors: { [key: string]: boolean }
}

export interface UseComparisonStreamingCallbacks {
  state: StreamingStateCallbacks
  credit: StreamingCreditCallbacks
  helpers: StreamingHelperCallbacks
}

export interface UseComparisonStreamingReturn {
  submitComparison: () => Promise<void>
  cancelComparison: () => void
}

export function useComparisonStreaming(
  config: UseComparisonStreamingConfig,
  callbacks: UseComparisonStreamingCallbacks
): UseComparisonStreamingReturn {
  const { auth, models, input: inputState, conversation, credit, refs, modelErrors } = config
  const { state: stateCb, credit: creditCb, helpers } = callbacks

  const { currentAbortControllerRef, cancelComparison } = useStreamConnection(
    {
      setIsLoading: stateCb.setIsLoading,
      setCurrentAbortController: stateCb.setCurrentAbortController,
    },
    refs.userCancelledRef
  )

  const { isModelFailed, getSuccessfulModels } = useModelFailureCheck(
    modelErrors,
    conversation.conversations
  )

  const { applyStreamCompletion } = useStreamCompletion(
    {
      selectedModels: models.selectedModels,
      input: inputState.input,
      isFollowUpMode: conversation.isFollowUpMode,
      isAuthenticated: auth.isAuthenticated,
      attachedFiles: inputState.attachedFiles,
      browserFingerprint: auth.browserFingerprint,
      lastSubmittedInputRef: refs.lastSubmittedInputRef,
      userCancelledRef: refs.userCancelledRef,
      modelMode: inputState.modelMode,
      temperature: inputState.temperature,
      topP: inputState.topP,
      maxTokens: inputState.maxTokens,
      aspectRatio: inputState.aspectRatio ?? '1:1',
      imageSize: inputState.imageSize ?? '1K',
    },
    {
      setError: stateCb.setError,
      setModelErrors: stateCb.setModelErrors,
      setActiveResultTabs: stateCb.setActiveResultTabs,
      setResponse: stateCb.setResponse,
      setConversations: stateCb.setConversations,
      setInput: stateCb.setInput,
      setCurrentVisibleComparisonId: stateCb.setCurrentVisibleComparisonId,
      setUsageCount: stateCb.setUsageCount,
      extractFileContentForStorage: helpers.extractFileContentForStorage,
      saveConversationToLocalStorage: helpers.saveConversationToLocalStorage,
      syncHistoryAfterComparison: helpers.syncHistoryAfterComparison,
      getFirstUserMessage: helpers.getFirstUserMessage,
      scrollConversationsToBottom: helpers.scrollConversationsToBottom,
      refreshUser: helpers.refreshUser,
    }
  )

  const { handleStreamError } = useStreamTimeout(
    {
      selectedModels: models.selectedModels,
      input: inputState.input,
      isFollowUpMode: conversation.isFollowUpMode,
      isAuthenticated: auth.isAuthenticated,
      creditWarningType: credit.creditWarningType,
      attachedFiles: inputState.attachedFiles,
      browserFingerprint: auth.browserFingerprint,
      userCancelledRef: refs.userCancelledRef,
      lastSubmittedInputRef: refs.lastSubmittedInputRef,
      modelMode: inputState.modelMode,
      temperature: inputState.temperature,
      topP: inputState.topP,
      maxTokens: inputState.maxTokens,
      aspectRatio: inputState.aspectRatio ?? '1:1',
      imageSize: inputState.imageSize ?? '1K',
    },
    {
      setError: stateCb.setError,
      setModelErrors: stateCb.setModelErrors,
      setActiveResultTabs: stateCb.setActiveResultTabs,
      setResponse: stateCb.setResponse,
      setConversations: stateCb.setConversations,
      setCurrentVisibleComparisonId: stateCb.setCurrentVisibleComparisonId,
      setCreditBalance: creditCb.setCreditBalance,
      setAnonymousCreditsRemaining: creditCb.setAnonymousCreditsRemaining,
      setIsFollowUpMode: stateCb.setIsFollowUpMode,
      extractFileContentForStorage: helpers.extractFileContentForStorage,
      saveConversationToLocalStorage: helpers.saveConversationToLocalStorage,
      syncHistoryAfterComparison: helpers.syncHistoryAfterComparison,
      getFirstUserMessage: helpers.getFirstUserMessage,
      refreshUser: helpers.refreshUser,
    }
  )

  const { selectedModels, modelsByProvider, originalSelectedModels } = models
  const {
    input,
    attachedFiles,
    accurateInputTokens,
    webSearchEnabled,
    userLocation,
    temperature,
    topP,
    maxTokens,
    modelMode,
    aspectRatio = '1:1',
    imageSize = '1K',
  } = inputState
  const { conversations, isFollowUpMode, currentVisibleComparisonId } = conversation
  const { creditBalance, creditWarningType } = credit
  const {
    userCancelledRef,
    scrolledToTopRef,
    shouldScrollToTopAfterFormattingRef,
    autoScrollPausedRef,
    userInteractingRef,
    lastScrollTopRef,
    lastAlignedRoundRef,
    isPageScrollingRef,
    scrollListenersRef,
    lastSubmittedInputRef,
  } = refs

  const submitComparison = useCallback(async () => {
    const hasAttachedImages = attachedFiles.some(f => 'base64Data' in f && f.base64Data)
    const validation = validateComparisonInput({
      user: auth.user,
      input,
      selectedModels,
      modelsByProvider,
      accurateInputTokens,
      hasAttachedImages,
    })
    if (!validation.valid) {
      stateCb.setError(validation.error)
      if (
        validation.error?.includes('verify') ||
        validation.error?.includes('too long') ||
        validation.error?.includes('attached an image')
      ) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return
    }

    stateCb.clearStreamingReasoningUi()

    // Store original selected models for follow-up comparison logic (only for new comparisons, not follow-ups)
    if (!isFollowUpMode) {
      // Clear the currently visible comparison ID so the previous one will appear in history
      stateCb.setCurrentVisibleComparisonId(null)
      // Clear already broken out models for new comparison
      stateCb.setAlreadyBrokenOutModels(new Set())

      stateCb.setOriginalSelectedModels([...selectedModels])

      // If there's an active conversation and we're starting a new one, save the previous one first
      if (!auth.isAuthenticated && conversations.length > 0) {
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
            const textComposerSnapshot =
              modelMode === 'text' ? { temperature, topP, maxTokens } : undefined
            const imageComposerSnapshot =
              modelMode === 'image' ? { aspectRatio, imageSize } : undefined
            helpers.saveConversationToLocalStorage(
              inputData,
              previousModels,
              conversationsWithMessages,
              false,
              undefined,
              'comparison',
              undefined,
              undefined,
              textComposerSnapshot,
              imageComposerSnapshot
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
      expandFiles: helpers.expandFiles,
      getSuccessfulModels,
      isModelFailed,
    })

    stateCb.setIsLoading(true)
    stateCb.setError(null)
    if (
      creditWarningType === 'insufficient' ||
      creditWarningType === 'low' ||
      creditWarningType === 'overage_active'
    ) {
      if (creditWarningType === 'overage_active') {
        creditCb.dismissOverageActive(creditBalance?.credits_reset_at)
      } else {
        creditCb.setCreditWarningMessage(null)
        creditCb.setCreditWarningType('none')
        creditCb.setCreditWarningDismissible(false)
      }
    }
    stateCb.setIsModelsHidden(true)
    stateCb.setShowDoneSelectingCard(false)

    // Capture user timestamp when they actually submit
    const userTimestamp = new Date().toISOString()
    stateCb.setUserMessageTimestamp(userTimestamp)

    stateCb.setResponse(null)
    stateCb.setClosedCards(new Set())
    stateCb.setProcessingTime(null)
    userCancelledRef.current = false
    scrolledToTopRef.current.clear()
    shouldScrollToTopAfterFormattingRef.current = false
    autoScrollPausedRef.current.clear()
    userInteractingRef.current.clear()
    lastScrollTopRef.current.clear()
    lastAlignedRoundRef.current = 0
    stateCb.setIsScrollLocked(false)

    // Clean up any existing scroll listeners from previous comparison
    scrollListenersRef.current.forEach((_listener, modelId) => {
      helpers.cleanupScrollListener(modelId)
    })

    const startTime = Date.now()
    let streamResult: Awaited<ReturnType<typeof processComparisonStream>> | null = null

    try {
      const controller = new AbortController()
      currentAbortControllerRef.current = controller
      stateCb.setCurrentAbortController(controller)

      const conversationId =
        auth.isAuthenticated && currentVisibleComparisonId
          ? typeof currentVisibleComparisonId === 'string'
            ? parseInt(currentVisibleComparisonId, 10)
            : currentVisibleComparisonId
          : null

      // Expand file contents before submission
      let expandedInput = input
      if (attachedFiles.length > 0) {
        try {
          expandedInput = await helpers.expandFiles(attachedFiles, input)
        } catch (error) {
          logger.error('Error expanding files:', error)
          stateCb.setError('Failed to process attached files. Please try again.')
          stateCb.setIsLoading(false)
          return
        }
      }

      lastSubmittedInputRef.current = expandedInput

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const modelsToUse = isFollowUpMode ? getSuccessfulModels(selectedModels) : selectedModels

      // In follow-up mode, we only send models that succeeded previously. If all selected models
      // failed, modelsToUse is empty and the API would return 400. Validate before calling.
      if (isFollowUpMode && modelsToUse.length === 0) {
        stateCb.setError(
          'All selected models failed in the previous attempt. Please select different models or start a new comparison to retry.'
        )
        stateCb.setIsLoading(false)
        stateCb.setIsModelsHidden(false)
        return
      }

      logger.debug('[API Request] user location:', userLocation ? 'sending' : 'none (IP fallback)')

      const attachedImages = helpers.getAttachedImagesForApi(attachedFiles)
      const hasImageModels = modelsToUse.some(m =>
        modelSupportsImageGeneration(m, modelsByProvider)
      )
      const imageConfig =
        hasImageModels && (aspectRatio || imageSize)
          ? { aspect_ratio: aspectRatio, image_size: imageSize }
          : undefined

      const comparePayload = {
        input_data: expandedInput,
        models: modelsToUse,
        conversation_history: apiConversationHistory,
        attached_images: attachedImages.length > 0 ? attachedImages : undefined,
        browser_fingerprint: auth.browserFingerprint,
        conversation_id: conversationId || undefined,
        estimated_input_tokens: accurateInputTokens || undefined,
        timezone: userTimezone,
        location: userLocation || undefined,
        enable_web_search: webSearchEnabled || false,
        temperature,
        top_p: topP !== 1 ? topP : undefined,
        max_tokens: maxTokens ?? undefined,
        image_config: imageConfig,
      }

      let stream: ReadableStream<Uint8Array> | null = null
      try {
        stream = await compareStream(comparePayload, controller.signal)
      } catch (firstErr) {
        // Session cookie may be stale while React still shows the user as logged in.
        // Refresh and retry once for known auth-mismatch errors before surfacing the message.
        const refresh = auth.refreshToken
        const msg =
          firstErr instanceof ApiError && typeof firstErr.message === 'string'
            ? firstErr.message
            : ''

        // Backend returns this text when image models are requested but the session is missing
        // (anonymous). Must match core.py and any legacy wording so we refresh and retry once.
        const isAnonymousImageComparisonGate402 =
          msg.includes('Sign up for a free account') &&
          (msg.includes('use image generation') ||
            (msg.includes('to run') && msg.includes('image comparison')))

        const isAuthRelated402 =
          auth.isAuthenticated &&
          refresh &&
          firstErr instanceof ApiError &&
          firstErr.status === 402 &&
          isAnonymousImageComparisonGate402

        const isAuthRelated403Unregistered =
          auth.isAuthenticated &&
          refresh &&
          firstErr instanceof ApiError &&
          firstErr.status === 403 &&
          msg.includes('not available for unregistered tier')

        if (isAuthRelated402 || isAuthRelated403Unregistered) {
          logger.debug(
            '[API] Compare-stream auth mismatch while authenticated - refreshing session and retrying'
          )
          await refresh()
          stream = await compareStream(comparePayload, controller.signal)
        } else {
          throw firstErr
        }
      }

      if (!stream) {
        throw new Error('Failed to start streaming comparison')
      }

      const reader = stream.getReader()

      stateCb.setModelErrors({})

      // Set all selected models to 'raw' tab to show streaming content immediately
      const rawTabs: ActiveResultTabs = {} as ActiveResultTabs
      selectedModels.forEach(modelId => {
        rawTabs[createModelId(modelId)] = RESULT_TAB.RAW
      })
      stateCb.setActiveResultTabs(rawTabs)

      // Initialize empty conversations immediately so cards appear during streaming
      if (!isFollowUpMode) {
        const emptyConversations: ModelConversation[] = selectedModels.map(modelId => ({
          modelId: createModelId(modelId),
          messages: [
            createStreamingMessage('user', input, userTimestamp),
            createStreamingMessage('assistant', '', userTimestamp),
          ],
        }))
        stateCb.setConversations(emptyConversations)
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
        creditCb.setCreditBalance(merged)
      }

      streamResult = await processComparisonStream(reader, controller, {
        input,
        selectedModels,
        isFollowUpMode,
        isAuthenticated: auth.isAuthenticated,
        user: auth.user,
        creditBalance,
        browserFingerprint: auth.browserFingerprint,
        startTime,
        userTimestamp,
        userCancelledRef,
        shouldScrollToTopAfterFormattingRef,
        autoScrollPausedRef,
        isPageScrollingRef,
        setModelErrors: stateCb.setModelErrors,
        setActiveResultTabs: stateCb.setActiveResultTabs,
        setConversations: stateCb.setConversations,
        setResponse: stateCb.setResponse,
        setProcessingTime: stateCb.setProcessingTime,
        setCreditBalance: adaptedSetCreditBalance,
        setAnonymousCreditsRemaining: creditCb.setAnonymousCreditsRemaining,
        setupScrollListener: helpers.setupScrollListener,
        getCreditAllocation,
        getDailyCreditLimit,
        getCreditBalance,
        refreshUser: helpers.refreshUser,
        getCreditWarningMessage: helpers.getCreditWarningMessage,
        isLowCreditWarningDismissed: helpers.isLowCreditWarningDismissed,
        isOverageActiveDismissed: helpers.isOverageActiveDismissed,
        setCreditWarningMessage: creditCb.setCreditWarningMessage,
        setCreditWarningType: creditCb.setCreditWarningType,
        setCreditWarningDismissible: creditCb.setCreditWarningDismissible,
        setIsFollowUpMode: stateCb.setIsFollowUpMode,
        loadHistoryFromAPI: helpers.loadHistoryFromAPI,
        apiClientDeleteCache: (key: string) => apiClient.deleteCache(key),
        setStreamingReasoningByModel: stateCb.setStreamingReasoningByModel,
        setStreamAnswerStartedByModel: stateCb.setStreamAnswerStartedByModel,
        clearStreamingReasoningUi: stateCb.clearStreamingReasoningUi,
      })

      await applyStreamCompletion(streamResult, startTime, userTimestamp)
    } catch (err) {
      handleStreamError(err, streamResult, startTime)
      stateCb.clearStreamingReasoningUi()
    } finally {
      currentAbortControllerRef.current = null
      stateCb.setCurrentAbortController(null)
      userCancelledRef.current = false
      stateCb.setIsLoading(false)

      getCreditBalance()
        .then(bal => creditCb.setCreditBalance(bal))
        .catch(() => {})
    }
    // config/callbacks contain all values; listing each would be redundant and cause unnecessary re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config,
    callbacks,
    currentAbortControllerRef,
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
