/**
 * useStreamTimeout - Timeout and abort error handling for streaming.
 * Handles AbortError, CancellationError, PaymentRequired, API errors, fetch failures.
 */

import { useCallback } from 'react'

import type { AttachedFile, StoredAttachedFile } from '../components/comparison'
import { ApiError, isCancellationError, PaymentRequiredError } from '../services/api/errors'
import { getCreditBalance } from '../services/creditService'
import type { CreditBalance } from '../services/creditService'
import type { ProcessStreamResult } from '../services/sseProcessor'
import type { ActiveResultTabs, ModelConversation } from '../types'
import { RESULT_TAB, createModelId } from '../types'
import { isErrorMessage } from '../utils/error'
import logger from '../utils/logger'

export interface UseStreamTimeoutConfig {
  selectedModels: string[]
  input: string
  isFollowUpMode: boolean
  isAuthenticated: boolean
  creditWarningType: 'none' | 'low' | 'insufficient'
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  browserFingerprint: string
  userCancelledRef: React.MutableRefObject<boolean>
  lastSubmittedInputRef: React.MutableRefObject<string>
  modelMode: 'text' | 'image'
  temperature: number
  topP: number
  maxTokens: number | null
  aspectRatio: string
  imageSize: string
}

export interface UseStreamTimeoutCallbacks {
  setError: (error: string | null) => void
  setModelErrors: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  setActiveResultTabs: React.Dispatch<React.SetStateAction<ActiveResultTabs>>
  setResponse: (response: import('../types').CompareResponse | null) => void
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>
  setCreditBalance: (balance: CreditBalance | null) => void
  setAnonymousCreditsRemaining: (credits: number | null) => void
  setIsFollowUpMode: (mode: boolean) => void
  extractFileContentForStorage: (
    files: AttachedFile[]
  ) => Promise<Array<{ name: string; content: string; placeholder: string }>>
  saveConversationToLocalStorage: (
    inputData: string,
    models: string[],
    conversations: ModelConversation[],
    isUpdate: boolean,
    fileContents?: Array<{ name: string; content: string; placeholder: string }>,
    conversationType?: 'comparison' | 'breakout',
    parentConversationId?: string | null,
    breakoutModelId?: string | null,
    textComposerAdvanced?: import('../types').TextComposerAdvancedSettings,
    imageComposerAdvanced?: import('../types').ImageComposerAdvancedSettings
  ) => string | null
  syncHistoryAfterComparison: (input: string, models: string[]) => Promise<void>
  getFirstUserMessage: () => import('../types/conversation').ConversationMessage | undefined
  refreshUser: () => Promise<void>
}

export function useStreamTimeout(
  config: UseStreamTimeoutConfig,
  callbacks: UseStreamTimeoutCallbacks
) {
  const {
    selectedModels,
    input,
    isFollowUpMode,
    isAuthenticated,
    creditWarningType,
    attachedFiles,
    browserFingerprint,
    userCancelledRef,
    lastSubmittedInputRef,
    modelMode,
    temperature,
    topP,
    maxTokens,
    aspectRatio,
    imageSize,
  } = config

  const {
    setError,
    setModelErrors,
    setActiveResultTabs,
    setResponse,
    setConversations,
    setCurrentVisibleComparisonId,
    setCreditBalance,
    setAnonymousCreditsRemaining,
    setIsFollowUpMode,
    extractFileContentForStorage,
    saveConversationToLocalStorage,
    syncHistoryAfterComparison,
    getFirstUserMessage,
    refreshUser,
  } = callbacks

  const handleStreamError = useCallback(
    (err: unknown, streamResult: ProcessStreamResult | null, startTime: number): void => {
      const textComposerSnapshot =
        modelMode === 'text' ? { temperature, topP, maxTokens } : undefined
      const imageComposerSnapshot = modelMode === 'image' ? { aspectRatio, imageSize } : undefined

      const streamingResults = streamResult?.streamingResults ?? {}
      const streamingImages = streamResult?.streamingImages ?? {}
      const completedModels = streamResult?.completedModels ?? new Set<string>()
      const localModelErrors = streamResult?.localModelErrors ?? {}
      const modelStartTimes = streamResult?.modelStartTimes ?? {}
      const modelCompletionTimes = streamResult?.modelCompletionTimes ?? {}

      const hasContentOrImages = (modelId: string) => {
        const content = (streamingResults[modelId] || '').trim()
        const images = streamingImages[modelId] || []
        return content.length > 0 || images.length > 0
      }

      const savePartialResultsOnError = () => {
        const hasAnyResults =
          Object.keys(streamingResults).some(
            modelId => (streamingResults[modelId] || '').trim().length > 0
          ) ||
          Object.keys(streamingImages).some(modelId => (streamingImages[modelId] || []).length > 0)

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

        const allModelIds = [
          ...new Set([...Object.keys(streamingResults), ...Object.keys(streamingImages)]),
        ]
        setResponse({
          results: { ...streamingResults },
          metadata: {
            input_length: input.length,
            models_requested: selectedModels.length,
            models_successful: allModelIds.filter(
              modelId => !isErrorMessage(streamingResults[modelId]) && hasContentOrImages(modelId)
            ).length,
            models_failed: allModelIds.filter(
              modelId => isErrorMessage(streamingResults[modelId]) || !hasContentOrImages(modelId)
            ).length,
            timestamp: new Date().toISOString(),
            processing_time_ms: Date.now() - startTime,
          },
        })

        if (!isFollowUpMode) {
          setConversations(prevConversations => {
            return prevConversations.map(conv => {
              const rawModelId =
                selectedModels && Array.isArray(selectedModels)
                  ? selectedModels.find(m => createModelId(m) === conv.modelId) || conv.modelId
                  : conv.modelId
              let content =
                (streamingResults &&
                  (streamingResults[rawModelId] || streamingResults[conv.modelId])) ||
                ''
              const images = streamingImages[rawModelId] || streamingImages[conv.modelId] || []
              if (!content.trim() && images.length === 0) content = 'Error: No response received'
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
                      images: images.length > 0 ? images : undefined,
                      timestamp: completionTime || msg.timestamp,
                    }
                  }
                  return msg
                }),
              }
            })
          })
        }

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
                  assistantMessages.some(
                    msg => msg.content.trim().length > 0 || (msg.images?.length ?? 0) > 0
                  )
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
                      fileContentsForSave,
                      'comparison',
                      undefined,
                      undefined,
                      textComposerSnapshot,
                      imageComposerSnapshot
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

      const isAbortOrCancel =
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'CancellationError')

      if (isAbortOrCancel) {
        if (userCancelledRef.current) {
          setError('Model comparison cancelled by user.')
          return
        }

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
            if (!hasError && hasContentOrImages(rawModelId)) {
              formattedTabs[formattedModelId] = RESULT_TAB.FORMATTED
            }
          } catch (error) {
            logger.error('Error formatting model tab:', error)
          }
        })
        setActiveResultTabs(prev => ({ ...prev, ...formattedTabs }))

        if (!isFollowUpMode) {
          setConversations(prevConversations => {
            return prevConversations.map(conv => {
              const rawModelId =
                selectedModels.find(m => createModelId(m) === conv.modelId) || conv.modelId
              let content = streamingResults[rawModelId] || streamingResults[conv.modelId] || ''
              const images = streamingImages[rawModelId] || streamingImages[conv.modelId] || []
              if (!content.trim() && images.length === 0) content = 'Error: No response received'
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
                      images: images.length > 0 ? images : undefined,
                      timestamp: completionTime || msg.timestamp,
                    }
                  }
                  return msg
                }),
              }
            })
          })
        }

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
            const hasContent =
              content.trim().length > 0 ||
              (streamingImages[rawModelId] || streamingImages[formattedModelId] || []).length > 0
            return hasCompleted && !hasError && !isError && hasContent
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
                setCreditBalance(balance as CreditBalance)
              })
              .catch(error => {
                if (isCancellationError(error)) return
                logger.error('Failed to refresh credit balance after timeout:', error)
              })
          } else {
            getCreditBalance(browserFingerprint)
              .then(balance => {
                setAnonymousCreditsRemaining(balance.credits_remaining)
                setCreditBalance(balance as CreditBalance)
              })
              .catch(error => {
                if (isCancellationError(error)) return
                logger.error('Failed to refresh anonymous credit balance after timeout:', error)
              })
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
        setError(
          err.message ||
            'Insufficient credits for this request. Please upgrade your plan or wait for credits to reset.'
        )
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else if (err instanceof ApiError && err.status === 402) {
        if (isFollowUpMode) {
          setIsFollowUpMode(false)
        }
        const errorMessage =
          err.response?.detail || err.message || 'Insufficient credits for this request.'
        setError(errorMessage)
        window.scrollTo({ top: 0, behavior: 'smooth' })
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
    },
    [
      selectedModels,
      input,
      isFollowUpMode,
      isAuthenticated,
      creditWarningType,
      attachedFiles,
      browserFingerprint,
      userCancelledRef,
      lastSubmittedInputRef,
      modelMode,
      temperature,
      topP,
      maxTokens,
      aspectRatio,
      imageSize,
      setError,
      setModelErrors,
      setActiveResultTabs,
      setResponse,
      setConversations,
      setCurrentVisibleComparisonId,
      setCreditBalance,
      setAnonymousCreditsRemaining,
      setIsFollowUpMode,
      extractFileContentForStorage,
      saveConversationToLocalStorage,
      syncHistoryAfterComparison,
      getFirstUserMessage,
      refreshUser,
    ]
  )

  return { handleStreamError }
}
