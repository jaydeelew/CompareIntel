/**
 * Conversation Service
 *
 * Handles all conversation-related API endpoints including:
 * - Listing conversations
 * - Getting conversation details
 * - Deleting conversations
 * - Creating breakout conversations
 */

import type { ConversationSummary, ConversationId, ConversationType } from '../types'

import { apiClient } from './api/client'

/**
 * Conversation detail response
 */
export interface ConversationDetail {
  id: ConversationId
  title: string | null
  input_data: string
  models_used: string[]
  conversation_type?: ConversationType
  parent_conversation_id?: number | null
  breakout_model_id?: string | null
  already_broken_out_models?: string[]
  created_at: string
  messages: ConversationMessage[]
}

/**
 * Conversation message in detail response
 */
export interface ConversationMessage {
  id: number
  model_id: string | null
  role: 'user' | 'assistant'
  content: string
  input_tokens?: number | null // Input tokens for user messages (from OpenRouter)
  output_tokens?: number | null // Output tokens for assistant messages (from OpenRouter)
  success: boolean
  processing_time_ms: number | null
  created_at: string
}

/**
 * Request for creating a breakout conversation
 */
export interface BreakoutConversationRequest {
  parent_conversation_id: number
  model_id: string
}

/**
 * Get list of user's conversations
 *
 * @returns Promise resolving to conversation summaries
 * @throws {ApiError} If the request fails or user is not authenticated
 */
export async function getConversations(): Promise<ConversationSummary[]> {
  const response = await apiClient.get<ConversationSummary[]>('/conversations')
  return response.data
}

/**
 * Get full conversation details with all messages
 *
 * @param conversationId - Conversation ID
 * @returns Promise resolving to conversation details
 * @throws {ApiError} If the request fails or conversation not found
 */
export async function getConversation(conversationId: ConversationId): Promise<ConversationDetail> {
  const response = await apiClient.get<ConversationDetail>(`/conversations/${conversationId}`)
  return response.data
}

/**
 * Delete a conversation and all its messages
 *
 * @param conversationId - Conversation ID
 * @returns Promise resolving when deletion completes
 * @throws {ApiError} If deletion fails or conversation not found
 */
export async function deleteConversation(conversationId: ConversationId): Promise<void> {
  await apiClient.delete(`/conversations/${conversationId}`)
}

/**
 * Create a breakout conversation from a multi-model comparison
 *
 * @param request - Breakout conversation request with parent ID and model ID
 * @returns Promise resolving to the new breakout conversation details
 * @throws {ApiError} If creation fails or parent conversation not found
 */
export async function createBreakoutConversation(
  request: BreakoutConversationRequest
): Promise<ConversationDetail> {
  const response = await apiClient.post<ConversationDetail>('/conversations/breakout', request)
  return response.data
}

/**
 * Delete all conversations for the current user
 *
 * @returns Promise resolving to deletion result with count
 * @throws {ApiError} If deletion fails or user is not authenticated
 */
export async function deleteAllConversations(): Promise<{
  message: string
  deleted_count: number
}> {
  const response = await apiClient.delete<{ message: string; deleted_count: number }>(
    '/conversations/all'
  )
  return response.data
}
