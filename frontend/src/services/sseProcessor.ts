/**
 * SSE stream processing for comparison requests
 *
 * Handles reading, parsing, timeout, and event dispatch for the
 * comparison streaming API.
 */

import { createModelId, createMessageId, RESULT_TAB } from '../types'
import type {
  CompareResponse,
  ConversationMessage,
  ModelConversation,
  ActiveResultTabs,
} from '../types'
import { isErrorMessage } from '../utils/error'

const TIMEOUT_DURATION = 60000
const ACTIVE_STREAMING_WINDOW = 5000
const UPDATE_THROTTLE_MS = 50

const EMPTY_RESPONSE_ERROR = 'Error: No response received'

export function estimateTokensSimple(text: string): number {
  if (!text || !text.trim()) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export function createStreamingMessage(
  type: 'user' | 'assistant',
  content: string,
  customTimestamp?: string
): ConversationMessage {
  return {
    id: createMessageId(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
    type,
    content,
    timestamp: customTimestamp || new Date().toISOString(),
  }
}

export interface SSEProcessorConfig {
  input: string
  selectedModels: string[]
  isFollowUpMode: boolean
  isAuthenticated: boolean
  user: {
    monthly_credits_allocated?: number
    subscription_tier?: string
    billing_period_start?: string
    billing_period_end?: string
    credits_reset_at?: string
    total_credits_used?: number
  } | null
  creditBalance: {
    credits_allocated?: number
    credits_remaining?: number
    credits_reset_at?: string
  } | null
  browserFingerprint: string
  startTime: number
  userTimestamp: string
  userCancelledRef: React.MutableRefObject<boolean>
  hasScrolledToResultsOnFirstChunkRef: React.MutableRefObject<boolean>
  shouldScrollToTopAfterFormattingRef: React.MutableRefObject<boolean>
  autoScrollPausedRef: React.MutableRefObject<Set<string>>
  isPageScrollingRef: React.MutableRefObject<boolean>
  tutorialState: { isActive: boolean; currentStep: string | null }
  setModelErrors: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  setActiveResultTabs: React.Dispatch<React.SetStateAction<ActiveResultTabs>>
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setResponse: (response: CompareResponse | null) => void
  setProcessingTime: (time: number | null) => void
  setCreditBalance: (
    balance:
      | {
          credits_allocated?: number
          credits_used_this_period?: number
          credits_remaining?: number
          period_type?: string
          subscription_tier?: string
          credits_reset_at?: string
          billing_period_start?: string
          billing_period_end?: string
          total_credits_used?: number
        }
      | {
          credits_allocated?: number
          credits_used_today?: number
          credits_remaining?: number
          period_type?: string
          subscription_tier?: string
        }
  ) => void
  setAnonymousCreditsRemaining: (credits: number | null) => void
  setupScrollListener: (modelId: string) => boolean
  getCreditAllocation: (tier: string) => number
  getDailyCreditLimit: (tier: string) => number
  getCreditBalance: (
    fingerprint?: string
  ) => Promise<{ credits_allocated: number; credits_remaining: number; credits_reset_at?: string }>
  refreshUser: () => Promise<void>
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
  setCreditWarningMessage: (message: string | null) => void
  setCreditWarningType: (type: 'none' | 'low' | 'insufficient') => void
  setCreditWarningDismissible: (dismissible: boolean) => void
  setIsFollowUpMode: (mode: boolean) => void
  loadHistoryFromAPI: () => Promise<void>
  apiClientDeleteCache: (key: string) => void
}

export interface ProcessStreamResult {
  streamingResults: { [key: string]: string }
  completedModels: Set<string>
  localModelErrors: { [key: string]: boolean }
  modelStartTimes: { [key: string]: string }
  modelCompletionTimes: { [key: string]: string }
  streamingMetadata: CompareResponse['metadata'] | null
  streamError: Error | null
}

export async function processComparisonStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
  config: SSEProcessorConfig
): Promise<ProcessStreamResult> {
  const decoder = new TextDecoder()
  const streamingResults: { [key: string]: string } = {}
  const completedModels = new Set<string>()
  const localModelErrors: { [key: string]: boolean } = {}
  const modelStartTimes: { [key: string]: string } = {}
  const modelCompletionTimes: { [key: string]: string } = {}
  const modelLastChunkTimes: { [key: string]: number } = {}
  let streamingMetadata: CompareResponse['metadata'] | null = null
  let streamError: Error | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastUpdateTime = Date.now()
  const listenersSetUp = new Set<string>()

  const {
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
    setCreditBalance,
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
    apiClientDeleteCache,
  } = config

  const resetStreamingTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (!selectedModels?.length) return

    const now = Date.now()
    const hasActiveStreaming = selectedModels.some(modelId => {
      if (!modelId || completedModels.has(modelId)) return false
      const lastChunkTime =
        modelLastChunkTimes[modelId] || modelLastChunkTimes[createModelId(modelId)]
      return lastChunkTime !== undefined && now - lastChunkTime < ACTIVE_STREAMING_WINDOW
    })

    if (completedModels.size === selectedModels.length || hasActiveStreaming) return

    timeoutId = setTimeout(() => {
      try {
        if (!selectedModels?.length) return
        const checkNow = Date.now()
        const stillHasActiveStreaming = selectedModels.some(modelId => {
          if (!modelId || completedModels.has(modelId)) return false
          const lastChunkTime =
            modelLastChunkTimes[modelId] || modelLastChunkTimes[createModelId(modelId)]
          return lastChunkTime !== undefined && checkNow - lastChunkTime < ACTIVE_STREAMING_WINDOW
        })
        if (completedModels.size === selectedModels.length) return
        if (stillHasActiveStreaming) resetStreamingTimeout()
        else controller.abort()
      } catch {
        controller.abort()
      }
    }, TIMEOUT_DURATION)
  }

  resetStreamingTimeout()

  const applyThrottledUpdate = (shouldUpdate: boolean) => {
    const now = Date.now()
    if (shouldUpdate && now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
      lastUpdateTime = now
      setResponse({
        results: { ...streamingResults },
        metadata: {
          input_length: input.length,
          models_requested: selectedModels.length,
          models_successful: 0,
          models_failed: 0,
          timestamp: new Date().toISOString(),
          processing_time_ms: Date.now() - startTime,
        },
      })

      if (!isFollowUpMode) {
        setConversations(prev =>
          prev.map(conv => {
            let content = streamingResults[conv.modelId] || ''
            // Only show "No response received" when the model has completed but has no content.
            // During streaming, models that haven't received content yet should not show this error.
            if (!content.trim() && completedModels.has(conv.modelId)) {
              content = EMPTY_RESPONSE_ERROR
            }
            const startT = modelStartTimes[conv.modelId]
            const completionTime = modelCompletionTimes[conv.modelId]
            return {
              ...conv,
              messages: conv.messages.map((msg, idx) => {
                if (idx === 0 && msg.type === 'user') {
                  return { ...msg, timestamp: startT || msg.timestamp }
                }
                if (idx === 1 && msg.type === 'assistant') {
                  return { ...msg, content, timestamp: completionTime || msg.timestamp }
                }
                return msg
              }),
            }
          })
        )
      } else {
        setConversations(prev =>
          prev.map(conv => {
            const content = streamingResults[conv.modelId]
            // Don't add follow-up to failed models: no content, error response, or empty/blank response
            if (content === undefined || isErrorMessage(content) || !(content || '').trim())
              return conv
            const hasNewUserMessage = conv.messages.some(
              (msg, idx) =>
                msg.type === 'user' && msg.content === input && idx >= conv.messages.length - 2
            )
            if (!hasNewUserMessage) {
              const startT = modelStartTimes[conv.modelId]
              const completionTime = modelCompletionTimes[conv.modelId]
              return {
                ...conv,
                messages: [
                  ...conv.messages,
                  createStreamingMessage('user', input, startT || userTimestamp),
                  createStreamingMessage(
                    'assistant',
                    content,
                    completionTime || new Date().toISOString()
                  ),
                ],
              }
            }
            const completionTime = modelCompletionTimes[conv.modelId]
            return {
              ...conv,
              messages: conv.messages.map((msg, idx) =>
                idx === conv.messages.length - 1 && msg.type === 'assistant'
                  ? { ...msg, content, timestamp: completionTime || msg.timestamp }
                  : msg
              ),
            }
          })
        )
      }

      requestAnimationFrame(() => {
        if (isPageScrollingRef.current) return
        Object.keys(streamingResults).forEach(modelId => {
          if (completedModels.has(modelId) || autoScrollPausedRef.current.has(modelId)) return
          const safeId = modelId.replace(/[^a-zA-Z0-9_-]/g, '-')
          const el = document.querySelector(`#conversation-content-${safeId}`) as HTMLElement
          if (el) el.scrollTop = el.scrollHeight
        })
      })
    }
  }

  let buffer = ''

  try {
    while (true) {
      if (controller.signal.aborted || userCancelledRef.current) {
        reader.cancel()
        break
      }

      const { done, value } = await reader.read()
      if (done) break
      if (streamError) break
      if (controller.signal.aborted || userCancelledRef.current) {
        reader.cancel()
        break
      }

      buffer += decoder.decode(value, { stream: true })
      resetStreamingTimeout()

      const messages = buffer.split('\n\n')
      buffer = messages.pop() || ''

      let shouldUpdate = false

      for (const message of messages) {
        if (controller.signal.aborted || userCancelledRef.current) {
          reader.cancel()
          break
        }
        if (!message.trim() || !message.startsWith('data: ')) continue

        try {
          const jsonStr = message.replace(/^data: /, '')
          const event = JSON.parse(jsonStr)

          if (event.type === 'start') {
            if (!streamingResults[event.model]) streamingResults[event.model] = ''
            modelStartTimes[event.model] = new Date().toISOString()
            modelLastChunkTimes[event.model] = Date.now()
            resetStreamingTimeout()
            shouldUpdate = true
          } else if (event.type === 'chunk') {
            streamingResults[event.model] = (streamingResults[event.model] || '') + event.content
            modelLastChunkTimes[event.model] = Date.now()
            resetStreamingTimeout()
            shouldUpdate = true

            if (
              !hasScrolledToResultsOnFirstChunkRef.current &&
              !(
                tutorialState.isActive &&
                (tutorialState.currentStep === 'submit-comparison' ||
                  tutorialState.currentStep === 'submit-comparison-2')
              )
            ) {
              hasScrolledToResultsOnFirstChunkRef.current = true
              requestAnimationFrame(() => {
                setTimeout(() => {
                  document.querySelector('.results-section')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                }, 100)
              })
            }

            if (!listenersSetUp.has(event.model)) {
              listenersSetUp.add(event.model)
              const trySetup = (attempt: number, maxAttempts: number) => {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    const success = setupScrollListener(event.model)
                    if (!success && attempt < maxAttempts) trySetup(attempt + 1, maxAttempts)
                  }, attempt * 50)
                })
              }
              trySetup(1, 4)
            }
          } else if (event.type === 'keepalive') {
            if (event.model) {
              modelLastChunkTimes[event.model] = Date.now()
              resetStreamingTimeout()
            }
          } else if (event.type === 'done') {
            completedModels.add(event.model)
            modelCompletionTimes[event.model] = new Date().toISOString()
            const hasError = event.error === true
            localModelErrors[event.model] = hasError
            setModelErrors(prev => ({ ...prev, [event.model]: hasError }))
            shouldUpdate = true
            resetStreamingTimeout()
            autoScrollPausedRef.current.delete(event.model)

            const modelContent = streamingResults[event.model] || ''
            const isModelError = hasError || isErrorMessage(modelContent)
            if (!isModelError) {
              setActiveResultTabs(prev => ({ ...prev, [event.model]: RESULT_TAB.FORMATTED }))
            }

            if (completedModels.size === selectedModels.length) {
              selectedModels.forEach(modelId => {
                setActiveResultTabs(prev => ({
                  ...prev,
                  [createModelId(modelId)]: RESULT_TAB.FORMATTED,
                }))
              })
              if (!isFollowUpMode) shouldScrollToTopAfterFormattingRef.current = true

              const hasSuccessfulModels = selectedModels.some(modelId => {
                const cid = createModelId(modelId)
                return (
                  completedModels.has(cid) &&
                  localModelErrors[cid] !== true &&
                  !isErrorMessage(streamingResults[cid] || '') &&
                  (streamingResults[cid] || '').trim().length > 0
                )
              })

              if (hasSuccessfulModels) {
                setTimeout(() => {
                  if (isAuthenticated) {
                    refreshUser()
                      .then(() => getCreditBalance())
                      .then(balance => setCreditBalance(balance))
                      .catch(() => {})
                  } else if (
                    streamingMetadata?.credits_remaining === undefined ||
                    streamingMetadata?.credits_remaining === null
                  ) {
                    getCreditBalance(browserFingerprint)
                      .then(balance => {
                        setAnonymousCreditsRemaining(balance.credits_remaining)
                        setCreditBalance(balance)
                      })
                      .catch(() => {})
                  }
                }, 500)
              }
            }
          } else if (event.type === 'complete') {
            streamingMetadata = event.metadata
            setProcessingTime(Date.now() - startTime)
            shouldUpdate = true

            if (
              streamingMetadata?.credits_remaining !== undefined ||
              streamingMetadata?.credits_used !== undefined
            ) {
              if (isAuthenticated) {
                if (streamingMetadata.credits_remaining !== undefined) {
                  if (creditBalance) {
                    setCreditBalance({
                      ...creditBalance,
                      credits_remaining: streamingMetadata.credits_remaining,
                      credits_used_this_period:
                        (creditBalance.credits_allocated ?? 0) -
                        streamingMetadata.credits_remaining,
                    })
                  } else if (user) {
                    const allocated =
                      user.monthly_credits_allocated ||
                      getCreditAllocation(user.subscription_tier || 'free')
                    setCreditBalance({
                      credits_allocated: allocated,
                      credits_used_this_period: allocated - streamingMetadata.credits_remaining,
                      credits_remaining: streamingMetadata.credits_remaining,
                      period_type: user.billing_period_start ? 'monthly' : 'daily',
                      subscription_tier: user.subscription_tier || 'free',
                      credits_reset_at: user.credits_reset_at,
                      billing_period_start: user.billing_period_start,
                      billing_period_end: user.billing_period_end,
                      total_credits_used: user.total_credits_used,
                    })
                  }
                }
                refreshUser()
                  .then(() => getCreditBalance())
                  .then(balance => {
                    setCreditBalance(balance)
                    const userTier = user?.subscription_tier || 'free'
                    const remainingPercent =
                      balance.credits_allocated > 0
                        ? (balance.credits_remaining / balance.credits_allocated) * 100
                        : 100
                    const periodType =
                      userTier === 'unregistered' || userTier === 'free' ? 'daily' : 'monthly'
                    const lowCreditThreshold =
                      userTier === 'unregistered' || userTier === 'free' ? 20 : 10

                    if (balance.credits_remaining <= 0) {
                      if (isFollowUpMode) setIsFollowUpMode(false)
                    } else if (remainingPercent <= lowCreditThreshold && remainingPercent > 0) {
                      if (
                        !isLowCreditWarningDismissed(userTier, periodType, balance.credits_reset_at)
                      ) {
                        setCreditWarningMessage(
                          getCreditWarningMessage(
                            'low',
                            userTier,
                            balance.credits_remaining,
                            undefined,
                            balance.credits_reset_at
                          )
                        )
                        setCreditWarningType('low')
                        setCreditWarningDismissible(true)
                      } else {
                        setCreditWarningMessage(null)
                        setCreditWarningType('none')
                        setCreditWarningDismissible(false)
                      }
                    } else {
                      setCreditWarningMessage(null)
                      setCreditWarningType('none')
                      setCreditWarningDismissible(false)
                    }
                  })
                  .catch(() => {})
              } else {
                if (streamingMetadata.credits_remaining !== undefined) {
                  const metadataCreditsRemaining = streamingMetadata.credits_remaining
                  setAnonymousCreditsRemaining(metadataCreditsRemaining)
                  const allocated =
                    creditBalance?.credits_allocated ?? getDailyCreditLimit('unregistered')
                  setCreditBalance({
                    credits_allocated: allocated,
                    credits_used_today: allocated - metadataCreditsRemaining,
                    credits_remaining: metadataCreditsRemaining,
                    period_type: 'daily',
                    subscription_tier: 'unregistered',
                  })
                  const remainingPercent =
                    allocated > 0 ? (metadataCreditsRemaining / allocated) * 100 : 100
                  if (metadataCreditsRemaining <= 0 && isFollowUpMode) setIsFollowUpMode(false)
                  else if (remainingPercent <= 20 && remainingPercent > 0) {
                    if (!isLowCreditWarningDismissed('unregistered', 'daily')) {
                      setCreditWarningMessage(
                        getCreditWarningMessage('low', 'unregistered', metadataCreditsRemaining)
                      )
                      setCreditWarningType('low')
                      setCreditWarningDismissible(true)
                    } else {
                      setCreditWarningMessage(null)
                      setCreditWarningType('none')
                      setCreditWarningDismissible(false)
                    }
                  } else {
                    setCreditWarningMessage(null)
                    setCreditWarningType('none')
                    setCreditWarningDismissible(false)
                  }
                  getCreditBalance(browserFingerprint)
                    .then(balance => {
                      if (Math.abs(balance.credits_remaining - metadataCreditsRemaining) <= 1) {
                        setCreditBalance({
                          ...balance,
                          credits_remaining: metadataCreditsRemaining,
                        })
                      }
                    })
                    .catch(() => {})
                } else {
                  getCreditBalance(browserFingerprint)
                    .then(balance => {
                      setAnonymousCreditsRemaining(balance.credits_remaining)
                      setCreditBalance(balance)
                      const remainingPercent =
                        balance.credits_allocated > 0
                          ? (balance.credits_remaining / balance.credits_allocated) * 100
                          : 100
                      if (balance.credits_remaining <= 0 && isFollowUpMode) setIsFollowUpMode(false)
                      else if (remainingPercent <= 20 && remainingPercent > 0) {
                        if (!isLowCreditWarningDismissed('unregistered', 'daily')) {
                          setCreditWarningMessage(
                            getCreditWarningMessage(
                              'low',
                              'unregistered',
                              balance.credits_remaining
                            )
                          )
                          setCreditWarningType('low')
                          setCreditWarningDismissible(true)
                        } else {
                          setCreditWarningMessage(null)
                          setCreditWarningType('none')
                          setCreditWarningDismissible(false)
                        }
                      } else {
                        setCreditWarningMessage(null)
                        setCreditWarningType('none')
                        setCreditWarningDismissible(false)
                      }
                    })
                    .catch(() => {})
                }
              }
            }

            if (isAuthenticated && !isFollowUpMode) {
              setTimeout(() => {
                apiClientDeleteCache('GET:/conversations')
                loadHistoryFromAPI()
              }, 1000)
            }
          } else if (event.type === 'error') {
            streamError = new Error(event.message || 'Streaming error occurred')
            selectedModels.forEach(modelId => {
              const cid = createModelId(modelId)
              if (!completedModels.has(cid)) {
                localModelErrors[cid] = true
                setModelErrors(prev => ({ ...prev, [cid]: true }))
              }
            })
            break
          }
        } catch {
          // Skip parse errors
        }
      }

      applyThrottledUpdate(shouldUpdate)
    }
  } finally {
    reader.releaseLock()
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return {
    streamingResults,
    completedModels,
    localModelErrors,
    modelStartTimes,
    modelCompletionTimes,
    streamingMetadata,
    streamError,
  }
}
