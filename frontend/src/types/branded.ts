/**
 * Branded types for CompareIntel
 *
 * Branded types provide type safety by preventing accidental mixing
 * of different ID types. For example, a UserId cannot be accidentally
 * used where a ConversationId is expected.
 *
 * @example
 * ```typescript
 * const userId: UserId = 123 as UserId;
 * const conversationId: ConversationId = 'abc' as ConversationId;
 * // userId = conversationId; // TypeScript error!
 * ```
 */

/**
 * Branded type helper
 */
type Brand<T, B> = T & { __brand: B }

/**
 * User ID - numeric identifier for users
 */
export type UserId = Brand<number, 'UserId'>

/**
 * Conversation ID - string or numeric identifier for conversations
 */
export type ConversationId = Brand<string | number, 'ConversationId'>

/**
 * Model ID - string identifier for AI models
 */
export type ModelId = Brand<string, 'ModelId'>

/**
 * Message ID - string identifier for messages
 */
export type MessageId = Brand<string, 'MessageId'>

/**
 * Helper functions to create branded IDs
 */
export const createUserId = (id: number): UserId => id as UserId
export const createConversationId = (id: string | number): ConversationId => id as ConversationId
export const createModelId = (id: string): ModelId => id as ModelId
export const createMessageId = (id: string): MessageId => id as MessageId
