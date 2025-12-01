/**
 * Conversation-related types for CompareIntel
 *
 * These types define the structure of conversations, messages, and
 * conversation history throughout the application.
 */

import type { ConversationId, MessageId, ModelId } from './branded'

/**
 * Message type in a conversation
 */
export const MESSAGE_TYPE = {
  USER: 'user',
  ASSISTANT: 'assistant',
} as const

export type MessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE]

/**
 * Role type for stored messages (aligns with API)
 */
export const MESSAGE_ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
} as const

export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE]

/**
 * A message in a conversation (client-side representation)
 */
export interface ConversationMessage {
  /** Unique identifier for the message */
  id: MessageId
  /** Type of message (user or assistant) */
  type: MessageType
  /** Content of the message */
  content: string
  /** ISO timestamp when the message was created */
  timestamp: string
  /** Input tokens for user messages (from OpenRouter API) */
  input_tokens?: number | null
  /** Output tokens for assistant messages (from OpenRouter API) */
  output_tokens?: number | null
}

/**
 * A stored message (server-side representation)
 */
export interface StoredMessage {
  /** Role of the message sender */
  role: MessageRole
  /** Content of the message */
  content: string
  /** ISO timestamp when the message was created */
  created_at: string
  /** Optional model ID that generated this message (for assistant messages) */
  model_id?: ModelId
  /** Optional unique identifier */
  id?: MessageId | ConversationId
  /** Input tokens for user messages (from OpenRouter API) */
  input_tokens?: number | null
  /** Output tokens for assistant messages (from OpenRouter API) */
  output_tokens?: number | null
}

/**
 * Conversation for a specific model
 */
export interface ModelConversation {
  /** Model ID this conversation belongs to */
  modelId: ModelId
  /** Messages in this conversation */
  messages: ConversationMessage[]
}

/**
 * Summary of a conversation (used in history)
 */
export interface ConversationSummary {
  /** Unique identifier for the conversation */
  id: ConversationId
  /** Initial input data for the conversation */
  input_data: string
  /** Array of model IDs used in this conversation */
  models_used: ModelId[]
  /** ISO timestamp when the conversation was created */
  created_at: string
  /** Optional count of messages in the conversation */
  message_count?: number
}

/**
 * A conversation round (user message + all assistant responses)
 */
export interface ConversationRound {
  /** The user message that started this round */
  user: StoredMessage
  /** All assistant responses in this round */
  assistants: StoredMessage[]
}
