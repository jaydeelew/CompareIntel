/**
 * Mock API Responses
 *
 * Provides mock response data for all API endpoints.
 * These can be used to mock fetch calls or API client responses.
 */

import type {
  CompareRequestPayload,
  RateLimitStatus as CompareRateLimitStatus,
} from '../../services/compareService'
import type { ConversationDetail } from '../../services/conversationService'
import type { AvailableModelsResponse } from '../../services/modelsService'
import type {
  CompareResponse,
  User,
  AuthResponse,
  ConversationSummary,
  ModelStats,
  AnonymousMockModeStatus,
  StreamEvent,
} from '../../types'
import { createModelId } from '../../types'

import {
  createMockCompareResponse,
  createMockUser,
  createMockRateLimitStatus,
  createMockStreamEvents,
  createMockConversationSummary,
  createMockModelsByProvider,
} from './test-factories'

/**
 * Mock response for /compare-stream endpoint (legacy format for testing)
 */
export function mockCompareResponse(
  payload?: CompareRequestPayload,
  overrides?: Partial<CompareResponse>
): CompareResponse {
  const modelIds = payload?.models || [createModelId('gpt-4'), createModelId('claude-3')]
  return createMockCompareResponse(modelIds, overrides)
}

/**
 * Mock response for /compare-stream endpoint (SSE events)
 * Returns an array of StreamEvent objects that would be sent via SSE
 */
export function mockCompareStreamResponse(payload?: CompareRequestPayload): StreamEvent[] {
  const modelIds = payload?.models || [createModelId('gpt-4'), createModelId('claude-3')]
  return createMockStreamEvents(modelIds)
}

/**
 * Mock response for /rate-limit-status endpoint
 */
export function mockRateLimitStatusResponse(
  overrides?: Partial<CompareRateLimitStatus>
): CompareRateLimitStatus {
  return createMockRateLimitStatus(overrides)
}

/**
 * Mock response for /auth/register endpoint
 */
export function mockRegisterResponse(
  user?: Partial<User>,
  overrides?: Partial<AuthResponse>
): AuthResponse {
  return {
    access_token: `mock-access-token-${Date.now()}`,
    refresh_token: `mock-refresh-token-${Date.now()}`,
    token_type: 'bearer',
    user: createMockUser(user),
    ...overrides,
  }
}

/**
 * Mock response for /auth/login endpoint
 */
export function mockLoginResponse(
  user?: Partial<User>,
  overrides?: Partial<AuthResponse>
): AuthResponse {
  return mockRegisterResponse(user, overrides)
}

/**
 * Mock response for /auth/refresh endpoint
 */
export function mockRefreshTokenResponse(overrides?: Partial<AuthResponse>): {
  access_token: string
  refresh_token: string
  token_type: string
} {
  return {
    access_token: overrides?.access_token || `mock-access-token-${Date.now()}`,
    refresh_token: overrides?.refresh_token || `mock-refresh-token-${Date.now()}`,
    token_type: overrides?.token_type || 'bearer',
  }
}

/**
 * Mock response for /auth/me endpoint
 */
export function mockGetCurrentUserResponse(overrides?: Partial<User>): User {
  return createMockUser(overrides)
}

/**
 * Mock response for /auth/verify-email endpoint
 */
export function mockVerifyEmailResponse(): { message: string } {
  return {
    message: 'Email verified successfully',
  }
}

/**
 * Mock response for /auth/resend-verification endpoint
 */
export function mockResendVerificationResponse(): { message: string } {
  return {
    message: 'Verification email sent',
  }
}

/**
 * Mock response for /auth/forgot-password endpoint
 */
export function mockForgotPasswordResponse(): { message: string } {
  return {
    message: 'Password reset email sent',
  }
}

/**
 * Mock response for /auth/reset-password endpoint
 */
export function mockResetPasswordResponse(): { message: string } {
  return {
    message: 'Password reset successfully',
  }
}

/**
 * Mock response for /auth/logout endpoint
 */
export function mockLogoutResponse(): { message: string } {
  return {
    message: 'Logged out successfully',
  }
}

/**
 * Mock response for /auth/delete-account endpoint
 */
export function mockDeleteAccountResponse(): { message: string } {
  return {
    message: 'Account deleted successfully',
  }
}

/**
 * Mock response for /conversations endpoint (list)
 */
export function mockConversationsListResponse(
  count: number = 5,
  overrides?: Partial<ConversationSummary>[]
): ConversationSummary[] {
  return Array.from({ length: count }, (_, i) => createMockConversationSummary(overrides?.[i]))
}

/**
 * Mock response for /conversations/:id endpoint (detail)
 */
export function mockConversationDetailResponse(
  conversationId: number = 1,
  overrides?: Partial<ConversationDetail>
): ConversationDetail {
  return {
    id: conversationId,
    title: overrides?.title || null,
    input_data: overrides?.input_data || `Test input for conversation ${conversationId}`,
    models_used: overrides?.models_used || [createModelId('gpt-4'), createModelId('claude-3')],
    created_at: overrides?.created_at || new Date().toISOString(),
    messages: overrides?.messages || [
      {
        id: 1,
        model_id: null,
        role: 'user',
        content: 'Test user message',
        success: true,
        processing_time_ms: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        model_id: createModelId('gpt-4'),
        role: 'assistant',
        content: 'Test assistant response from GPT-4',
        success: true,
        processing_time_ms: 1500,
        created_at: new Date().toISOString(),
      },
      {
        id: 3,
        model_id: createModelId('claude-3'),
        role: 'assistant',
        content: 'Test assistant response from Claude-3',
        success: true,
        processing_time_ms: 1200,
        created_at: new Date().toISOString(),
      },
    ],
  }
}

/**
 * Mock response for /models endpoint
 */
export function mockAvailableModelsResponse(
  overrides?: Partial<AvailableModelsResponse>
): AvailableModelsResponse {
  return {
    models_by_provider: overrides?.models_by_provider || createMockModelsByProvider(),
  }
}

/**
 * Mock response for /model-stats endpoint
 */
export function mockModelStatsResponse(overrides?: Partial<ModelStats>): {
  model_stats: ModelStats
} {
  return {
    model_stats: overrides || {
      [createModelId('gpt-4')]: {
        success: 100,
        failure: 5,
        last_error: null,
        last_success: new Date().toISOString(),
      },
      [createModelId('claude-3')]: {
        success: 95,
        failure: 3,
        last_error: null,
        last_success: new Date().toISOString(),
      },
    },
  }
}

/**
 * Mock response for /anonymous-mock-mode-status endpoint
 */
export function mockAnonymousMockModeStatusResponse(
  overrides?: Partial<AnonymousMockModeStatus>
): AnonymousMockModeStatus {
  return {
    anonymous_mock_mode_enabled: overrides?.anonymous_mock_mode_enabled ?? false,
    is_development: overrides?.is_development ?? false,
  }
}

/**
 * Mock response for /dev/reset-rate-limit endpoint
 */
export function mockResetRateLimitResponse(): { message: string } {
  return {
    message: 'Rate limit reset successfully',
  }
}

/**
 * Mock error response
 */
export function mockErrorResponse(
  detail: string = 'An error occurred',
  code?: string
): { detail: string; code?: string } {
  return {
    detail,
    code,
  }
}

/**
 * Mock 404 Not Found response
 */
export function mockNotFoundResponse(): { detail: string } {
  return {
    detail: 'Not found',
  }
}

/**
 * Mock 401 Unauthorized response
 */
export function mockUnauthorizedResponse(): { detail: string } {
  return {
    detail: 'Unauthorized',
  }
}

/**
 * Mock 403 Forbidden response
 */
export function mockForbiddenResponse(): { detail: string } {
  return {
    detail: 'Forbidden',
  }
}

/**
 * Mock 429 Too Many Requests response
 */
export function mockRateLimitExceededResponse(): { detail: string } {
  return {
    detail: 'Rate limit exceeded',
  }
}

/**
 * Mock 500 Internal Server Error response
 */
export function mockInternalServerErrorResponse(): { detail: string } {
  return {
    detail: 'Internal server error',
  }
}
