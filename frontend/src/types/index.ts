/**
 * Type definitions for CompareIntel frontend
 *
 * This module re-exports all type definitions for convenient importing.
 * Import types from this module for consistency across the application.
 *
 * @example
 * ```typescript
 * import type { User, ConversationMessage, CompareResponse } from '@/types';
 * ```
 */

// Branded types
export type { UserId, ConversationId, ModelId, MessageId } from './branded'

export { createUserId, createConversationId, createModelId, createMessageId } from './branded'

// API types
export type {
  StreamEventType,
  StreamEvent,
  CompareRequest,
  ApiErrorResponse,
  BrowserFingerprint,
} from './api'

// Comparison types
export type { ComparisonMetadata, CompareResponse, ResultTab, ActiveResultTabs } from './comparison'

// Conversation types
export type {
  MessageType,
  MessageRole,
  ConversationMessage,
  StoredMessage,
  ModelConversation,
  ConversationSummary,
  ConversationRound,
} from './conversation'

// Model types
export type { Model, ModelsByProvider } from './models'

// User and auth types
export type {
  User,
  LoginCredentials,
  RegisterData,
  AuthTokens,
  AuthResponse,
  AuthContextType,
  UsageStats,
} from './user'

// Config types
export type {
  SubscriptionTier,
  SubscriptionStatus,
  SubscriptionPeriod,
  UserRole,
  TierLimits,
  NotificationType,
} from './config'

// Renderer config types
export type {
  MathDelimiterType,
  MathDelimiterPattern,
  PreprocessingFunction,
  PostProcessingFunction,
  PreprocessingOptions,
  MarkdownProcessingRules,
  KatexOptions,
  CodeBlockPreservationSettings,
  ModelRendererConfig,
  DefaultRendererConfig,
} from './rendererConfig'

// Re-export constants from their respective modules
export { STREAM_EVENT_TYPE, STREAM_EVENT_TYPE as API_STREAM_EVENT_TYPE } from './api'

export {
  MESSAGE_TYPE,
  MESSAGE_ROLE,
  MESSAGE_TYPE as CONVERSATION_MESSAGE_TYPE,
  MESSAGE_ROLE as CONVERSATION_MESSAGE_ROLE,
} from './conversation'

export { RESULT_TAB, RESULT_TAB as RESULT_TAB_CONST } from './comparison'

export { SUBSCRIPTION_STATUS, SUBSCRIPTION_PERIOD, USER_ROLE, NOTIFICATION_TYPE } from './config'
