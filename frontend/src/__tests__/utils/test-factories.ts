/**
 * Test Data Factories
 *
 * Factory functions to create test data for all types in the application.
 * These factories make it easy to generate consistent test data with
 * sensible defaults that can be overridden.
 */

import type {
  User,
  ModelId,
  ConversationMessage,
  StoredMessage,
  ConversationSummary,
  ConversationRound,
  ModelConversation,
  CompareResponse,
  ComparisonMetadata,
  RateLimitStatus,
  Model,
  ModelsByProvider,
  AuthResponse,
  AuthTokens,
  LoginCredentials,
  RegisterData,
  StreamEvent,
  StreamEventType,
} from '../../types'
import {
  createUserId,
  createConversationId,
  createMessageId,
  createModelId,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PERIOD,
  USER_ROLE,
  STREAM_EVENT_TYPE,
} from '../../types'

/**
 * Create a mock User with sensible defaults
 */
export function createMockUser(overrides?: Partial<User>): User {
  const id = overrides?.id || createUserId(1)
  return {
    id,
    email: overrides?.email || `user-${id}-${Date.now()}@example.com`,
    is_verified: overrides?.is_verified ?? true,
    is_active: overrides?.is_active ?? true,
    role: overrides?.role || USER_ROLE.USER,
    is_admin: overrides?.is_admin ?? false,
    subscription_tier: overrides?.subscription_tier || 'free',
    subscription_status: overrides?.subscription_status || SUBSCRIPTION_STATUS.ACTIVE,
    subscription_period: overrides?.subscription_period || SUBSCRIPTION_PERIOD.MONTHLY,
    daily_usage_count: overrides?.daily_usage_count ?? 0,
    monthly_overage_count: overrides?.monthly_overage_count ?? 0,
    mock_mode_enabled: overrides?.mock_mode_enabled ?? false,
    created_at: overrides?.created_at || new Date().toISOString(),
  }
}

/**
 * Create a mock admin user
 */
export function createMockAdminUser(overrides?: Partial<User>): User {
  return createMockUser({
    role: USER_ROLE.ADMIN,
    is_admin: true,
    ...overrides,
  })
}

/**
 * Create a mock authenticated user with premium subscription
 */
export function createMockPremiumUser(overrides?: Partial<User>): User {
  return createMockUser({
    subscription_tier: 'premium',
    subscription_status: SUBSCRIPTION_STATUS.ACTIVE,
    ...overrides,
  })
}

/**
 * Create a mock Model
 */
export function createMockModel(overrides?: Partial<Model>): Model {
  const id = overrides?.id || createModelId(`gpt-4-${Date.now()}`)
  return {
    id,
    name: overrides?.name || `Model ${id}`,
    description: overrides?.description || `Description for ${id}`,
    category: overrides?.category || 'gpt',
    provider: overrides?.provider || 'OpenAI',
    available: overrides?.available ?? true,
  }
}

/**
 * Create mock ModelsByProvider
 */
export function createMockModelsByProvider(
  providers: string[] = ['OpenAI', 'Anthropic', 'Google'],
  modelsPerProvider: number = 2
): ModelsByProvider {
  const result: ModelsByProvider = {}

  for (const provider of providers) {
    result[provider] = Array.from({ length: modelsPerProvider }, (_, i) =>
      createMockModel({
        provider,
        category: provider.toLowerCase(),
        name: `${provider} Model ${i + 1}`,
      })
    )
  }

  return result
}

/**
 * Create a mock ConversationMessage
 */
export function createMockConversationMessage(
  overrides?: Partial<ConversationMessage>
): ConversationMessage {
  const id = overrides?.id || createMessageId(`msg-${Date.now()}`)
  return {
    id,
    type: overrides?.type || 'user',
    content: overrides?.content || `Test message content ${id}`,
    timestamp: overrides?.timestamp || new Date().toISOString(),
  }
}

/**
 * Create a mock StoredMessage
 */
export function createMockStoredMessage(overrides?: Partial<StoredMessage>): StoredMessage {
  return {
    role: overrides?.role || 'user',
    content: overrides?.content || `Test stored message ${Date.now()}`,
    created_at: overrides?.created_at || new Date().toISOString(),
    model_id: overrides?.model_id,
    id: overrides?.id,
  }
}

/**
 * Create a mock ConversationSummary
 */
export function createMockConversationSummary(
  overrides?: Partial<ConversationSummary>
): ConversationSummary {
  const id = overrides?.id || createConversationId(1)
  return {
    id,
    input_data: overrides?.input_data || `Test input data ${id}`,
    models_used: overrides?.models_used || [createModelId('gpt-4'), createModelId('claude-3')],
    created_at: overrides?.created_at || new Date().toISOString(),
    message_count: overrides?.message_count ?? 2,
  }
}

/**
 * Create a mock ConversationRound
 */
export function createMockConversationRound(
  overrides?: Partial<ConversationRound>
): ConversationRound {
  return {
    user: overrides?.user || createMockStoredMessage({ role: 'user' }),
    assistants: overrides?.assistants || [
      createMockStoredMessage({
        role: 'assistant',
        model_id: createModelId('gpt-4'),
      }),
      createMockStoredMessage({
        role: 'assistant',
        model_id: createModelId('claude-3'),
      }),
    ],
  }
}

/**
 * Create a mock ModelConversation
 */
export function createMockModelConversation(
  overrides?: Partial<ModelConversation>
): ModelConversation {
  const modelId = overrides?.modelId || createModelId('gpt-4')
  return {
    modelId,
    messages: overrides?.messages || [
      createMockConversationMessage({ type: 'user' }),
      createMockConversationMessage({ type: 'assistant' }),
    ],
  }
}

/**
 * Create a mock ComparisonMetadata
 */
export function createMockComparisonMetadata(
  overrides?: Partial<ComparisonMetadata>
): ComparisonMetadata {
  return {
    input_length: overrides?.input_length ?? 100,
    models_requested: overrides?.models_requested ?? 2,
    models_successful: overrides?.models_successful ?? 2,
    models_failed: overrides?.models_failed ?? 0,
    timestamp: overrides?.timestamp || new Date().toISOString(),
    processing_time_ms: overrides?.processing_time_ms ?? 1500,
  }
}

/**
 * Create a mock CompareResponse
 */
export function createMockCompareResponse(
  modelIds: ModelId[] = [createModelId('gpt-4'), createModelId('claude-3')],
  overrides?: Partial<CompareResponse>
): CompareResponse {
  const results: Record<ModelId, string> = {}

  for (const modelId of modelIds) {
    results[modelId] = overrides?.results?.[modelId] || `Response from ${modelId}`
  }

  return {
    results,
    metadata:
      overrides?.metadata ||
      createMockComparisonMetadata({
        models_requested: modelIds.length,
        models_successful: modelIds.length,
      }),
  }
}

/**
 * Create a mock RateLimitStatus
 */
export function createMockRateLimitStatus(overrides?: Partial<RateLimitStatus>): RateLimitStatus {
  const dailyLimit = overrides?.daily_limit ?? 100
  const dailyUsage = overrides?.daily_usage ?? 0

  return {
    daily_usage: dailyUsage,
    daily_limit: dailyLimit,
    remaining_usage: dailyLimit - dailyUsage,
    subscription_tier: overrides?.subscription_tier || 'free',
    model_limit: overrides?.model_limit ?? 9,
    overage_allowed: overrides?.overage_allowed ?? false,
    overage_price: overrides?.overage_price ?? null,
    monthly_overage_count: overrides?.monthly_overage_count ?? 0,
    reset_time: overrides?.reset_time || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    user_type: overrides?.user_type || 'authenticated',
  }
}

/**
 * Create a mock AuthTokens
 */
export function createMockAuthTokens(overrides?: Partial<AuthTokens>): AuthTokens {
  return {
    access_token: overrides?.access_token || `mock-access-token-${Date.now()}`,
    refresh_token: overrides?.refresh_token || `mock-refresh-token-${Date.now()}`,
    token_type: overrides?.token_type || 'bearer',
  }
}

/**
 * Create a mock AuthResponse
 */
export function createMockAuthResponse(overrides?: Partial<AuthResponse>): AuthResponse {
  return {
    ...createMockAuthTokens(overrides),
    user: overrides?.user || createMockUser(),
  }
}

/**
 * Create a mock LoginCredentials
 */
export function createMockLoginCredentials(
  overrides?: Partial<LoginCredentials>
): LoginCredentials {
  return {
    email: overrides?.email || 'test@example.com',
    password: overrides?.password || 'test-password-123',
  }
}

/**
 * Create a mock RegisterData
 */
export function createMockRegisterData(overrides?: Partial<RegisterData>): RegisterData {
  return {
    email: overrides?.email || `test-${Date.now()}@example.com`,
    password: overrides?.password || 'test-password-123',
    confirm_password: overrides?.confirm_password || overrides?.password || 'test-password-123',
  }
}

/**
 * Create a mock StreamEvent
 */
export function createMockStreamEvent(
  type: StreamEventType,
  overrides?: Partial<StreamEvent>
): StreamEvent {
  const base: StreamEvent = {
    type,
  }

  switch (type) {
    case STREAM_EVENT_TYPE.START:
      return {
        ...base,
        model: overrides?.model || createModelId('gpt-4'),
      }

    case STREAM_EVENT_TYPE.CHUNK:
      return {
        ...base,
        model: overrides?.model || createModelId('gpt-4'),
        content: overrides?.content || 'Chunk content',
      }

    case STREAM_EVENT_TYPE.DONE:
      return {
        ...base,
        model: overrides?.model || createModelId('gpt-4'),
      }

    case STREAM_EVENT_TYPE.COMPLETE:
      return {
        ...base,
        metadata: overrides?.metadata || createMockComparisonMetadata(),
      }

    case STREAM_EVENT_TYPE.ERROR:
      return {
        ...base,
        message: overrides?.message || 'Stream error occurred',
      }

    default:
      return base
  }
}

/**
 * Create multiple mock StreamEvents for a complete comparison stream
 */
export function createMockStreamEvents(
  modelIds: ModelId[] = [createModelId('gpt-4'), createModelId('claude-3')]
): StreamEvent[] {
  const events: StreamEvent[] = []

  for (const modelId of modelIds) {
    events.push(createMockStreamEvent(STREAM_EVENT_TYPE.START, { model: modelId }))
    events.push(
      createMockStreamEvent(STREAM_EVENT_TYPE.CHUNK, {
        model: modelId,
        content: `Response chunk from ${modelId}`,
      })
    )
    events.push(createMockStreamEvent(STREAM_EVENT_TYPE.DONE, { model: modelId }))
  }

  events.push(
    createMockStreamEvent(STREAM_EVENT_TYPE.COMPLETE, {
      metadata: createMockComparisonMetadata({
        models_requested: modelIds.length,
        models_successful: modelIds.length,
      }),
    })
  )

  return events
}

/**
 * Web search result interface
 */
export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

/**
 * Create a mock web search result
 */
export function createMockWebSearchResult(overrides?: Partial<WebSearchResult>): WebSearchResult {
  return {
    title: overrides?.title || `Search Result ${Date.now()}`,
    url: overrides?.url || `https://example.com/result-${Date.now()}`,
    snippet: overrides?.snippet || `This is a search result snippet for testing purposes.`,
    source: overrides?.source || 'brave',
  }
}

/**
 * Create multiple mock web search results
 */
export function createMockWebSearchResults(count: number = 5): WebSearchResult[] {
  return Array.from({ length: count }, (_, i) =>
    createMockWebSearchResult({
      title: `Search Result ${i + 1}`,
      url: `https://example.com/result-${i + 1}`,
      snippet: `Snippet for result ${i + 1}`,
    })
  )
}
