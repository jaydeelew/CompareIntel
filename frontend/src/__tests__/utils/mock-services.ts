/**
 * Mock Service Implementations
 *
 * Provides mock implementations of all service functions for testing.
 * These can be used with vi.mock() to replace actual service calls.
 */

import { vi } from 'vitest'

import type {
  CompareRequestPayload,
  RateLimitStatus,
  AnonymousMockModeStatus,
  ModelStats,
} from '../../services/compareService'
import type { ConversationDetail } from '../../services/conversationService'
import type { AvailableModelsResponse } from '../../services/modelsService'
import type {
  LoginCredentials,
  RegisterData,
  AuthResponse,
  User,
  ConversationId,
  ConversationSummary,
} from '../../types'

import {
  mockCompareResponse,
  mockCompareStreamResponse,
  mockRateLimitStatusResponse,
  mockLoginResponse,
  mockRegisterResponse,
  mockGetCurrentUserResponse,
  mockConversationsListResponse,
  mockConversationDetailResponse,
  mockAvailableModelsResponse,
  mockModelStatsResponse,
  mockAnonymousMockModeStatusResponse,
  mockResetRateLimitResponse,
  mockVerifyEmailResponse,
  mockResendVerificationResponse,
  mockForgotPasswordResponse,
  mockResetPasswordResponse,
  mockLogoutResponse,
  mockDeleteAccountResponse,
} from './mock-api-responses'

/**
 * Mock implementation of compareService.compare
 */
export const mockCompare = vi.fn<
  [CompareRequestPayload],
  Promise<ReturnType<typeof mockCompareResponse>>
>(async payload => {
  return mockCompareResponse(payload)
})

/**
 * Mock implementation of compareService.compareStream
 * Returns a mock ReadableStream that emits SSE events
 */
export const mockCompareStream = vi.fn<
  [CompareRequestPayload],
  Promise<ReadableStream<Uint8Array> | null>
>(async payload => {
  const events = mockCompareStreamResponse(payload)

  // Create a mock ReadableStream that emits the events
  const encoder = new TextEncoder()
  const chunks = events.map(event => {
    const data = `data: ${JSON.stringify(event)}\n\n`
    return encoder.encode(data)
  })

  let index = 0
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const interval = setInterval(() => {
        if (index < chunks.length) {
          controller.enqueue(chunks[index])
          index++
        } else {
          clearInterval(interval)
          controller.close()
        }
      }, 10)
    },
  })
})

/**
 * Mock implementation of compareService.getRateLimitStatus
 */
export const mockGetRateLimitStatus = vi.fn<[string?], Promise<RateLimitStatus>>(
  async (_fingerprint?) => {
    return mockRateLimitStatusResponse()
  }
)

/**
 * Mock implementation of compareService.getAnonymousMockModeStatus
 */
export const mockGetAnonymousMockModeStatus = vi.fn<[], Promise<AnonymousMockModeStatus>>(
  async () => {
    return mockAnonymousMockModeStatusResponse()
  }
)

/**
 * Mock implementation of compareService.getModelStats
 */
export const mockGetModelStats = vi.fn<[], Promise<ModelStats>>(async () => {
  const response = mockModelStatsResponse()
  return response.model_stats
})

/**
 * Mock implementation of compareService.resetRateLimit
 */
export const mockResetRateLimit = vi.fn<[string?], Promise<{ message: string }>>(
  async (_fingerprint?) => {
    return mockResetRateLimitResponse()
  }
)

/**
 * Mock implementation of authService.login
 */
export const mockLogin = vi.fn<[LoginCredentials], Promise<AuthResponse>>(async _credentials => {
  return mockLoginResponse()
})

/**
 * Mock implementation of authService.register
 */
export const mockRegister = vi.fn<[RegisterData], Promise<AuthResponse>>(async _data => {
  return mockRegisterResponse()
})

/**
 * Mock implementation of authService.refreshToken
 */
export const mockRefreshToken = vi.fn<
  [string],
  Promise<{ access_token: string; refresh_token: string; token_type: string }>
>(async _refreshToken => {
  return {
    access_token: `mock-access-token-${Date.now()}`,
    refresh_token: `mock-refresh-token-${Date.now()}`,
    token_type: 'bearer',
  }
})

/**
 * Mock implementation of authService.getCurrentUser
 */
export const mockGetCurrentUser = vi.fn<[], Promise<User>>(async () => {
  return mockGetCurrentUserResponse()
})

/**
 * Mock implementation of authService.verifyEmail
 */
export const mockVerifyEmail = vi.fn<[string], Promise<{ message: string }>>(async _token => {
  return mockVerifyEmailResponse()
})

/**
 * Mock implementation of authService.resendVerification
 */
export const mockResendVerification = vi.fn<[string], Promise<{ message: string }>>(
  async _email => {
    return mockResendVerificationResponse()
  }
)

/**
 * Mock implementation of authService.forgotPassword
 */
export const mockForgotPassword = vi.fn<[string], Promise<{ message: string }>>(async _email => {
  return mockForgotPasswordResponse()
})

/**
 * Mock implementation of authService.resetPassword
 */
export const mockResetPassword = vi.fn<[string, string], Promise<{ message: string }>>(
  async (_token, _newPassword) => {
    return mockResetPasswordResponse()
  }
)

/**
 * Mock implementation of authService.logout
 */
export const mockLogout = vi.fn<[], Promise<{ message: string }>>(async () => {
  return mockLogoutResponse()
})

/**
 * Mock implementation of authService.deleteAccount
 */
export const mockDeleteAccount = vi.fn<[], Promise<{ message: string }>>(async () => {
  return mockDeleteAccountResponse()
})

/**
 * Mock implementation of conversationService.getConversations
 */
export const mockGetConversations = vi.fn<[], Promise<ConversationSummary[]>>(async () => {
  return mockConversationsListResponse()
})

/**
 * Mock implementation of conversationService.getConversation
 */
export const mockGetConversation = vi.fn<[ConversationId], Promise<ConversationDetail>>(
  async conversationId => {
    return mockConversationDetailResponse(Number(conversationId))
  }
)

/**
 * Mock implementation of conversationService.deleteConversation
 */
export const mockDeleteConversation = vi.fn<[ConversationId], Promise<void>>(
  async _conversationId => {
    // Mock implementation - just resolves
    return Promise.resolve()
  }
)

/**
 * Mock implementation of modelsService.getAvailableModels
 */
export const mockGetAvailableModels = vi.fn<[], Promise<AvailableModelsResponse>>(async () => {
  return mockAvailableModelsResponse()
})

/**
 * Helper to create a mock service module
 *
 * @example
 * ```ts
 * vi.mock('../../services/compareService', () => ({
 *   compare: mockCompare,
 *   getRateLimitStatus: mockGetRateLimitStatus,
 * }));
 * ```
 */
export function createMockServiceModule<T extends Record<string, unknown>>(mocks: T): T {
  return mocks
}

/**
 * Reset all mock functions
 */
export function resetAllMocks() {
  mockCompare.mockClear()
  mockCompareStream.mockClear()
  mockGetRateLimitStatus.mockClear()
  mockGetAnonymousMockModeStatus.mockClear()
  mockGetModelStats.mockClear()
  mockResetRateLimit.mockClear()
  mockLogin.mockClear()
  mockRegister.mockClear()
  mockRefreshToken.mockClear()
  mockGetCurrentUser.mockClear()
  mockVerifyEmail.mockClear()
  mockResendVerification.mockClear()
  mockForgotPassword.mockClear()
  mockResetPassword.mockClear()
  mockLogout.mockClear()
  mockDeleteAccount.mockClear()
  mockGetConversations.mockClear()
  mockGetConversation.mockClear()
  mockDeleteConversation.mockClear()
  mockGetAvailableModels.mockClear()
}

/**
 * Setup default mock implementations for all services
 * Call this in beforeEach() to reset mocks between tests
 */
export function setupMockServices() {
  resetAllMocks()

  // Set up default implementations
  mockCompare.mockImplementation(async payload => mockCompareResponse(payload))
  mockGetRateLimitStatus.mockImplementation(async () => mockRateLimitStatusResponse())
  mockGetCurrentUser.mockImplementation(async () => mockGetCurrentUserResponse())
  mockGetConversations.mockImplementation(async () => mockConversationsListResponse())
  mockGetAvailableModels.mockImplementation(async () => mockAvailableModelsResponse())
}
