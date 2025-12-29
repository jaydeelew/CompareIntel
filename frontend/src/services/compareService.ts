/**
 * Comparison Service
 *
 * Handles all comparison-related API endpoints including:
 * - Standard comparison requests
 * - Streaming comparison requests (SSE)
 * - Rate limit status
 */

import type { StreamEvent } from '../types'
import { STREAM_EVENT_TYPE } from '../types'

import { apiClient } from './api/client'

/**
 * Request body for comparison endpoint
 */
export interface CompareRequestPayload {
  input_data: string
  models: string[]
  conversation_history?: Array<{ role: string; content: string; model_id?: string }>
  browser_fingerprint?: string
  conversation_id?: number
  estimated_input_tokens?: number // Optional: Accurate token count from /estimate-tokens endpoint
  timezone?: string // Optional: IANA timezone string (e.g., "America/Chicago") for credit reset timing
  enable_web_search?: boolean // Optional: Enable web search tool for models that support it
}

/**
 * Rate limit status response
 */
export interface RateLimitStatus {
  daily_usage: number
  daily_limit: number
  remaining_usage: number
  subscription_tier: string
  model_limit: number
  overage_allowed: boolean
  overage_price: number | null
  monthly_overage_count: number
  reset_time: string
  user_type: 'authenticated' | 'anonymous'
  // Optional fields for anonymous users
  fingerprint_usage?: number
  fingerprint_remaining?: number
  ip_usage?: number
}

/**
 * Anonymous mock mode status
 */
export interface AnonymousMockModeStatus {
  anonymous_mock_mode_enabled: boolean
  is_development: boolean
}

/**
 * Model statistics response
 */
export interface ModelStats {
  [modelId: string]: {
    success: number
    failure: number
    last_error: string | null
    last_success: string | null
  }
}

/**
 * Perform a streaming comparison using Server-Sent Events (SSE)
 *
 * Returns a ReadableStream that can be processed manually, or use
 * processStreamEvents() helper to process with callbacks.
 *
 * @param payload - Comparison request payload
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Promise resolving to the readable stream
 * @throws {ApiError} If the request fails
 */
export async function compareStream(
  payload: CompareRequestPayload,
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array> | null> {
  return apiClient.stream('/compare-stream', payload, { signal })
}

/**
 * Process a streaming response and call callbacks for each event
 *
 * This helper function reads from a ReadableStream and processes
 * SSE events, calling the appropriate callbacks.
 *
 * @param stream - ReadableStream from compareStream()
 * @param callbacks - Callbacks for stream events
 * @returns Promise that resolves when stream processing completes
 */
export async function processStreamEvents(
  stream: ReadableStream<Uint8Array> | null,
  callbacks: {
    onStart?: (model: string) => void
    onChunk?: (model: string, content: string) => void
    onDone?: (model: string) => void
    onComplete?: (metadata: StreamEvent['metadata']) => void
    onError?: (error: Error) => void
  }
): Promise<void> {
  if (!stream) {
    if (callbacks.onError) {
      callbacks.onError(new Error('Stream is null'))
    }
    return
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE messages (separated by \n\n)
      const messages = buffer.split('\n\n')
      buffer = messages.pop() || '' // Keep incomplete message in buffer

      for (const message of messages) {
        if (!message.trim() || !message.startsWith('data: ')) continue

        try {
          const jsonStr = message.replace(/^data: /, '')
          const event: StreamEvent = JSON.parse(jsonStr)

          switch (event.type) {
            case STREAM_EVENT_TYPE.START:
              if (event.model && callbacks.onStart) {
                callbacks.onStart(event.model)
              }
              break

            case STREAM_EVENT_TYPE.CHUNK:
              if (event.model && event.content && callbacks.onChunk) {
                callbacks.onChunk(event.model, event.content)
              }
              break

            case STREAM_EVENT_TYPE.KEEPALIVE:
              // Keepalive events reset timeout but don't add to content
              // The frontend App.tsx handles these directly, so no callback needed here
              // This is just for completeness in the service layer
              break

            case STREAM_EVENT_TYPE.DONE:
              if (event.model && callbacks.onDone) {
                callbacks.onDone(event.model)
              }
              break

            case STREAM_EVENT_TYPE.COMPLETE:
              if (event.metadata && callbacks.onComplete) {
                callbacks.onComplete(event.metadata)
              }
              break

            case STREAM_EVENT_TYPE.ERROR:
              if (event.message && callbacks.onError) {
                callbacks.onError(new Error(event.message))
              }
              break
          }
        } catch (parseError) {
          console.error('Error parsing SSE message:', parseError, message)
          if (callbacks.onError) {
            callbacks.onError(parseError as Error)
          }
        }
      }
    }
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error as Error)
    }
    throw error
  } finally {
    reader.releaseLock()
  }
}

/**
 * Get current rate limit status for the user
 *
 * Uses short-term caching (30 seconds) to prevent duplicate requests
 * while still keeping data relatively fresh.
 *
 * @param fingerprint - Optional browser fingerprint for anonymous users
 * @returns Promise resolving to rate limit status
 * @throws {ApiError} If the request fails
 */
export async function getRateLimitStatus(fingerprint?: string): Promise<RateLimitStatus> {
  // Auto-detect timezone from browser
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const params = new URLSearchParams()
  if (fingerprint) {
    params.append('fingerprint', fingerprint)
  }
  params.append('timezone', userTimezone)
  const queryString = params.toString()
  const cacheKey = fingerprint
    ? `GET:/rate-limit-status?fingerprint=${encodeURIComponent(fingerprint)}&timezone=${userTimezone}`
    : `GET:/rate-limit-status?timezone=${userTimezone}`

  const response = await apiClient.get<RateLimitStatus>(`/rate-limit-status?${queryString}`, {
    // Cache for 30 seconds - balances freshness with deduplication
    cacheTTL: 30 * 1000,
    _cacheKey: cacheKey,
  })
  return response.data
}

/**
 * Get anonymous mock mode status (development only)
 *
 * Uses caching since this is relatively static configuration data.
 *
 * @returns Promise resolving to mock mode status
 * @throws {ApiError} If the request fails
 */
export async function getAnonymousMockModeStatus(): Promise<AnonymousMockModeStatus> {
  const response = await apiClient.get<AnonymousMockModeStatus>('/anonymous-mock-mode-status', {
    // Cache for 5 minutes - mock mode status changes infrequently
    cacheTTL: 5 * 60 * 1000,
    _cacheKey: 'GET:/anonymous-mock-mode-status',
  })
  return response.data
}

/**
 * Get model statistics
 *
 * @returns Promise resolving to model statistics
 * @throws {ApiError} If the request fails
 */
export async function getModelStats(): Promise<ModelStats> {
  const response = await apiClient.get<{ model_stats: ModelStats }>('/model-stats')
  return response.data.model_stats
}

/**
 * Reset rate limit (development only)
 *
 * @param fingerprint - Optional browser fingerprint for anonymous users
 * @returns Promise resolving to success status
 * @throws {ApiError} If the request fails
 */
export async function resetRateLimit(fingerprint?: string): Promise<{ message: string }> {
  const payload = fingerprint ? { fingerprint } : {}
  const response = await apiClient.post<{ message: string }>('/dev/reset-rate-limit', payload)
  return response.data
}

/**
 * Request payload for token estimation
 */
export interface EstimateTokensRequestPayload {
  input_data: string
  model_id?: string
  conversation_history?: Array<{ role: string; content: string; model_id?: string }>
}

/**
 * Response from token estimation endpoint
 */
export interface EstimateTokensResponse {
  input_tokens: number
  conversation_history_tokens: number
  total_input_tokens: number
  model_id?: string | null
}

/**
 * Estimate token count for input text and optional conversation history
 *
 * Uses provider-specific tokenizers when available for accurate counting.
 * Designed for debounced API calls from the frontend.
 *
 * @param payload - Token estimation request payload
 * @returns Promise resolving to token counts
 * @throws {ApiError} If the request fails
 */
export async function estimateTokens(
  payload: EstimateTokensRequestPayload
): Promise<EstimateTokensResponse> {
  const response = await apiClient.post<EstimateTokensResponse>('/estimate-tokens', payload, {
    // Short cache TTL since token counts change frequently
    cacheTTL: 0, // No caching - always get fresh count
  })
  return response.data
}
