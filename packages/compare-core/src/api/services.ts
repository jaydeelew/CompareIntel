import type { CompareIntelApiClient } from './client'

export interface ModelInfo {
  id: string
  name: string
  provider: string
  tier_access?: 'unregistered' | 'free' | 'paid'
  trial_unlocked?: boolean
  available?: boolean
  supports_vision?: boolean
  supports_web_search?: boolean
  supports_image_generation?: boolean
  knowledge_cutoff?: string | null
}

export interface ModelsResponse {
  models_by_provider: Record<string, ModelInfo[]>
}

export interface CompareRequest {
  input_data: string
  models: string[]
  conversation_history?: Array<{ role: string; content: string; model_id?: string }>
  browser_fingerprint?: string
  conversation_id?: number
  enable_web_search?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number | null
  client_source?: string
}

export interface RateLimitStatus {
  daily_usage: number
  daily_limit: number
  remaining_usage: number
  subscription_tier: string
  model_limit: number
  user_type: 'authenticated' | 'anonymous'
  fingerprint_usage?: number
  fingerprint_remaining?: number
  /** Credits-based fields (primary; legacy comparison fields are always 0). */
  credits_allocated?: number
  credits_used_this_period?: number
  credits_used_today?: number
  credits_remaining?: number
}

export interface StreamEvent {
  type: string
  /** Model ID — backend sends this as `model`, not `model_id` */
  model?: string
  model_id?: string
  content?: string
  message?: string
  error?: boolean | string
  url?: string
  metadata?: Record<string, unknown>
  conversation_id?: number
  [key: string]: unknown
}

export function getEventModelId(event: StreamEvent): string | undefined {
  const id = event.model ?? event.model_id
  return typeof id === 'string' && id.trim() ? id.trim() : undefined
}

export interface User {
  id: number
  email: string
  subscription_tier: string
  is_verified: boolean
  monthly_credits_allocated?: number
  credits_used_this_period?: number
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user?: User
}

export async function fetchModels(client: CompareIntelApiClient): Promise<ModelsResponse> {
  return client.get<ModelsResponse>('/models', true)
}

export async function fetchRateLimitStatus(
  client: CompareIntelApiClient,
  fingerprint?: string
): Promise<RateLimitStatus> {
  const params = new URLSearchParams()
  if (fingerprint) {
    params.append('fingerprint', fingerprint)
  }
  try {
    params.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    // timezone unavailable in some environments
  }
  const qs = params.toString()
  return client.get<RateLimitStatus>(`/rate-limit-status${qs ? `?${qs}` : ''}`)
}

export async function login(
  client: CompareIntelApiClient,
  email: string,
  password: string
): Promise<AuthResponse> {
  return client.post<AuthResponse>('/auth/login', { email, password }, true)
}

export async function register(
  client: CompareIntelApiClient,
  email: string,
  password: string
): Promise<AuthResponse> {
  return client.post<AuthResponse>('/auth/register', { email, password }, true)
}

export async function fetchCurrentUser(client: CompareIntelApiClient): Promise<User | null> {
  try {
    return await client.get<User>('/auth/me')
  } catch {
    return null
  }
}

export function* parseSSEEvents(chunks: AsyncGenerator<string>): AsyncGenerator<StreamEvent> {
  return (async function* () {
    for await (const chunk of chunks) {
      if (!chunk.trim() || chunk === '[DONE]') continue
      try {
        yield JSON.parse(chunk) as StreamEvent
      } catch {
        // skip malformed
      }
    }
  })()
}
