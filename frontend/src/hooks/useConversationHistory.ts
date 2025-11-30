/**
 * Custom hook for managing conversation history
 * 
 * Handles loading, saving, and deleting conversation history for both
 * authenticated and anonymous users. Ensures immediate UI updates when
 * conversations are created or deleted.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ConversationSummary, ModelConversation, ConversationId } from '../types';
import { createConversationId, createModelId } from '../types';
import { getConversations, deleteConversation as deleteConversationFromAPI } from '../services/conversationService';
import { ApiError } from '../services/api/errors';
import { apiClient } from '../services/api/client';

export interface UseConversationHistoryOptions {
  isAuthenticated: boolean;
  user: any; // TODO: Use proper User type
  onDeleteActiveConversation?: () => void; // Callback when deleting the active conversation
}

export interface UseConversationHistoryReturn {
  conversationHistory: ConversationSummary[];
  setConversationHistory: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  isLoadingHistory: boolean;
  setIsLoadingHistory: React.Dispatch<React.SetStateAction<boolean>>;
  historyLimit: number;
  currentVisibleComparisonId: string | null;
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>;
  showHistoryDropdown: boolean;
  setShowHistoryDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  loadHistoryFromAPI: () => Promise<void>;
  loadHistoryFromLocalStorage: () => ConversationSummary[];
  saveConversationToLocalStorage: (
    inputData: string,
    modelsUsed: string[],
    conversationsToSave: ModelConversation[],
    isUpdate?: boolean
  ) => string;
  deleteConversation: (summary: ConversationSummary, e: React.MouseEvent) => Promise<void>;
  loadConversationFromAPI: (conversationId: ConversationId) => Promise<ModelConversation[] | null>;
  loadConversationFromLocalStorage: (conversationId: string) => ModelConversation[];
  syncHistoryAfterComparison: (inputData: string, selectedModels: string[]) => Promise<void>;
}

export function useConversationHistory({
  isAuthenticated,
  user,
  onDeleteActiveConversation,
}: UseConversationHistoryOptions): UseConversationHistoryReturn {
  const [conversationHistory, setConversationHistory] = useState<ConversationSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentVisibleComparisonId, setCurrentVisibleComparisonId] = useState<string | null>(null);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // Get history limit based on tier - use useMemo to ensure it updates when user/auth changes
  const historyLimit = useMemo(() => {
    if (!isAuthenticated || !user) return 2; // Anonymous
    const tier = user.subscription_tier || 'free';
    const limits: { [key: string]: number } = {
      anonymous: 2,
      free: 3,
      starter: 10,
      starter_plus: 20,
      pro: 50,
      pro_plus: 100,
    };
    return limits[tier] || 2;
  }, [isAuthenticated, user]);

  // Load conversation history from localStorage (anonymous users)
  const loadHistoryFromLocalStorage = useCallback((): ConversationSummary[] => {
    try {
      const historyJson = localStorage.getItem('compareintel_conversation_history');
      if (!historyJson) return [];
      const history = JSON.parse(historyJson) as ConversationSummary[];
      // Sort by created_at descending (most recent first)
      return history.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } catch (e) {
      console.error('Failed to load conversation history from localStorage:', e);
      return [];
    }
  }, []);

  // Save conversation to localStorage (anonymous users)
  // Returns the conversationId of the saved conversation
  const saveConversationToLocalStorage = useCallback((
    inputData: string,
    modelsUsed: string[],
    conversationsToSave: ModelConversation[],
    isUpdate: boolean = false
  ): string => {
    try {
      const history = loadHistoryFromLocalStorage();

      // Calculate total messages across all models
      const totalMessages = conversationsToSave.reduce(
        (sum, conv) => sum + conv.messages.length,
        0
      );

      let conversationId: string;
      let existingConversation: ConversationSummary | undefined;

      if (isUpdate) {
        // Find existing conversation by matching first user message and models
        existingConversation = history.find((conv) => {
          if (typeof conv.id !== 'string') return false;
          const modelsMatch = JSON.stringify([...conv.models_used].sort()) === JSON.stringify([...modelsUsed].sort());
          // Check if the input_data matches (first query)
          // OR check if any stored conversation has a first user message matching this inputData
          if (modelsMatch) {
            // Load the conversation to check its first user message
            try {
              const storedData = localStorage.getItem(`compareintel_conversation_${conv.id}`);
              if (storedData) {
                const parsed = JSON.parse(storedData) as { messages?: any[]; input_data?: string };
                // Check if the first user message in stored data matches our inputData
                const firstStoredUserMsg = parsed.messages?.find((m: any) => m.role === 'user');
                if (firstStoredUserMsg && firstStoredUserMsg.content === inputData) {
                  return true;
                }
                // Also check if input_data field matches
                if (parsed.input_data === inputData) {
                  return true;
                }
              }
            } catch {
              // If we can't parse, fall back to input_data match
              return conv.input_data === inputData;
            }
          }
          return false;
        });

        if (existingConversation) {
          conversationId = String(existingConversation.id);
        } else {
          // Couldn't find existing, create new (shouldn't happen)
          conversationId = Date.now().toString();
          isUpdate = false;
        }
      } else {
        // Create new conversation
        conversationId = Date.now().toString();
      }

      // Create or update conversation summary
      const conversationSummary: ConversationSummary = existingConversation ? {
        ...existingConversation,
        message_count: totalMessages,
        // Keep original created_at for existing conversations
      } : {
        id: createConversationId(conversationId),
        input_data: inputData,
        models_used: modelsUsed.map(id => createModelId(id)),
        created_at: new Date().toISOString(),
        message_count: totalMessages,
      };

      // Update history list
      let updatedHistory: ConversationSummary[];
      if (isUpdate && existingConversation) {
        // Update existing entry in place
        updatedHistory = history.map(conv =>
          conv.id === conversationId ? conversationSummary : conv
        );
      } else {
        // Remove any existing conversation with the same input and models (to prevent duplicates)
        const filteredHistory = history.filter(conv =>
          !(conv.input_data === inputData &&
            JSON.stringify([...conv.models_used].sort()) === JSON.stringify([...modelsUsed].sort()))
        );

        // For new conversations: add the new one and limit to 2 most recent after sorting
        // When user has A & B and runs C, comparison C appears at top and A is deleted
        // Always add the new conversation - we'll limit to 2 most recent after sorting
        filteredHistory.unshift(conversationSummary);
        updatedHistory = filteredHistory;
      }

      // Sort by created_at DESC
      const sorted = updatedHistory.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // For anonymous users, save maximum of 2 conversations
      // When comparison 3 is made, comparison 1 is deleted and comparison 3 appears at the top
      // Keep only the 2 most recent conversations
      const limited = sorted.slice(0, 2);

      // Store summary list (save maximum 2 in localStorage)
      localStorage.setItem('compareintel_conversation_history', JSON.stringify(limited));

      // Store full conversation data with ID as key
      // Format: messages with role and model_id for proper reconstruction
      const conversationMessages: any[] = [];
      const seenUserMessages = new Set<string>(); // Track user messages to avoid duplicates

      // Simple token estimation function (1 token ≈ 4 chars) for when token counts are missing
      const estimateTokensSimple = (text: string): number => {
        if (!text.trim()) {
          return 0;
        }
        return Math.max(1, Math.ceil(text.length / 4));
      };

      // Group messages from conversations by model
      conversationsToSave.forEach(conv => {
        conv.messages.forEach(msg => {
          if (msg.type === 'user') {
            // Deduplicate user messages - same content and timestamp (within 1 second) = same message
            const userKey = `${msg.content}-${new Date(msg.timestamp).getTime()}`;
            if (!seenUserMessages.has(userKey)) {
              seenUserMessages.add(userKey);
              const userMessage: any = {
                role: 'user',
                content: msg.content,
                created_at: msg.timestamp,
              };
              // Preserve token counts if available, otherwise estimate
              userMessage.input_tokens = msg.input_tokens !== undefined && msg.input_tokens !== null
                ? msg.input_tokens
                : estimateTokensSimple(msg.content);
              conversationMessages.push(userMessage);
            }
          } else {
            const assistantMessage: any = {
              role: 'assistant',
              model_id: conv.modelId,
              content: msg.content,
              created_at: msg.timestamp,
            };
            // Preserve token counts if available, otherwise estimate
            assistantMessage.output_tokens = msg.output_tokens !== undefined && msg.output_tokens !== null
              ? msg.output_tokens
              : estimateTokensSimple(msg.content);
            conversationMessages.push(assistantMessage);
          }
        });
      });

      // Get existing conversation data to preserve created_at if updating
      const existingData = isUpdate && existingConversation
        ? JSON.parse(localStorage.getItem(`compareintel_conversation_${conversationId}`) || '{}')
        : null;

      localStorage.setItem(`compareintel_conversation_${conversationId}`, JSON.stringify({
        input_data: inputData, // Always keep first query as input_data
        models_used: modelsUsed,
        created_at: existingData?.created_at || conversationSummary.created_at,
        messages: conversationMessages,
      }));

      // Delete full conversation data for any conversations that are no longer in the limited list
      // This ensures we only keep data for the 2 most recent comparisons
      const limitedIds = new Set(limited.map(conv => conv.id));
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('compareintel_conversation_') && key !== 'compareintel_conversation_history') {
          // Extract the conversation ID from the key (format: compareintel_conversation_{id})
          const convId = key.replace('compareintel_conversation_', '');
          if (!limitedIds.has(createConversationId(convId))) {
            keysToDelete.push(key);
          }
        }
      }
      // Delete the old conversation data
      keysToDelete.forEach(key => {
        localStorage.removeItem(key);
      });

      // Reload all saved conversations from localStorage to state
      // This ensures dropdown can show all saved conversations, and filtering/slicing handles the display limit
      const reloadedHistory = loadHistoryFromLocalStorage();
      setConversationHistory(reloadedHistory);

      return conversationId;
    } catch (e) {
      console.error('Failed to save conversation to localStorage:', e);
      return '';
    }
  }, [loadHistoryFromLocalStorage]);

  // Load conversation history from API (authenticated users)
  const loadHistoryFromAPI = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoadingHistory(true);
    try {
      const data = await getConversations();
      // Ensure created_at is a string if it's not already, and models_used is always an array
      const formattedData: ConversationSummary[] = Array.isArray(data) ? data.map((item) => {
        const summary: ConversationSummary = {
          ...item,
          created_at: typeof item.created_at === 'string' ? item.created_at : new Date(item.created_at).toISOString(),
          models_used: Array.isArray(item.models_used) ? item.models_used : [],
        };
        return summary;
      }) : [];
      setConversationHistory(formattedData);
    } catch (error) {
      if (error instanceof ApiError) {
        console.error('Failed to load conversation history:', error.status, error.message);
      } else {
        console.error('Failed to load conversation history from API:', error);
      }
      setConversationHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [isAuthenticated]);

  // Delete conversation from API (authenticated users) or localStorage (anonymous users)
  const deleteConversation = useCallback(async (summary: ConversationSummary, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the loadConversation onClick

    // Check if the deleted item is the currently active comparison
    const isActiveItem = currentVisibleComparisonId && String(summary.id) === currentVisibleComparisonId;

    // If this was the active item, call the callback to reset UI state
    if (isActiveItem && onDeleteActiveConversation) {
      onDeleteActiveConversation();
    }

    if (isAuthenticated && typeof summary.id === 'number') {
      // Delete from API
      try {
        await deleteConversationFromAPI(summary.id);

        // Clear cache for conversations endpoint to force fresh data
        apiClient.deleteCache('GET:/conversations');

        // Immediately update state to remove the deleted conversation from UI
        setConversationHistory(prev => prev.filter(conv => conv.id !== summary.id));

        // If this was the active item, reset the visible comparison ID
        if (isActiveItem) {
          setCurrentVisibleComparisonId(null);
        }

        // Reload history from API to ensure sync (will fetch fresh data due to cache clear)
        await loadHistoryFromAPI();
      } catch (error) {
        if (error instanceof ApiError) {
          console.error('Failed to delete conversation:', error.message);
        } else {
          console.error('Failed to delete conversation from API:', error);
        }
      }
    } else if (!isAuthenticated && typeof summary.id === 'string') {
      // Delete from localStorage
      try {
        // Remove the conversation data
        localStorage.removeItem(`compareintel_conversation_${summary.id}`);

        // Update history list
        const history = loadHistoryFromLocalStorage();
        const updatedHistory = history.filter(conv => conv.id !== summary.id);
        localStorage.setItem('compareintel_conversation_history', JSON.stringify(updatedHistory));

        // Immediately update state to remove the deleted conversation from UI
        setConversationHistory(updatedHistory);

        // If this was the active item, reset the visible comparison ID
        if (isActiveItem) {
          setCurrentVisibleComparisonId(null);
        }
      } catch (error) {
        console.error('Failed to delete conversation from localStorage:', error);
      }
    }
  }, [isAuthenticated, currentVisibleComparisonId, loadHistoryFromAPI, loadHistoryFromLocalStorage, onDeleteActiveConversation]);

  // Load full conversation from API (authenticated users)
  // Note: This is a simplified version. The actual loading logic is in App.tsx
  // because it requires complex data transformation that depends on App.tsx types
  const loadConversationFromAPI = useCallback(async (_conversationId: ConversationId): Promise<ModelConversation[] | null> => {
    try {
      // This is a placeholder - actual implementation is in App.tsx
      console.warn('loadConversationFromAPI called from hook - should use App.tsx version');
      return null;
    } catch (error) {
      if (error instanceof ApiError) {
        console.error('Failed to load conversation:', error.message);
      } else {
        console.error('Failed to load conversation from API:', error);
      }
      return null;
    }
  }, []);

  // Load full conversation from localStorage (anonymous users)
  const loadConversationFromLocalStorage = useCallback((conversationId: string): ModelConversation[] => {
    try {
      const conversationJson = localStorage.getItem(`compareintel_conversation_${conversationId}`);
      if (!conversationJson) {
        console.error('Conversation not found in localStorage:', conversationId);
        return [];
      }
      const conversationData = JSON.parse(conversationJson);
      return conversationData.conversations.map((conv: any) => ({
        ...conv,
        isStreaming: false,
      }));
    } catch (e) {
      console.error('Failed to load conversation from localStorage:', e);
      return [];
    }
  }, []);

  // Load conversation history on mount and when auth status changes
  useEffect(() => {
    if (isAuthenticated) {
      loadHistoryFromAPI();
    } else {
      const history = loadHistoryFromLocalStorage();
      setConversationHistory(history);
    }
  }, [isAuthenticated, loadHistoryFromAPI, loadHistoryFromLocalStorage]);

  // Refresh history when dropdown is opened for authenticated users
  useEffect(() => {
    if (showHistoryDropdown) {
      if (isAuthenticated) {
        loadHistoryFromAPI();
      } else {
        const history = loadHistoryFromLocalStorage();
        setConversationHistory(history);
      }
    }
  }, [showHistoryDropdown, isAuthenticated, loadHistoryFromAPI, loadHistoryFromLocalStorage]);

  /**
   * Sync conversation history after a comparison completes
   * For authenticated users: reload from API and set the new comparison as active
   * This ensures the new comparison shows up immediately in the history dropdown
   * 
   * @param inputData - The input text from the comparison
   * @param selectedModels - The models that were compared
   */
  const syncHistoryAfterComparison = useCallback(async (inputData: string, selectedModels: string[]) => {
    if (!isAuthenticated) {
      // For anonymous users, saveConversationToLocalStorage already updates state immediately
      return;
    }

    // Clear cache for conversations endpoint to force fresh data
    apiClient.deleteCache('GET:/conversations');
    
    // Reload history from API (backend has already saved the conversation)
    await loadHistoryFromAPI();
    
    // Find the newly saved comparison and set it as active
    // Use a small delay to ensure conversationHistory state is updated
    setTimeout(() => {
      setConversationHistory(currentHistory => {
        // Find matching conversation in history (should be the most recent one)
        const matchingConversation = currentHistory.find((summary: ConversationSummary) => {
          const modelsMatch = JSON.stringify([...summary.models_used].sort()) === JSON.stringify([...selectedModels].sort());
          const inputMatches = summary.input_data === inputData;
          return modelsMatch && inputMatches;
        });

        if (matchingConversation) {
          // Clear cache for this specific conversation to ensure fresh data on reload
          apiClient.deleteCache(`GET:/conversations/${matchingConversation.id}`);
          // Set this as the active comparison so it shows as highlighted in dropdown
          setCurrentVisibleComparisonId(String(matchingConversation.id));
        }
        
        return currentHistory; // Return unchanged
      });
    }, 100);
  }, [isAuthenticated, loadHistoryFromAPI]);

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
  };
}

