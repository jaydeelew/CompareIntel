import { useEffect, useRef } from 'react'

import type { ConversationMessage, ModelConversation } from '../types'
import { createModelId, createMessageId } from '../types'

interface UseTokenReloadConfig {
  currentVisibleComparisonId: string | number | null
  conversations: ModelConversation[]
  isAuthenticated: boolean
}

type ConversationData = {
  models_used: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[]
}

interface UseTokenReloadCallbacks {
  loadConversationFromAPI: (id: number) => Promise<ConversationData | null>
  loadConversationFromLocalStorage: (id: string) => ConversationData | null
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
}

function estimateTokens(text: string): number {
  if (!text.trim()) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export function useTokenReload(config: UseTokenReloadConfig, callbacks: UseTokenReloadCallbacks) {
  const { currentVisibleComparisonId, conversations, isAuthenticated } = config
  const { loadConversationFromAPI, loadConversationFromLocalStorage, setConversations } = callbacks

  const processedIdsRef = useRef<Set<string | number>>(new Set())

  useEffect(() => {
    if (!currentVisibleComparisonId || conversations.length === 0) {
      return
    }

    if (processedIdsRef.current.has(currentVisibleComparisonId)) {
      return
    }

    const hasTokenCounts = conversations.some(conv =>
      conv.messages.some(
        msg =>
          (msg.type === 'user' && msg.input_tokens) ||
          (msg.type === 'assistant' && msg.output_tokens)
      )
    )

    if (hasTokenCounts) {
      processedIdsRef.current.add(currentVisibleComparisonId)
      return
    }

    if (isAuthenticated) {
      const conversationId =
        typeof currentVisibleComparisonId === 'string'
          ? parseInt(currentVisibleComparisonId, 10)
          : currentVisibleComparisonId

      if (isNaN(conversationId)) {
        return
      }

      processedIdsRef.current.add(currentVisibleComparisonId)

      const timeoutId = setTimeout(async () => {
        try {
          const data = await loadConversationFromAPI(conversationId)
          if (!data) return

          setConversations(prev => {
            const messagesByModel: { [modelId: string]: ConversationMessage[] } = {}

            data.messages.forEach(msg => {
              if (msg.role === 'user') {
                data.models_used.forEach((modelId: string) => {
                  if (!messagesByModel[modelId]) messagesByModel[modelId] = []
                  messagesByModel[modelId].push({
                    id: msg.id
                      ? createMessageId(String(msg.id))
                      : createMessageId(`${Date.now()}-user-${Math.random()}`),
                    type: 'user',
                    content: msg.content,
                    timestamp: msg.created_at,
                    input_tokens: msg.input_tokens,
                  })
                })
              } else if (msg.role === 'assistant' && msg.model_id) {
                const modelId = createModelId(msg.model_id)
                if (!messagesByModel[modelId]) messagesByModel[modelId] = []
                messagesByModel[modelId].push({
                  id: msg.id
                    ? createMessageId(String(msg.id))
                    : createMessageId(`${Date.now()}-${Math.random()}`),
                  type: 'assistant',
                  content: msg.content,
                  timestamp: msg.created_at,
                  output_tokens: msg.output_tokens,
                })
              }
            })

            return prev.map(conv => {
              const apiMessages = messagesByModel[conv.modelId] || []
              if (apiMessages.length === 0) return conv

              const updatedMessages = conv.messages.map(msg => {
                const match = apiMessages.find(
                  m =>
                    m.type === msg.type &&
                    m.content === msg.content &&
                    Math.abs(new Date(m.timestamp).getTime() - new Date(msg.timestamp).getTime()) <
                      5000
                )
                if (match) {
                  return {
                    ...msg,
                    input_tokens: match.input_tokens,
                    output_tokens: match.output_tokens,
                  }
                }
                return msg
              })

              return { ...conv, messages: updatedMessages }
            })
          })
        } catch (error) {
          console.error('Failed to reload conversation with token counts:', error)
        }
      }, 2000)

      return () => clearTimeout(timeoutId)
    } else {
      processedIdsRef.current.add(currentVisibleComparisonId)

      const timeoutId = setTimeout(() => {
        try {
          const data = loadConversationFromLocalStorage(String(currentVisibleComparisonId))
          if (!data) return

          setConversations(prev => {
            const messagesByModel: { [modelId: string]: ConversationMessage[] } = {}

            data.messages.forEach(msg => {
              if (msg.role === 'user') {
                data.models_used.forEach((modelId: string) => {
                  if (!messagesByModel[modelId]) messagesByModel[modelId] = []
                  messagesByModel[modelId].push({
                    id: msg.id
                      ? createMessageId(String(msg.id))
                      : createMessageId(`${Date.now()}-user-${Math.random()}`),
                    type: 'user',
                    content: msg.content,
                    timestamp: msg.created_at || new Date().toISOString(),
                    input_tokens: msg.input_tokens ?? estimateTokens(msg.content),
                  })
                })
              } else if (msg.role === 'assistant' && msg.model_id) {
                const modelId = createModelId(msg.model_id)
                if (!messagesByModel[modelId]) messagesByModel[modelId] = []
                messagesByModel[modelId].push({
                  id: msg.id
                    ? createMessageId(String(msg.id))
                    : createMessageId(`${Date.now()}-${Math.random()}`),
                  type: 'assistant',
                  content: msg.content,
                  timestamp: msg.created_at || new Date().toISOString(),
                  output_tokens: msg.output_tokens ?? estimateTokens(msg.content),
                })
              }
            })

            return prev.map(conv => {
              const storedMessages = messagesByModel[conv.modelId] || []

              if (storedMessages.length > 0) {
                const updatedMessages = conv.messages.map(msg => {
                  const match = storedMessages.find(
                    m =>
                      m.type === msg.type &&
                      m.content === msg.content &&
                      Math.abs(
                        new Date(m.timestamp).getTime() - new Date(msg.timestamp).getTime()
                      ) < 5000
                  )
                  if (match) {
                    return {
                      ...msg,
                      input_tokens: match.input_tokens,
                      output_tokens: match.output_tokens,
                    }
                  }
                  return {
                    ...msg,
                    input_tokens:
                      msg.type === 'user' && !msg.input_tokens
                        ? estimateTokens(msg.content)
                        : msg.input_tokens,
                    output_tokens:
                      msg.type === 'assistant' && !msg.output_tokens
                        ? estimateTokens(msg.content)
                        : msg.output_tokens,
                  }
                })
                return { ...conv, messages: updatedMessages }
              }

              return {
                ...conv,
                messages: conv.messages.map(msg => ({
                  ...msg,
                  input_tokens:
                    msg.type === 'user' && !msg.input_tokens
                      ? estimateTokens(msg.content)
                      : msg.input_tokens,
                  output_tokens:
                    msg.type === 'assistant' && !msg.output_tokens
                      ? estimateTokens(msg.content)
                      : msg.output_tokens,
                })),
              }
            })
          })
        } catch (error) {
          console.error('Failed to reload conversation with token counts from localStorage:', error)
        }
      }, 500)

      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentVisibleComparisonId,
    isAuthenticated,
    loadConversationFromAPI,
    loadConversationFromLocalStorage,
  ])
}
