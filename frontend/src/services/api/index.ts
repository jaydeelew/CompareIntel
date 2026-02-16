/**
 * API Client Module
 *
 * Centralized API client for CompareIntel frontend.
 *
 * @example
 * ```typescript
 * import { apiClient, ApiError } from '@/services/api';
 * import logger from '@/utils/logger';
 *
 * try {
 *   const response = await apiClient.get('/models');
 *   console.log(response.data);
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     logger.error('API Error:', error.status, error.message);
 *   }
 * }
 * ```
 */

// Export client
export { ApiClient, createApiClient, apiClient } from './client'

// Export error classes
export {
  ApiError,
  NetworkError,
  TimeoutError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  ServerError,
  CancellationError,
} from './errors'

// Export types
export type {
  HttpMethod,
  RequestConfig,
  ApiResponse,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  RetryConfig,
  CacheConfig,
  CacheEntry,
  ApiClientConfig,
  StreamHandler,
  StreamRequestConfig,
  ParsedError,
} from './types'

// Export interceptors (for custom configurations)
export {
  authInterceptor,
  defaultHeadersInterceptor,
  timeoutInterceptor,
  jsonResponseInterceptor,
  errorResponseInterceptor,
  networkErrorInterceptor,
  loggingErrorInterceptor,
  loggingRequestInterceptor,
  loggingResponseInterceptor,
} from './interceptors'
