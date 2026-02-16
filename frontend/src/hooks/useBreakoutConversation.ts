import { useState, useCallback } from 'react'

import { apiClient } from '../services/api/client'
import { createBreakoutConversation } from '../services/conversationService'
import type {
  ConversationMessage,
  ConversationSummary,
  ModelConversation,
  StoredMessage,
} from '../types'
import { createModelId, createMessageId } from '../types'
import { showNotification } from '../utils'
import logger from '../utils/logger'

type BreakoutPhase = 'idle' | 'fading-out' | 'hidden' | 'fading-in'

interface Model {
  id: string
  name: string
}

interface UseBreakoutConversationConfig {
  isAuthenticated: boolean
  currentVisibleComparisonId: string | number | null
  allModels: Model[]
  textareaRef: React.RefObject<HTMLTextAreaElement>
}

interface UseBreakoutConversationCallbacks {
  loadHistoryFromAPI: () => Promise<void>
  loadConversationFromLocalStorage: (id: string | number) => {
    input_data: string
    models_used: string[]
    messages: StoredMessage[]
    file_contents?: Array<{ name: string; content: string; placeholder: string }>
  } | null
  loadHistoryFromLocalStorage: () => ConversationSummary[]
  saveConversationToLocalStorage: (
    inputData: string,
    models: string[],
    conversations: ModelConversation[],
    isUpdate?: boolean,
    fileContents?: Array<{ name: string; content: string; placeholder: string }>,
    conversationType?: 'comparison' | 'breakout',
    parentConversationId?: string | null,
    breakoutModelId?: string | null
  ) => string
  setConversationHistory: (history: ConversationSummary[]) => void
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setSelectedModels: (models: string[]) => void
  setOriginalSelectedModels: (models: string[]) => void
  setClosedCards: (cards: Set<string>) => void
  setIsFollowUpMode: (mode: boolean) => void
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>
  setInput: (input: string) => void
  setError: (error: string | null) => void
  setIsModelsHidden: (hidden: boolean) => void
  setAlreadyBrokenOutModels: React.Dispatch<React.SetStateAction<Set<string>>>
  setTutorialHasBreakout: (hasBreakout: boolean) => void
}

export function useBreakoutConversation(
  config: UseBreakoutConversationConfig,
  callbacks: UseBreakoutConversationCallbacks
) {
  const { isAuthenticated, currentVisibleComparisonId, allModels, textareaRef } = config
  const {
    loadHistoryFromAPI,
    loadConversationFromLocalStorage,
    loadHistoryFromLocalStorage,
    saveConversationToLocalStorage,
    setConversationHistory,
    setConversations,
    setSelectedModels,
    setOriginalSelectedModels,
    setClosedCards,
    setIsFollowUpMode,
    setCurrentVisibleComparisonId,
    setInput,
    setError,
    setIsModelsHidden,
    setAlreadyBrokenOutModels,
    setTutorialHasBreakout,
  } = callbacks

  const [breakoutPhase, setBreakoutPhase] = useState<BreakoutPhase>('idle')

  const handleBreakout = useCallback(
    async (modelId: string) => {
      const conversationId = currentVisibleComparisonId
      if (!conversationId) {
        setError('No active conversation to break out from')
        return
      }

      try {
        setBreakoutPhase('fading-out')
        await new Promise(resolve => setTimeout(resolve, 300))

        setBreakoutPhase('hidden')
        window.scrollTo({ top: 0, behavior: 'instant' })

        let breakoutConversationId: string
        let breakoutMessages: ConversationMessage[]

        if (isAuthenticated) {
          const breakoutConversation = await createBreakoutConversation({
            parent_conversation_id: parseInt(String(conversationId), 10),
            model_id: modelId,
          })

          apiClient.deleteCache('GET:/conversations')
          await loadHistoryFromAPI()

          breakoutConversationId = String(breakoutConversation.id)
          breakoutMessages = breakoutConversation.messages.map(msg => ({
            id: createMessageId(`${breakoutConversation.id}-${msg.id}`),
            type: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: msg.created_at,
            input_tokens: msg.input_tokens,
            output_tokens: msg.output_tokens,
          }))
        } else {
          const parentData = loadConversationFromLocalStorage(conversationId)
          if (!parentData) {
            setError('Failed to load parent conversation')
            setBreakoutPhase('idle')
            return
          }

          const filteredMessages: StoredMessage[] = parentData.messages.filter(
            msg => msg.role === 'user' || (msg.role === 'assistant' && msg.model_id === modelId)
          )

          breakoutConversationId = Date.now().toString()
          breakoutMessages = filteredMessages.map((msg, idx) => ({
            id: createMessageId(`${breakoutConversationId}-${idx}`),
            type: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: msg.created_at || new Date().toISOString(),
            input_tokens: msg.input_tokens,
            output_tokens: msg.output_tokens,
          }))

          const breakoutModelConversationForStorage: ModelConversation = {
            modelId: createModelId(modelId),
            messages: breakoutMessages,
          }

          saveConversationToLocalStorage(
            parentData.input_data,
            [modelId],
            [breakoutModelConversationForStorage],
            false,
            parentData.file_contents,
            'breakout',
            String(conversationId),
            modelId
          )

          const reloadedHistory = loadHistoryFromLocalStorage()
          setConversationHistory(reloadedHistory)
        }

        const breakoutModelConversation: ModelConversation = {
          modelId: createModelId(modelId),
          messages: breakoutMessages,
        }

        setConversations([breakoutModelConversation])
        setSelectedModels([modelId])
        setOriginalSelectedModels([modelId])
        setClosedCards(new Set())
        setIsFollowUpMode(true)
        setCurrentVisibleComparisonId(breakoutConversationId)
        setInput('')
        setError(null)
        setIsModelsHidden(true)
        setAlreadyBrokenOutModels(prev => new Set(prev).add(String(modelId)))

        await new Promise(resolve => setTimeout(resolve, 50))
        setBreakoutPhase('fading-in')

        setTimeout(() => setBreakoutPhase('idle'), 300)
        setTimeout(() => textareaRef.current?.focus(), 350)

        const model = allModels.find(m => m.id === modelId)
        const notification = showNotification(
          `Broke out conversation with ${model?.name || modelId}. You can now continue the conversation with this model only.`,
          'success'
        )
        notification.clearAutoRemove()
        setTimeout(() => notification(), 5000)

        setTutorialHasBreakout(true)
      } catch (err) {
        logger.error('Failed to create breakout conversation:', err)
        setError('Failed to break out conversation. Please try again.')
        setBreakoutPhase('idle')
      }
    },
    [
      isAuthenticated,
      currentVisibleComparisonId,
      allModels,
      textareaRef,
      loadHistoryFromAPI,
      loadConversationFromLocalStorage,
      loadHistoryFromLocalStorage,
      saveConversationToLocalStorage,
      setConversationHistory,
      setConversations,
      setSelectedModels,
      setOriginalSelectedModels,
      setClosedCards,
      setIsFollowUpMode,
      setCurrentVisibleComparisonId,
      setInput,
      setError,
      setIsModelsHidden,
      setAlreadyBrokenOutModels,
      setTutorialHasBreakout,
    ]
  )

  return {
    breakoutPhase,
    handleBreakout,
  }
}
