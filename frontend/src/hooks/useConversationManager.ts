import { useCallback, useEffect } from 'react'

import { apiClient } from '../services/api/client'
import { getConversation } from '../services/conversationService'
import type {
  CompareResponse,
  ConversationMessage,
  ConversationRound,
  ConversationSummary,
} from '../types'
import { createConversationId, createMessageId, createModelId } from '../types'
import type { ModelConversation, StoredMessage } from '../types/conversation'
import { isErrorMessage } from '../utils/error'

interface UseConversationManagerOptions {
  isAuthenticated: boolean
  showHistoryDropdown: boolean
  loadHistoryFromAPI: () => void
  loadHistoryFromLocalStorage: () => ConversationSummary[]
  setConversationHistory: (history: ConversationSummary[]) => void
  setIsLoadingHistory: (isLoading: boolean) => void
  setAlreadyBrokenOutModels: (models: Set<string>) => void
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setSelectedModels: (models: string[]) => void
  setOriginalSelectedModels: (models: string[]) => void
  setInput: (value: string) => void
  setIsFollowUpMode: (value: boolean) => void
  setClosedCards: (cards: Set<string>) => void
  setResponse: (response: CompareResponse | null) => void
  error: string | null
  setError: (value: string | null) => void
  setShowHistoryDropdown: (value: boolean) => void
  setIsModelsHidden: (value: boolean) => void
  collapseAllDropdowns: () => void
  justLoadedFromHistoryRef: React.MutableRefObject<boolean>
  setCurrentVisibleComparisonId: (value: string | null) => void
  setModelErrors: (errors: { [key: string]: boolean }) => void
}

export function useConversationManager(options: UseConversationManagerOptions) {
  const {
    isAuthenticated,
    showHistoryDropdown,
    loadHistoryFromAPI,
    loadHistoryFromLocalStorage,
    setConversationHistory,
    setIsLoadingHistory,
    setAlreadyBrokenOutModels,
    setConversations,
    setSelectedModels,
    setOriginalSelectedModels,
    setInput,
    setIsFollowUpMode,
    setClosedCards,
    setResponse,
    error,
    setError,
    setShowHistoryDropdown,
    setIsModelsHidden,
    collapseAllDropdowns,
    justLoadedFromHistoryRef,
    setCurrentVisibleComparisonId,
    setModelErrors,
  } = options

  const loadConversationFromLocalStorage = useCallback(
    (
      id: string
    ): {
      input_data: string
      models_used: string[]
      messages: StoredMessage[]
      file_contents?: Array<{ name: string; content: string; placeholder: string }>
      conversation_type?: 'comparison' | 'breakout'
      parent_conversation_id?: string | null
      breakout_model_id?: string | null
      already_broken_out_models?: string[]
    } | null => {
      try {
        const stored = localStorage.getItem(`compareintel_conversation_${id}`)
        if (stored) {
          const parsed = JSON.parse(stored)

          // Calculate already_broken_out_models for unregistered users
          // Only check if this is a comparison (not a breakout itself)
          const already_broken_out_models: string[] = []
          if (parsed.conversation_type !== 'breakout') {
            // Load all conversations from history to find breakouts
            const historyJson = localStorage.getItem('compareintel_conversation_history')
            if (historyJson) {
              const history = JSON.parse(historyJson) as ConversationSummary[]
              // Compare parent_conversation_id (number) with conversation id (string timestamp)
              const conversationIdNum = parseInt(id, 10)
              const existingBreakouts = history.filter(
                conv =>
                  conv.parent_conversation_id === conversationIdNum &&
                  conv.conversation_type === 'breakout' &&
                  conv.breakout_model_id
              )
              already_broken_out_models.push(
                ...existingBreakouts.map(conv => String(conv.breakout_model_id)).filter(Boolean)
              )
            }
          }

          return {
            ...parsed,
            already_broken_out_models,
          }
        } else {
          console.warn('No conversation found in localStorage for id:', id)
        }
      } catch (e) {
        console.error('Failed to load conversation from localStorage:', e, { id })
      }
      return null
    },
    []
  )

  const loadConversationFromAPI = useCallback(
    async (
      id: number
    ): Promise<{ input_data: string; models_used: string[]; messages: StoredMessage[] } | null> => {
      if (!isAuthenticated) return null

      try {
        const conversationId = createConversationId(id)
        // Clear cache for this specific conversation to ensure we get the latest data
        apiClient.deleteCache(`GET:/conversations/${id}`)
        const data = await getConversation(conversationId)
        return {
          input_data: data.input_data,
          models_used: data.models_used,
          messages: data.messages.map(msg => {
            const storedMessage: StoredMessage = {
              role: msg.role,
              content: msg.content,
              created_at: msg.created_at,
            }
            if (msg.model_id !== null && msg.model_id !== undefined) {
              storedMessage.model_id = createModelId(msg.model_id)
            }
            if (msg.id !== undefined && msg.id !== null) {
              storedMessage.id = createMessageId(String(msg.id))
            }
            // Preserve token fields from API response
            if (msg.input_tokens !== undefined && msg.input_tokens !== null) {
              storedMessage.input_tokens = msg.input_tokens
            }
            if (msg.output_tokens !== undefined && msg.output_tokens !== null) {
              storedMessage.output_tokens = msg.output_tokens
            }
            // Preserve success field from API response
            if (msg.success !== undefined) {
              storedMessage.success = msg.success
            }
            return storedMessage
          }),
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error('Failed to load conversation:', error.message)
        } else {
          console.error('Failed to load conversation from API:', error)
        }
      }
      return null
    },
    [isAuthenticated]
  )

  const loadConversation = useCallback(
    async (summary: ConversationSummary) => {
      setIsLoadingHistory(true)
      try {
        let conversationData: {
          input_data: string
          models_used: string[]
          messages: StoredMessage[]
          file_contents?: Array<{ name: string; content: string; placeholder: string }>
          already_broken_out_models?: string[]
        } | null = null

        if (isAuthenticated && typeof summary.id === 'number') {
          conversationData = await loadConversationFromAPI(summary.id)
        } else if (!isAuthenticated && typeof summary.id === 'string') {
          conversationData = loadConversationFromLocalStorage(summary.id)
        }

        if (!conversationData) {
          console.error('Failed to load conversation data', { summary, isAuthenticated })
          return
        }

        const modelsUsed = conversationData.models_used

        if (conversationData.already_broken_out_models) {
          setAlreadyBrokenOutModels(new Set(conversationData.already_broken_out_models))
        } else {
          setAlreadyBrokenOutModels(new Set())
        }

        const messagesByModel: { [key: string]: ConversationMessage[] } = {}
        modelsUsed.forEach((modelId: string) => {
          messagesByModel[modelId] = []
        })

        const sortedMessages = [...conversationData.messages].sort(
          (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        )

        const rounds: ConversationRound[] = []
        let currentRound: ConversationRound | null = null

        sortedMessages.forEach((msg: StoredMessage) => {
          if (msg.role === 'user') {
            if (currentRound && currentRound.user) {
              rounds.push(currentRound)
            }
            currentRound = { user: msg, assistants: [] }
          } else if (msg.role === 'assistant' && msg.model_id) {
            if (currentRound) {
              const isDuplicate = currentRound.assistants.some(
                asm =>
                  asm.model_id &&
                  msg.model_id &&
                  String(asm.model_id) === String(msg.model_id) &&
                  asm.content === msg.content &&
                  Math.abs(
                    new Date(asm.created_at).getTime() - new Date(msg.created_at).getTime()
                  ) < 1000
              )

              if (!isDuplicate) {
                currentRound.assistants.push(msg)
              }
            } else {
              console.warn('Assistant message without preceding user message:', msg)
            }
          }
        })

        if (currentRound) {
          rounds.push(currentRound)
        }

        // Only add a round (user + assistant) to a model's conversation if that model responded.
        // Failed models should not have the follow-up prompt in their conversation.
        rounds.forEach(round => {
          modelsUsed.forEach((modelId: string) => {
            const modelAssistant = round.assistants.find(asm => {
              if (!asm.model_id) return false
              return String(asm.model_id) === String(modelId)
            })
            if (!modelAssistant) return // Don't add follow-up to failed models

            messagesByModel[modelId].push({
              id: round.user.id
                ? typeof round.user.id === 'string'
                  ? createMessageId(round.user.id)
                  : createMessageId(String(round.user.id))
                : createMessageId(`${Date.now()}-user-${Math.random()}`),
              type: 'user' as const,
              content: round.user.content,
              timestamp: round.user.created_at || new Date().toISOString(),
              input_tokens: round.user.input_tokens,
            })
            messagesByModel[modelId].push({
              id: modelAssistant.id
                ? typeof modelAssistant.id === 'string'
                  ? createMessageId(modelAssistant.id)
                  : createMessageId(String(modelAssistant.id))
                : createMessageId(`${Date.now()}-${Math.random()}`),
              type: 'assistant' as const,
              content: modelAssistant.content,
              timestamp: modelAssistant.created_at || new Date().toISOString(),
              output_tokens: modelAssistant.output_tokens,
            })
          })
        })

        const loadedConversations: ModelConversation[] = modelsUsed.map((modelId: string) => ({
          modelId: createModelId(modelId),
          messages: messagesByModel[modelId] || [],
        }))

        const loadedModelErrors: { [key: string]: boolean } = {}
        modelsUsed.forEach((modelId: string) => {
          const createdModelId = createModelId(modelId)
          const conv = loadedConversations.find(c => c.modelId === createdModelId)

          if (!conv) {
            loadedModelErrors[createdModelId] = true
            return
          }

          const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
          if (assistantMessages.length === 0) {
            loadedModelErrors[createdModelId] = true
            return
          }

          const latestMessage = assistantMessages[assistantMessages.length - 1]
          if (latestMessage) {
            if (isErrorMessage(latestMessage.content)) {
              loadedModelErrors[createdModelId] = true
              return
            }

            const modelStoredMessages =
              conversationData?.messages?.filter(
                msg =>
                  msg.role === 'assistant' &&
                  msg.model_id &&
                  String(msg.model_id) === String(modelId)
              ) || []
            if (modelStoredMessages.length > 0) {
              const latestStoredMessage = modelStoredMessages[modelStoredMessages.length - 1]
              if (latestStoredMessage.success === false) {
                loadedModelErrors[createdModelId] = true
              }
            }
          }
        })
        setModelErrors(loadedModelErrors)

        setConversations(loadedConversations)
        setSelectedModels([...modelsUsed])
        setOriginalSelectedModels([...modelsUsed])
        setInput('')
        setIsFollowUpMode(loadedConversations.some(conv => conv.messages.length > 0))
        setClosedCards(new Set())
        setResponse(null)
        if (
          error &&
          error.includes('Your input is too long for one or more of the selected models')
        ) {
          setError(null)
        }
        setShowHistoryDropdown(false)
        setIsModelsHidden(true)
        collapseAllDropdowns()

        justLoadedFromHistoryRef.current = true
        setCurrentVisibleComparisonId(String(summary.id))
      } catch (e) {
        console.error('Failed to load conversation:', e)
      } finally {
        setIsLoadingHistory(false)
      }
    },
    [
      collapseAllDropdowns,
      error,
      isAuthenticated,
      justLoadedFromHistoryRef,
      loadConversationFromAPI,
      loadConversationFromLocalStorage,
      setAlreadyBrokenOutModels,
      setClosedCards,
      setConversations,
      setCurrentVisibleComparisonId,
      setError,
      setInput,
      setIsFollowUpMode,
      setIsLoadingHistory,
      setIsModelsHidden,
      setModelErrors,
      setOriginalSelectedModels,
      setResponse,
      setSelectedModels,
      setShowHistoryDropdown,
    ]
  )

  useEffect(() => {
    setCurrentVisibleComparisonId(null)

    if (isAuthenticated) {
      loadHistoryFromAPI()
    } else {
      const history = loadHistoryFromLocalStorage()
      setConversationHistory(history)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, loadHistoryFromAPI, loadHistoryFromLocalStorage])

  useEffect(() => {
    if (showHistoryDropdown) {
      if (isAuthenticated) {
        loadHistoryFromAPI()
      } else {
        const history = loadHistoryFromLocalStorage()
        setConversationHistory(history)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistoryDropdown, isAuthenticated, loadHistoryFromAPI, loadHistoryFromLocalStorage])

  return {
    loadConversation,
    loadConversationFromAPI,
    loadConversationFromLocalStorage,
  }
}
