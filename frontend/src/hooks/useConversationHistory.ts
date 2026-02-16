// Manages conversation history - API for logged-in users, localStorage for anon users

import { useState, useCallback, useEffect, useMemo } from 'react'

import { apiClient } from '../services/api/client'
import { ApiError } from '../services/api/errors'
import {
  getConversations,
  deleteConversation as deleteConversationFromAPI,
} from '../services/conversationService'
import { createConversationId, createModelId } from '../types'
import type {
  ConversationSummary,
  ModelConversation,
  ConversationId,
  StoredMessage,
  User,
} from '../types'
import logger from '../utils/logger'

export interface UseConversationHistoryOptions {
  isAuthenticated: boolean
  user: User | null
  onDeleteActiveConversation?: () => void
}

export interface UseConversationHistoryReturn {
  conversationHistory: ConversationSummary[]
  setConversationHistory: React.Dispatch<React.SetStateAction<ConversationSummary[]>>
  isLoadingHistory: boolean
  setIsLoadingHistory: React.Dispatch<React.SetStateAction<boolean>>
  historyLimit: number
  currentVisibleComparisonId: string | null
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>
  showHistoryDropdown: boolean
  setShowHistoryDropdown: React.Dispatch<React.SetStateAction<boolean>>
  loadHistoryFromAPI: () => Promise<void>
  loadHistoryFromLocalStorage: () => ConversationSummary[]
  saveConversationToLocalStorage: (
    inputData: string,
    modelsUsed: string[],
    conversationsToSave: ModelConversation[],
    isUpdate?: boolean,
    fileContents?: Array<{ name: string; content: string; placeholder: string }>,
    conversationType?: 'comparison' | 'breakout',
    parentConversationId?: string | null,
    breakoutModelId?: string | null
  ) => string
  deleteConversation: (summary: ConversationSummary, e: React.MouseEvent) => Promise<void>
  loadConversationFromAPI: (conversationId: ConversationId) => Promise<ModelConversation[] | null>
  loadConversationFromLocalStorage: (conversationId: string) => ModelConversation[]
  syncHistoryAfterComparison: (inputData: string, selectedModels: string[]) => Promise<void>
}

export function useConversationHistory({
  isAuthenticated,
  user,
  onDeleteActiveConversation,
}: UseConversationHistoryOptions): UseConversationHistoryReturn {
  const [conversationHistory, setConversationHistory] = useState<ConversationSummary[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [currentVisibleComparisonId, setCurrentVisibleComparisonId] = useState<string | null>(null)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)

  // Get history limit based on tier - use useMemo to ensure it updates when user/auth changes
  const historyLimit = useMemo(() => {
    if (!isAuthenticated || !user) return 2 // Anonymous
    const tier = user.subscription_tier || 'free'
    const limits: { [key: string]: number } = {
      anonymous: 2,
      free: 3,
      starter: 10,
      starter_plus: 20,
      pro: 50,
      pro_plus: 100,
    }
    return limits[tier] || 2
  }, [isAuthenticated, user])

  // Load conversation history from localStorage (unregistered users)
  const loadHistoryFromLocalStorage = useCallback((): ConversationSummary[] => {
    try {
      const historyJson = localStorage.getItem('compareintel_conversation_history')
      if (!historyJson) return []
      const history = JSON.parse(historyJson) as ConversationSummary[]
      // Sort by created_at descending (most recent first)
      return history.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    } catch (e) {
      logger.error('Failed to load conversation history from localStorage:', e)
      return []
    }
  }, [])

  // Save conversation to localStorage (unregistered users)
  // Returns the conversationId of the saved conversation
  const saveConversationToLocalStorage = useCallback(
    (
      inputData: string,
      modelsUsed: string[],
      conversationsToSave: ModelConversation[],
      isUpdate: boolean = false,
      fileContents?: Array<{ name: string; content: string; placeholder: string }>,
      conversationType: 'comparison' | 'breakout' = 'comparison',
      parentConversationId?: string | null,
      breakoutModelId?: string | null
    ): string => {
      try {
        const history = loadHistoryFromLocalStorage()

        // Calculate total messages across all models
        const totalMessages = conversationsToSave.reduce(
          (sum, conv) => sum + conv.messages.length,
          0
        )

        let conversationId: string
        let existingConversation: ConversationSummary | undefined

        if (isUpdate) {
          // Find existing conversation by matching first user message and models
          existingConversation = history.find(conv => {
            if (typeof conv.id !== 'string') return false
            const modelsMatch =
              JSON.stringify([...conv.models_used].sort()) ===
              JSON.stringify([...modelsUsed].sort())
            // Check if the input_data matches (first query)
            // OR check if any stored conversation has a first user message matching this inputData
            if (modelsMatch) {
              // Load the conversation to check its first user message
              try {
                const storedData = localStorage.getItem(`compareintel_conversation_${conv.id}`)
                if (storedData) {
                  const parsed = JSON.parse(storedData) as {
                    messages?: StoredMessage[]
                    input_data?: string
                  }
                  // Check if the first user message in stored data matches our inputData
                  const firstStoredUserMsg = parsed.messages?.find(
                    (m: StoredMessage) => m.role === 'user'
                  )
                  if (firstStoredUserMsg && firstStoredUserMsg.content === inputData) {
                    return true
                  }
                  // Also check if input_data field matches
                  if (parsed.input_data === inputData) {
                    return true
                  }
                }
              } catch {
                // If we can't parse, fall back to input_data match
                return conv.input_data === inputData
              }
            }
            return false
          })

          if (existingConversation) {
            conversationId = String(existingConversation.id)
          } else {
            // Couldn't find existing, create new (shouldn't happen)
            conversationId = Date.now().toString()
            isUpdate = false
          }
        } else {
          // Create new conversation
          conversationId = Date.now().toString()
        }

        // Create or update conversation summary
        // When updating, preserve existing breakout fields unless explicitly changing conversation type
        const isChangingConversationType =
          existingConversation &&
          (parentConversationId !== undefined || breakoutModelId !== undefined)

        const conversationSummary: ConversationSummary = existingConversation
          ? {
              ...existingConversation,
              message_count: totalMessages,
              // Preserve existing conversation_type unless explicitly changing it (creating breakout)
              conversation_type: isChangingConversationType
                ? conversationType
                : existingConversation.conversation_type || conversationType,
              // Only update parent_conversation_id and breakout_model_id if explicitly provided
              parent_conversation_id:
                parentConversationId !== undefined
                  ? parentConversationId
                    ? parseInt(parentConversationId, 10)
                    : null
                  : existingConversation.parent_conversation_id,
              breakout_model_id:
                breakoutModelId !== undefined
                  ? breakoutModelId
                    ? createModelId(breakoutModelId)
                    : null
                  : existingConversation.breakout_model_id,
              // Keep original created_at for existing conversations
            }
          : {
              id: createConversationId(conversationId),
              input_data: inputData,
              models_used: modelsUsed.map(id => createModelId(id)),
              conversation_type: conversationType,
              parent_conversation_id: parentConversationId
                ? parseInt(parentConversationId, 10)
                : null,
              breakout_model_id: breakoutModelId ? createModelId(breakoutModelId) : null,
              created_at: new Date().toISOString(),
              message_count: totalMessages,
            }

        // Update history list
        let updatedHistory: ConversationSummary[]
        if (isUpdate && existingConversation) {
          // Update existing entry in place
          // Compare IDs as strings to handle both ConversationId branded types and raw strings
          updatedHistory = history.map(conv =>
            String(conv.id) === String(conversationId) ? conversationSummary : conv
          )
        } else {
          // Remove any existing conversation with the same input and models (to prevent duplicates)
          // For breakout conversations, allow multiple breakouts with the same model from the same parent
          // Each breakout gets a unique ID (timestamp-based) so they can diverge independently
          const filteredHistory = history.filter(conv => {
            // For breakout conversations, don't filter - allow multiple breakouts with same model/parent
            if (conversationType === 'breakout') {
              // Keep all conversations - each breakout is unique even if same model/parent
              return true
            }
            // For regular comparisons, check input_data and models_used to prevent duplicates
            return !(
              conv.input_data === inputData &&
              JSON.stringify([...conv.models_used].sort()) ===
                JSON.stringify([...modelsUsed].sort())
            )
          })

          // For new conversations: add the new one and limit to 2 most recent after sorting
          // When user has A & B and runs C, comparison C appears at top and A is deleted
          // Always add the new conversation - we'll limit to 2 most recent after sorting
          filteredHistory.unshift(conversationSummary)
          updatedHistory = filteredHistory
        }

        // Sort by created_at DESC
        const sorted = updatedHistory.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )

        // For unregistered users, save maximum of 2 conversations
        // When comparison 3 is made, comparison 1 is deleted and comparison 3 appears at the top
        // Keep only the 2 most recent conversations
        const limited = sorted.slice(0, 2)

        // Store summary list (save maximum 2 in localStorage)
        localStorage.setItem('compareintel_conversation_history', JSON.stringify(limited))

        // Store full conversation data with ID as key
        // Format: messages with role and model_id for proper reconstruction
        const conversationMessages: StoredMessage[] = []
        const seenUserMessages = new Set<string>() // Track user messages to avoid duplicates

        // Simple token estimation function (1 token ≈ 4 chars) for when token counts are missing
        const estimateTokensSimple = (text: string): number => {
          if (!text.trim()) {
            return 0
          }
          return Math.max(1, Math.ceil(text.length / 4))
        }

        // Group messages from conversations by model
        conversationsToSave.forEach(conv => {
          conv.messages.forEach(msg => {
            if (msg.type === 'user') {
              // Deduplicate user messages - same content and timestamp (within 1 second) = same message
              const userKey = `${msg.content}-${new Date(msg.timestamp).getTime()}`
              if (!seenUserMessages.has(userKey)) {
                seenUserMessages.add(userKey)
                const userMessage: StoredMessage = {
                  role: 'user',
                  content: msg.content,
                  created_at: msg.timestamp,
                }
                // Preserve token counts if available, otherwise estimate
                userMessage.input_tokens =
                  msg.input_tokens !== undefined && msg.input_tokens !== null
                    ? msg.input_tokens
                    : estimateTokensSimple(msg.content)
                conversationMessages.push(userMessage)
              }
            } else {
              const assistantMessage: StoredMessage = {
                role: 'assistant',
                model_id: conv.modelId,
                content: msg.content,
                created_at: msg.timestamp,
              }
              // Preserve token counts if available, otherwise estimate
              assistantMessage.output_tokens =
                msg.output_tokens !== undefined && msg.output_tokens !== null
                  ? msg.output_tokens
                  : estimateTokensSimple(msg.content)
              conversationMessages.push(assistantMessage)
            }
          })
        })

        // Get existing conversation data to preserve created_at if updating
        const existingData =
          isUpdate && existingConversation
            ? JSON.parse(
                localStorage.getItem(`compareintel_conversation_${conversationId}`) || '{}'
              )
            : null

        localStorage.setItem(
          `compareintel_conversation_${conversationId}`,
          JSON.stringify({
            input_data: inputData, // Always keep first query as input_data (with placeholders)
            models_used: modelsUsed,
            conversation_type: conversationType,
            parent_conversation_id: parentConversationId || null,
            breakout_model_id: breakoutModelId || null,
            created_at: existingData?.created_at || conversationSummary.created_at,
            messages: conversationMessages,
            file_contents: fileContents || [], // Store extracted file contents separately
          })
        )

        // Delete full conversation data for any conversations that are no longer in the limited list
        // This ensures we only keep data for the 2 most recent comparisons
        const limitedIds = new Set(limited.map(conv => conv.id))
        const keysToDelete: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (
            key &&
            key.startsWith('compareintel_conversation_') &&
            key !== 'compareintel_conversation_history'
          ) {
            // Extract the conversation ID from the key (format: compareintel_conversation_{id})
            const convId = key.replace('compareintel_conversation_', '')
            if (!limitedIds.has(createConversationId(convId))) {
              keysToDelete.push(key)
            }
          }
        }
        // Delete the old conversation data
        keysToDelete.forEach(key => {
          localStorage.removeItem(key)
        })

        // Reload all saved conversations from localStorage to state
        // This ensures dropdown can show all saved conversations, and filtering/slicing handles the display limit
        const reloadedHistory = loadHistoryFromLocalStorage()
        setConversationHistory(reloadedHistory)

        return conversationId
      } catch (e) {
        logger.error('Failed to save conversation to localStorage:', e)
        return ''
      }
    },
    [loadHistoryFromLocalStorage]
  )

  // Load conversation history from API (authenticated users)
  const loadHistoryFromAPI = useCallback(async () => {
    if (!isAuthenticated) return

    setIsLoadingHistory(true)
    try {
      const data = await getConversations()
      // Ensure created_at is a string if it's not already, and models_used is always an array
      const formattedData: ConversationSummary[] = Array.isArray(data)
        ? data.map(item => {
            const summary: ConversationSummary = {
              ...item,
              created_at:
                typeof item.created_at === 'string'
                  ? item.created_at
                  : new Date(item.created_at).toISOString(),
              models_used: Array.isArray(item.models_used) ? item.models_used : [],
            }
            return summary
          })
        : []
      setConversationHistory(formattedData)
    } catch (error) {
      const ctx = error instanceof ApiError ? `${error.status}: ${error.message}` : error
      logger.error('Failed to load conversation history:', ctx)
      setConversationHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }, [isAuthenticated])

  // Delete conversation from API (authenticated users) or localStorage (unregistered users)
  const deleteConversation = useCallback(
    async (summary: ConversationSummary, e: React.MouseEvent) => {
      e.stopPropagation() // Prevent triggering the loadConversation onClick

      // Check if the deleted item is the currently active comparison
      const isActiveItem =
        currentVisibleComparisonId && String(summary.id) === currentVisibleComparisonId

      // If this was the active item, call the callback to reset UI state
      if (isActiveItem && onDeleteActiveConversation) {
        onDeleteActiveConversation()
      }

      if (isAuthenticated && typeof summary.id === 'number') {
        // Delete from API
        try {
          await deleteConversationFromAPI(summary.id)

          // Clear cache for conversations endpoint to force fresh data
          apiClient.deleteCache('GET:/conversations')

          // Immediately update state to remove the deleted conversation from UI
          setConversationHistory(prev => prev.filter(conv => conv.id !== summary.id))

          // If this was the active item, reset the visible comparison ID
          if (isActiveItem) {
            setCurrentVisibleComparisonId(null)
          }

          // Reload history from API to ensure sync (will fetch fresh data due to cache clear)
          await loadHistoryFromAPI()
        } catch (error) {
          const ctx = error instanceof ApiError ? error.message : error
          logger.error('Failed to delete conversation:', ctx)
        }
      } else if (!isAuthenticated && typeof summary.id === 'string') {
        // Delete from localStorage
        try {
          // Remove the conversation data
          localStorage.removeItem(`compareintel_conversation_${summary.id}`)

          // Update history list
          const history = loadHistoryFromLocalStorage()
          const updatedHistory = history.filter(conv => conv.id !== summary.id)
          localStorage.setItem('compareintel_conversation_history', JSON.stringify(updatedHistory))

          // Immediately update state to remove the deleted conversation from UI
          setConversationHistory(updatedHistory)

          // If this was the active item, reset the visible comparison ID
          if (isActiveItem) {
            setCurrentVisibleComparisonId(null)
          }
        } catch (error) {
          logger.error('Failed to delete conversation from localStorage:', error)
        }
      }
    },
    [
      isAuthenticated,
      currentVisibleComparisonId,
      loadHistoryFromAPI,
      loadHistoryFromLocalStorage,
      onDeleteActiveConversation,
    ]
  )

  // Load full conversation from API (authenticated users)
  // Note: This is a simplified version. The actual loading logic is in App.tsx
  // because it requires complex data transformation that depends on App.tsx types
  const loadConversationFromAPI = useCallback(
    async (_conversationId: ConversationId): Promise<ModelConversation[] | null> => {
      try {
        // This is a placeholder - actual implementation is in App.tsx
        logger.warn('loadConversationFromAPI called from hook - should use App.tsx version')
        return null
      } catch (error) {
        const ctx = error instanceof ApiError ? error.message : error
        logger.error('Failed to load conversation:', ctx)
        return null
      }
    },
    []
  )

  // Load full conversation from localStorage (unregistered users)
  const loadConversationFromLocalStorage = useCallback(
    (conversationId: string): ModelConversation[] => {
      try {
        const conversationJson = localStorage.getItem(`compareintel_conversation_${conversationId}`)
        if (!conversationJson) {
          logger.error('Conversation not found in localStorage:', conversationId)
          return []
        }
        const conversationData = JSON.parse(conversationJson) as {
          conversations: ModelConversation[]
        }
        return conversationData.conversations.map((conv: ModelConversation) => ({
          ...conv,
          isStreaming: false,
        }))
      } catch (e) {
        logger.error('Failed to load conversation from localStorage:', e)
        return []
      }
    },
    []
  )

  // Load conversation history on mount and when auth status changes
  useEffect(() => {
    if (isAuthenticated) {
      loadHistoryFromAPI()
    } else {
      const history = loadHistoryFromLocalStorage()
      setConversationHistory(history)
    }
  }, [isAuthenticated, loadHistoryFromAPI, loadHistoryFromLocalStorage])

  // Refresh history when dropdown is opened for authenticated users
  useEffect(() => {
    if (showHistoryDropdown) {
      if (isAuthenticated) {
        loadHistoryFromAPI()
      } else {
        // For unregistered users, localStorage is synchronous - ensure loading state is false
        setIsLoadingHistory(false)
        const history = loadHistoryFromLocalStorage()
        setConversationHistory(history)
      }
    }
  }, [showHistoryDropdown, isAuthenticated, loadHistoryFromAPI, loadHistoryFromLocalStorage])

  /**
   * Sync conversation history after a comparison completes
   * For authenticated users: reload from API and set the new comparison as active
   * This ensures the new comparison shows up immediately in the history dropdown
   *
   * @param inputData - The input text from the comparison
   * @param selectedModels - The models that were compared
   */
  const syncHistoryAfterComparison = useCallback(
    async (inputData: string, selectedModels: string[]) => {
      if (!isAuthenticated) {
        // For unregistered users, saveConversationToLocalStorage already updates state immediately
        return
      }

      // Clear cache for conversations endpoint to force fresh data
      apiClient.deleteCache('GET:/conversations')

      // Helper function to normalize model IDs for comparison
      const normalizeModels = (models: string[]): string[] => {
        return [...models].sort().map(m => m.trim().toLowerCase())
      }

      // Helper function to fetch and find the matching conversation
      const fetchAndFindConversation = async (): Promise<ConversationSummary | null> => {
        const data = await getConversations()

        // Format the data to ensure consistency
        const formattedData: ConversationSummary[] = Array.isArray(data)
          ? data.map(item => {
              const summary: ConversationSummary = {
                ...item,
                created_at:
                  typeof item.created_at === 'string'
                    ? item.created_at
                    : new Date(item.created_at).toISOString(),
                models_used: Array.isArray(item.models_used) ? item.models_used : [],
              }
              return summary
            })
          : []

        // Update state with the fresh data
        setConversationHistory(formattedData)

        // Normalize selected models for comparison
        const normalizedSelectedModels = normalizeModels(selectedModels)

        // Find the newly saved comparison and set it as active
        // Match by models and input_data to find the conversation we just created
        // Use more lenient matching to handle potential format differences
        const matchingConversation = formattedData.find((summary: ConversationSummary) => {
          // Normalize models from API response
          const normalizedSummaryModels = normalizeModels(
            Array.isArray(summary.models_used) ? summary.models_used : []
          )

          // Compare normalized model arrays
          const modelsMatch =
            JSON.stringify(normalizedSummaryModels) === JSON.stringify(normalizedSelectedModels)

          // Compare input data (exact match required)
          const inputMatches = summary.input_data === inputData

          return modelsMatch && inputMatches
        })

        return matchingConversation || null
      }

      // Try to find the conversation with retries (in case backend is still saving)
      const maxRetries = 5 // Increased retries
      const retryDelay = 800 // Increased delay to give backend more time

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const matchingConversation = await fetchAndFindConversation()

          if (matchingConversation) {
            // Clear cache for this specific conversation to ensure fresh data on reload
            apiClient.deleteCache(`GET:/conversations/${matchingConversation.id}`)
            // Set this as the active comparison so it shows as highlighted in dropdown
            setCurrentVisibleComparisonId(String(matchingConversation.id))
            return // Success - found the conversation
          }

          // If not found and we have retries left, wait and try again
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay))
          }
        } catch (_error) {
          // If fetch fails, try again if retries remain
          if (attempt === maxRetries - 1) {
            // Last attempt failed, fall back to loadHistoryFromAPI
            await loadHistoryFromAPI()
          } else {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, retryDelay))
          }
        }
      }
    },
    [isAuthenticated, loadHistoryFromAPI]
  )

  return {
    conversationHistory,
    setConversationHistory,
    isLoadingHistory,
    setIsLoadingHistory,
    historyLimit,
    currentVisibleComparisonId,
    setCurrentVisibleComparisonId,
    showHistoryDropdown,
    setShowHistoryDropdown,
    loadHistoryFromAPI,
    loadHistoryFromLocalStorage,
    saveConversationToLocalStorage,
    deleteConversation,
    loadConversationFromAPI,
    loadConversationFromLocalStorage,
    syncHistoryAfterComparison,
  }
}
