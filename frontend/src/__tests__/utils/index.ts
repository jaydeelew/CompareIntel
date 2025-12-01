/**
 * Test Utilities Index
 *
 * Central export point for all test utilities.
 * Import from this module for convenient access to all testing helpers.
 *
 * @example
 * ```ts
 * import { renderWithProviders, createMockUser, mockCompare } from '@/__tests__/utils';
 * ```
 */

// Test render helpers
export {
  renderWithProviders,
  wait,
  waitForElement,
  createMockEvent,
  mockWindowLocation,
  type CustomRenderOptions,
} from './test-utils'

// Re-export React Testing Library utilities
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'

// Test data factories
export {
  createMockUser,
  createMockAdminUser,
  createMockPremiumUser,
  createMockModel,
  createMockModelsByProvider,
  createMockConversationMessage,
  createMockStoredMessage,
  createMockConversationSummary,
  createMockConversationRound,
  createMockModelConversation,
  createMockComparisonMetadata,
  createMockCompareResponse,
  createMockRateLimitStatus,
  createMockAuthTokens,
  createMockAuthResponse,
  createMockLoginCredentials,
  createMockRegisterData,
  createMockStreamEvent,
  createMockStreamEvents,
} from './test-factories'

// Mock API responses
export {
  mockCompareResponse,
  mockCompareStreamResponse,
  mockRateLimitStatusResponse,
  mockRegisterResponse,
  mockLoginResponse,
  mockRefreshTokenResponse,
  mockGetCurrentUserResponse,
  mockVerifyEmailResponse,
  mockResendVerificationResponse,
  mockForgotPasswordResponse,
  mockResetPasswordResponse,
  mockLogoutResponse,
  mockDeleteAccountResponse,
  mockConversationsListResponse,
  mockConversationDetailResponse,
  mockAvailableModelsResponse,
  mockModelStatsResponse,
  mockAnonymousMockModeStatusResponse,
  mockResetRateLimitResponse,
  mockErrorResponse,
  mockNotFoundResponse,
  mockUnauthorizedResponse,
  mockForbiddenResponse,
  mockRateLimitExceededResponse,
  mockInternalServerErrorResponse,
} from './mock-api-responses'

// Mock service implementations
export {
  mockCompare,
  mockCompareStream,
  mockGetRateLimitStatus,
  mockGetAnonymousMockModeStatus,
  mockGetModelStats,
  mockResetRateLimit,
  mockLogin,
  mockRegister,
  mockRefreshToken,
  mockGetCurrentUser,
  mockVerifyEmail,
  mockResendVerification,
  mockForgotPassword,
  mockResetPassword,
  mockLogout,
  mockDeleteAccount,
  mockGetConversations,
  mockGetConversation,
  mockDeleteConversation,
  mockGetAvailableModels,
  createMockServiceModule,
  resetAllMocks,
  setupMockServices,
} from './mock-services'
