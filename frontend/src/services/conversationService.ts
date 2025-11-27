/**
 * Conversation Service
 * 
 * Handles all conversation-related API endpoints including:
 * - Listing conversations
 * - Getting conversation details
 * - Deleting conversations
 */

import { apiClient } from './api/client';
import type { ConversationSummary, ConversationId } from '../types';

/**
 * Conversation detail response
 */
export interface ConversationDetail {
  id: ConversationId;
  title: string | null;
  input_data: string;
  models_used: string[];
  created_at: string;
  messages: ConversationMessage[];
}

/**
 * Conversation message in detail response
 */
export interface ConversationMessage {
  id: number;
  model_id: string | null;
  role: 'user' | 'assistant';
  content: string;
  input_tokens?: number | null;  // Input tokens for user messages (from OpenRouter)
  output_tokens?: number | null;  // Output tokens for assistant messages (from OpenRouter)
  success: boolean;
  processing_time_ms: number | null;
  created_at: string;
}

/**
 * Get list of user's conversations
 * 
 * @returns Promise resolving to conversation summaries
 * @throws {ApiError} If the request fails or user is not authenticated
 */
export async function getConversations(): Promise<ConversationSummary[]> {
  const response = await apiClient.get<ConversationSummary[]>('/conversations');
  return response.data;
}

/**
 * Get full conversation details with all messages
 * 
 * @param conversationId - Conversation ID
 * @returns Promise resolving to conversation details
 * @throws {ApiError} If the request fails or conversation not found
 */
export async function getConversation(
  conversationId: ConversationId
): Promise<ConversationDetail> {
  const response = await apiClient.get<ConversationDetail>(
    `/conversations/${conversationId}`
  );
  return response.data;
}

/**
 * Delete a conversation and all its messages
 * 
 * @param conversationId - Conversation ID
 * @returns Promise resolving when deletion completes
 * @throws {ApiError} If deletion fails or conversation not found
 */
export async function deleteConversation(
  conversationId: ConversationId
): Promise<void> {
  await apiClient.delete(`/conversations/${conversationId}`);
}

