/**
 * Request and response interceptors for API client
 * 
 * Provides hooks for modifying requests and responses,
 * handling authentication, logging, and error transformation.
 */

import type {
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  RequestConfig,
} from './types';
import { ApiError, NetworkError, TimeoutError } from './errors';
import type { ApiErrorResponse } from '../../types/api';

/**
 * Default request interceptor: Ensure credentials are included for cookie-based auth
 * 
 * Note: With HTTP-only cookies, tokens are automatically sent by the browser.
 * We just need to ensure credentials: 'include' is set for cross-origin requests.
 */
export const authInterceptor: RequestInterceptor = async (url, config) => {
  // Skip if auth is disabled for this request
  if (config.skipAuth) {
    return [url, config];
  }

  // Ensure credentials are included for cookie-based authentication
  // Cookies are automatically sent by the browser, no need to manually add Authorization header
  const enhancedConfig = {
    ...config,
    credentials: 'include' as RequestCredentials,
  };

  return [url, enhancedConfig];
};

/**
 * Request interceptor: Add default headers
 */
export const defaultHeadersInterceptor: RequestInterceptor = async (url, config) => {
  const headers = new Headers(config.headers);
  
  // Add Content-Type if not present and body exists
  if (config.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Add Accept header
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  return [url, { ...config, headers }];
};

/**
 * Request interceptor: Add request timeout
 * 
 * Note: Streaming requests (detected by presence of onChunk) do not get a timeout,
 * as they should only timeout if no data is received for a period, not from the start.
 */
export const timeoutInterceptor: RequestInterceptor = async (url, config) => {
  // Skip timeout for streaming requests - they handle timeout differently
  // (only timeout if no chunks received for a period, not from request start)
  if ('onChunk' in config) {
    return [url, config];
  }

  const timeout = config.timeout ?? 60000; // Default 60 seconds

  // Create abort controller if not provided
  const controller = config.signal
    ? undefined
    : new AbortController();

  // Set timeout
  const timeoutId = timeout > 0
    ? setTimeout(() => {
        controller?.abort();
      }, timeout)
    : undefined;

  // Store timeout ID for cleanup
  const enhancedConfig: RequestConfig = {
    ...config,
    signal: config.signal || controller?.signal,
    // Store cleanup function
    ...(timeoutId && { _timeoutId: timeoutId }),
  };

  return [url, enhancedConfig];
};

/**
 * Response interceptor: Parse JSON responses
 */
export const jsonResponseInterceptor: ResponseInterceptor = async (
  response: Response,
  config: RequestConfig
) => {
  // For streaming responses, return as-is (checked via StreamRequestConfig)
  if ((config as any).onChunk) {
    return response;
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    // If no content or not JSON, try to parse as text or return empty
    if (response.status === 204 || response.status === 205) {
      return response;
    }
  }

  return response;
};

/**
 * Response interceptor: Handle errors
 */
export const errorResponseInterceptor: ResponseInterceptor = async (
  response: Response,
  _config: RequestConfig
) => {
  if (!response.ok) {
    // Try to parse error response
    let errorData: ApiErrorResponse | undefined;
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        errorData = await response.json();
      }
    } catch {
      // Failed to parse JSON, use default error
    }

    const message = errorData?.detail || errorData?.code || response.statusText || 'Request failed';
    
    // Create appropriate error based on status code
    if (response.status === 401) {
      throw new ApiError(message, 401, 'Unauthorized', errorData);
    } else if (response.status === 403) {
      throw new ApiError(message, 403, 'Forbidden', errorData);
    } else if (response.status === 404) {
      throw new ApiError(message, 404, 'Not Found', errorData);
    } else if (response.status === 422) {
      throw new ApiError(message, 422, 'Unprocessable Entity', errorData);
    } else if (response.status === 429) {
      throw new ApiError(
        message,
        429,
        'Too Many Requests',
        errorData,
        undefined
      );
    } else if (response.status >= 500) {
      throw new ApiError(
        message,
        response.status,
        response.statusText,
        errorData
      );
    } else {
      throw new ApiError(
        message,
        response.status,
        response.statusText,
        errorData
      );
    }
  }

  return response;
};

/**
 * Error interceptor: Transform network errors
 */
export const networkErrorInterceptor: ErrorInterceptor = async (error, config) => {
  // Handle AbortError (timeout or cancellation)
  if (error.name === 'AbortError') {
    // Check if it was a timeout
    if (config.timeout) {
      return new TimeoutError(`Request timeout after ${config.timeout}ms`, config.timeout);
    }
    // Otherwise it was cancelled
    return error;
  }

  // Handle fetch errors (network errors)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new NetworkError('Network error: Failed to fetch', error);
  }

  return error;
};

/**
 * Error interceptor: Log errors (development only)
 * Suppresses expected 401 errors for auth endpoints (anonymous users)
 */
export const loggingErrorInterceptor: ErrorInterceptor = async (error, config) => {
  if (import.meta.env.DEV) {
    const status = (error as any).status;
    const url = (config as any)._url || '';
    
    // Suppress expected 401 errors for auth endpoints (anonymous users)
    // These are handled gracefully by AuthContext
    if (status === 401 && (url.includes('/auth/me') || url.includes('/auth/refresh'))) {
      // Silently skip logging - these are expected for anonymous users
      return error;
    }
    
    console.error('[API Client Error]', {
      error: error.message,
      method: config.method || 'GET',
      status,
      url,
    });
  }
  return error;
};

/**
 * Request interceptor: Log requests (development only)
 */
export const loggingRequestInterceptor: RequestInterceptor = async (url, config) => {
  if (import.meta.env.DEV) {
    const headers = config.headers ? new Headers(config.headers) : new Headers();
    const headerEntries: [string, string][] = [];
    headers.forEach((value, key) => {
      headerEntries.push([key, value]);
    });
    console.log('[API Request]', {
      method: config.method || 'GET',
      url,
      headers: Object.fromEntries(headerEntries),
    });
  }
  return [url, config];
};

/**
 * Response interceptor: Log responses (development only)
 */
export const loggingResponseInterceptor: ResponseInterceptor = async (response, _config) => {
  if (import.meta.env.DEV) {
    console.log('[API Response]', {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
    });
  }
  return response;
};

