/**
 * API request and response types for CompareIntel
 *
 * These types define the structure of API requests and responses
 * used throughout the application.
 */

import type { ModelId } from './branded'
import type { StoredMessage } from './conversation'

/**
 * Streaming event types from the server
 */
export const STREAM_EVENT_TYPE = {
  START: 'start',
  CHUNK: 'chunk',
  DONE: 'done',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const

export type StreamEventType = (typeof STREAM_EVENT_TYPE)[keyof typeof STREAM_EVENT_TYPE]

/**
 * Server-Sent Event (SSE) message structure
 */
export interface StreamEvent {
  /** Type of event */
  type: StreamEventType
  /** Model ID (for start, chunk, done events) */
  model?: ModelId
  /** Content chunk (for chunk events) */
  content?: string
  /** Error message (for error events) */
  message?: string
  /** Final metadata (for complete events) */
  metadata?: {
    input_length: number
    models_requested: number
    models_successful: number
    models_failed: number
    timestamp: string
    processing_time_ms?: number
  }
}

/**
 * Request body for comparison endpoint
 */
export interface CompareRequest {
  /** Input data to compare */
  input_data: string
  /** Array of model IDs to use for comparison */
  models: ModelId[]
  /** Optional conversation history */
  conversation_history?: StoredMessage[]
  /** Browser fingerprint for usage tracking */
  browser_fingerprint?: string
}

/**
 * Error response from API
 */
export interface ApiErrorResponse {
  /** Error detail message */
  detail: string
  /** Optional error code */
  code?: string
}

/**
 * Browser fingerprint data structure
 */
export interface BrowserFingerprint {
  userAgent: string
  language: string
  platform: string
  screenResolution: string
  timezone: string
  canvas: string
  colorDepth: number
  hardwareConcurrency: number
}
