/**
 * useStreamCompletion - Post-stream result application for comparisons.
 * Applies model errors, tabs, response, conversations, history save, usage tracking.
 */

import { useCallback } from 'react'

import type { AttachedFile, StoredAttachedFile } from '../components/comparison'
import { apiClient } from '../services/api/client'
import { getRateLimitStatus } from '../services/compareService'
import { createStreamingMessage, estimateTokensSimple } from '../services/sseProcessor'
import type { ProcessStreamResult } from '../services/sseProcessor'
import type { ActiveResultTabs, ModelConversation } from '../types'
import { RESULT_TAB, createModelId } from '../types'
import { isErrorMessage } from '../utils/error'
import logger from '../utils/logger'

export interface UseStreamCompletionConfig {
  selectedModels: string[]
  input: string
  isFollowUpMode: boolean
  isAuthenticated: boolean
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  browserFingerprint: string
  lastSubmittedInputRef: React.MutableRefObject<string>
}

export interface UseStreamCompletionCallbacks {
  setError: (error: string | null) => void
  setModelErrors: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  setActiveResultTabs: React.Dispatch<React.SetStateAction<ActiveResultTabs>>
  setResponse: (response: import('../types').CompareResponse | null) => void
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setInput: (input: string) => void
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>
  setUsageCount: React.Dispatch<React.SetStateAction<number>>
  extractFileContentForStorage: (
    files: AttachedFile[]
  ) => Promise<Array<{ name: string; content: string; placeholder: string }>>
  saveConversationToLocalStorage: (
    inputData: string,
    models: string[],
    conversations: ModelConversation[],
    isUpdate: boolean,
    fileContents?: Array<{ name: string; content: string; placeholder: string }>
  ) => string | null
  syncHistoryAfterComparison: (input: string, models: string[]) => Promise<void>
  getFirstUserMessage: () => import('../types/conversation').ConversationMessage | undefined
  scrollConversationsToBottom: () => void
  refreshUser: () => Promise<void>
}

export function useStreamCompletion(
  config: UseStreamCompletionConfig,
  callbacks: UseStreamCompletionCallbacks
) {
  const {
    selectedModels,
    input,
    isFollowUpMode,
    isAuthenticated,
    attachedFiles,
    browserFingerprint,
    lastSubmittedInputRef,
  } = config

  const {
    setError,
    setModelErrors,
    setActiveResultTabs,
    setResponse,
    setConversations,
    setInput,
    setCurrentVisibleComparisonId,
    setUsageCount,
    extractFileContentForStorage,
    saveConversationToLocalStorage,
    syncHistoryAfterComparison,
    getFirstUserMessage,
    scrollConversationsToBottom,
    refreshUser,
  } = callbacks

  const applyStreamCompletion = useCallback(
    async (
      streamResult: ProcessStreamResult,
      startTime: number,
      userTimestamp: string
    ): Promise<void> => {
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

      if (filteredData.metadata.models_successful > 0) {
        setInput('')
      }

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

      if (isFollowUpMode) {
        setTimeout(() => {
          scrollConversationsToBottom()
        }, 600)
      } else {
        setTimeout(() => {
          scrollConversationsToBottom()
        }, 500)
      }
    },
    [
      selectedModels,
      input,
      isFollowUpMode,
      isAuthenticated,
      attachedFiles,
      browserFingerprint,
      lastSubmittedInputRef,
      setError,
      setModelErrors,
      setActiveResultTabs,
      setResponse,
      setConversations,
      setInput,
      setCurrentVisibleComparisonId,
      setUsageCount,
      extractFileContentForStorage,
      saveConversationToLocalStorage,
      syncHistoryAfterComparison,
      getFirstUserMessage,
      scrollConversationsToBottom,
      refreshUser,
    ]
  )

  return { applyStreamCompletion }
}
