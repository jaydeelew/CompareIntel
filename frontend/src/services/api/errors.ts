/**
 * Custom error classes for API client
 *
 * Provides type-safe error handling with structured error information
 */

import type { ApiErrorResponse } from '../../types/api'

/**
 * Base API error class
 */
export class ApiError extends Error {
  public readonly status: number
  public readonly statusText: string
  public readonly response?: ApiErrorResponse
  public readonly originalError?: Error

  constructor(
    message: string,
    status: number,
    statusText: string,
    response?: ApiErrorResponse,
    originalError?: Error
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.response = response
    this.originalError = originalError

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((Error as any).captureStackTrace) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Error as any).captureStackTrace(this, ApiError)
    }
  }

  /**
   * Check if error is a client error (4xx)
   */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }

  /**
   * Check if error is a server error (5xx)
   */
  isServerError(): boolean {
    return this.status >= 500 && this.status < 600
  }

  /**
   * Check if error is a network error (no status)
   */
  isNetworkError(): boolean {
    return this.status === 0
  }

  /**
   * Check if error is a timeout error
   */
  isTimeoutError(): boolean {
    return this.name === 'TimeoutError' || this.message.includes('timeout')
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    // Also retry on 429 (rate limit) and 408 (request timeout)
    return (
      this.isNetworkError() ||
      this.isTimeoutError() ||
      this.isServerError() ||
      this.status === 429 ||
      this.status === 408
    )
  }
}

/**
 * Network error (no response received)
 */
export class NetworkError extends ApiError {
  constructor(message: string = 'Network error occurred', originalError?: Error) {
    super(message, 0, 'Network Error', undefined, originalError)
    this.name = 'NetworkError'
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends ApiError {
  constructor(message: string = 'Request timeout', timeoutMs?: number) {
    const timeoutMessage = timeoutMs ? `Request timeout after ${timeoutMs}ms` : message
    super(timeoutMessage, 408, 'Request Timeout')
    this.name = 'TimeoutError'
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed', response?: ApiErrorResponse) {
    super(message, 401, 'Unauthorized', response)
    this.name = 'AuthenticationError'
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends ApiError {
  constructor(message: string = 'Access forbidden', response?: ApiErrorResponse) {
    super(message, 403, 'Forbidden', response)
    this.name = 'AuthorizationError'
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found', response?: ApiErrorResponse) {
    super(message, 404, 'Not Found', response)
    this.name = 'NotFoundError'
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends ApiError {
  public readonly retryAfter?: number

  constructor(
    message: string = 'Rate limit exceeded',
    response?: ApiErrorResponse,
    retryAfter?: number
  ) {
    super(message, 429, 'Too Many Requests', response)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

/**
 * Payment required error (402) - Insufficient credits
 */
export class PaymentRequiredError extends ApiError {
  constructor(message: string = 'Payment required', response?: ApiErrorResponse) {
    super(message, 402, 'Payment Required', response)
    this.name = 'PaymentRequiredError'
  }
}

/**
 * Validation error (422)
 */
export class ValidationError extends ApiError {
  constructor(message: string = 'Validation failed', response?: ApiErrorResponse) {
    super(message, 422, 'Unprocessable Entity', response)
    this.name = 'ValidationError'
  }
}

/**
 * Server error (5xx)
 */
export class ServerError extends ApiError {
  constructor(
    message: string = 'Server error occurred',
    status: number = 500,
    statusText: string = 'Internal Server Error',
    response?: ApiErrorResponse
  ) {
    super(message, status, statusText, response)
    this.name = 'ServerError'
  }
}

/**
 * Cancellation error (request was aborted)
 */
export class CancellationError extends ApiError {
  constructor(message: string = 'Request was cancelled') {
    super(message, 0, 'Cancelled')
    this.name = 'CancellationError'
  }
}
