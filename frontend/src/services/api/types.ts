/**
 * API-specific types for the API client
 * 
 * Types used internally by the API client for configuration,
 * request/response handling, and interceptors.
 */

import type { ApiErrorResponse } from '../../types/api';

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Request configuration options
 */
export interface RequestConfig extends Omit<RequestInit, 'cache'> {
  /** Custom timeout in milliseconds */
  timeout?: number;
  /** Whether to retry on failure */
  retry?: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Whether to cache the response (API client cache, not browser cache) */
  enableCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL?: number;
  /** Skip authentication token injection */
  skipAuth?: boolean;
  /** Custom headers (merged with default headers) */
  headers?: HeadersInit;
  /** Abort signal for request cancellation */
  signal?: AbortSignal;
  /** Internal: Cache key for this request */
  _cacheKey?: string;
  /** Internal: Timeout ID for cleanup */
  _timeoutId?: ReturnType<typeof setTimeout>;
  /** Internal: Token getter function */
  getToken?: () => string | null;
  /** Internal: Request URL for error handling */
  _url?: string;
}

/**
 * Response with typed data
 */
export interface ApiResponse<T = unknown> {
  /** Response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Response headers */
  headers: Headers;
  /** Original fetch response */
  response: Response;
}

/**
 * Request interceptor function
 */
export type RequestInterceptor = (
  url: string,
  config: RequestConfig
) => Promise<[string, RequestConfig]> | [string, RequestConfig];

/**
 * Response interceptor function
 */
export type ResponseInterceptor = (
  response: Response,
  config: RequestConfig
) => Promise<Response> | Response;

/**
 * Error interceptor function
 */
export type ErrorInterceptor = (
  error: Error,
  config: RequestConfig
) => Promise<Error> | Error;

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  /** Function to determine if error is retryable */
  shouldRetry: (error: Error) => boolean;
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Timestamp when cached */
  timestamp: number;
  /** Time to live in milliseconds */
  ttl: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Default TTL in milliseconds */
  defaultTTL: number;
  /** Maximum cache size */
  maxSize: number;
  /** Function to generate cache key from request */
  getKey: (url: string, config: RequestConfig) => string;
}

/**
 * Type guard to check if config is a stream request
 */
export function isStreamRequestConfig(
  config?: RequestConfig | StreamRequestConfig
): config is StreamRequestConfig {
  return config !== undefined && 'onChunk' in config;
}

/**
 * Client configuration
 */
export interface ApiClientConfig {
  /** Base URL for all requests */
  baseURL: string;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Default headers */
  headers?: HeadersInit;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Cache configuration */
  cache?: Partial<CacheConfig>;
  /** Token getter function */
  getToken?: () => string | null;
  /** Token refresh function */
  refreshToken?: () => Promise<string | null>;
  /** Request interceptors */
  requestInterceptors?: RequestInterceptor[];
  /** Response interceptors */
  responseInterceptors?: ResponseInterceptor[];
  /** Error interceptors */
  errorInterceptors?: ErrorInterceptor[];
}

/**
 * Streaming response handler
 */
export type StreamHandler<T> = (chunk: T) => void;

/**
 * Streaming request configuration
 */
export interface StreamRequestConfig extends RequestConfig {
  /** Handler for stream chunks */
  onChunk?: StreamHandler<string>;
  /** Handler for stream completion */
  onComplete?: () => void;
  /** Handler for stream errors */
  onError?: (error: Error) => void;
}

/**
 * Parsed error response
 */
export interface ParsedError {
  /** Error message */
  message: string;
  /** Error code if available */
  code?: string;
  /** HTTP status */
  status: number;
  /** Raw error response */
  response?: ApiErrorResponse;
}

