/**
 * Credit Service
 *
 * Handles credit-related API calls for the credits-based system
 */

import { apiClient } from './api/client'

/**
 * Credit balance information
 */
export interface CreditBalance {
  /** Credits allocated for current period */
  credits_allocated: number
  /** Credits used this period (for authenticated users) */
  credits_used_this_period?: number
  /** Credits used today (for unregistered users) */
  credits_used_today?: number
  /** Credits remaining */
  credits_remaining: number
  /** Total credits used (lifetime) */
  total_credits_used?: number
  /** When credits reset (ISO timestamp) */
  credits_reset_at?: string
  /** Billing period start (ISO timestamp, for paid tiers) */
  billing_period_start?: string
  /** Billing period end (ISO timestamp, for paid tiers) */
  billing_period_end?: string
  /** Period type: 'daily' or 'monthly' */
  period_type: 'daily' | 'monthly'
  /** Subscription tier */
  subscription_tier: string
}

/**
 * Credit usage history entry
 */
export interface CreditUsageEntry {
  /** Usage log ID */
  id: number
  /** When this usage occurred (ISO timestamp) */
  created_at: string
  /** Models used in this request */
  models_used: string[]
  /** Number of successful models */
  models_successful: number
  /** Number of failed models */
  models_failed: number
  /** Credits used for this request */
  credits_used: number | null
  /** Input tokens used */
  input_tokens: number | null
  /** Output tokens used */
  output_tokens: number | null
  /** Total tokens used */
  total_tokens: number | null
  /** Effective tokens used */
  effective_tokens: number | null
  /** Processing time in milliseconds */
  processing_time_ms: number | null
}

/**
 * Credit usage history response
 */
export interface CreditUsageHistory {
  /** Total number of entries */
  total: number
  /** Current page number */
  page: number
  /** Items per page */
  per_page: number
  /** Total number of pages */
  total_pages: number
  /** Usage entries */
  results: CreditUsageEntry[]
}

/**
 * Credit estimation request
 */
export interface CreditEstimateRequest {
  /** Input prompt text */
  input_data: string
  /** List of model IDs */
  models: string[]
  /** Optional conversation history */
  conversation_history?: Array<{ role: string; content: string; model_id?: string }>
}

/**
 * Credit estimation response
 */
export interface CreditEstimate {
  /** Estimated credits needed */
  estimated_credits: number
  /** Current credits remaining */
  credits_remaining: number
  /** Credits allocated for current period */
  credits_allocated: number
  /** Whether user has sufficient credits */
  is_sufficient: boolean
  /** Breakdown of estimation */
  breakdown: {
    /** Number of models */
    num_models: number
    /** Input length in characters */
    input_length: number
    /** Conversation history length */
    conversation_history_length: number
  }
}

/**
 * Get current credit balance
 *
 * @param fingerprint - Optional browser fingerprint for unregistered users
 */
export async function getCreditBalance(fingerprint?: string): Promise<CreditBalance> {
  // Auto-detect timezone from browser
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const params = new URLSearchParams()
  if (fingerprint) {
    params.append('fingerprint', fingerprint)
  }
  params.append('timezone', userTimezone)
  const queryString = params.toString()
  const response = await apiClient.get<CreditBalance>(
    `/credits/balance${queryString ? `?${queryString}` : ''}`
  )
  return response.data
}

/**
 * Get credit usage history
 */
export async function getCreditUsage(
  page: number = 1,
  perPage: number = 50
): Promise<CreditUsageHistory> {
  const params = new URLSearchParams()
  params.append('page', String(page))
  params.append('per_page', String(perPage))
  const queryString = params.toString()
  const response = await apiClient.get<CreditUsageHistory>(
    `/credits/usage${queryString ? `?${queryString}` : ''}`
  )
  return response.data
}

/**
 * Estimate credits needed for a request
 */
export async function estimateCredits(request: CreditEstimateRequest): Promise<CreditEstimate> {
  const response = await apiClient.post<CreditEstimate>('/credits/estimate', request)
  return response.data
}
