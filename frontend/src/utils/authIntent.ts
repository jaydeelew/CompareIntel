/**
 * Auth intent helpers.
 *
 * Pages such as /pricing send signed-out users to `/?showAuthModal=signup|login`.
 * The home page opens the existing auth modal for that param. When the user came
 * from a "Subscribe" click, the chosen tier and return path are kept in
 * sessionStorage so they can be sent back (and into checkout) after authenticating.
 */

export const SHOW_AUTH_MODAL_PARAM = 'showAuthModal'

export type AuthModalParamMode = 'signup' | 'login'

const PENDING_INTENT_KEY = 'compareintel:pendingAuthIntent'
const PENDING_INTENT_TTL_MS = 15 * 60 * 1000

export interface PendingAuthIntent {
  returnTo: string
  tier?: string
  createdAt: number
}

export function buildAuthModalPath(mode: AuthModalParamMode): string {
  return `/?${SHOW_AUTH_MODAL_PARAM}=${mode}`
}

export function parseAuthModalParam(search: string): AuthModalParamMode | null {
  const value = new URLSearchParams(search).get(SHOW_AUTH_MODAL_PARAM)
  return value === 'signup' || value === 'login' ? value : null
}

export function stripAuthModalParam(search: string): string {
  const params = new URLSearchParams(search)
  params.delete(SHOW_AUTH_MODAL_PARAM)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

export function savePendingAuthIntent(intent: Omit<PendingAuthIntent, 'createdAt'>): void {
  try {
    const payload: PendingAuthIntent = { ...intent, createdAt: Date.now() }
    sessionStorage.setItem(PENDING_INTENT_KEY, JSON.stringify(payload))
  } catch {
    // sessionStorage can be unavailable (private mode); the redirect is best-effort.
  }
}

export function peekPendingAuthIntent(): PendingAuthIntent | null {
  try {
    const raw = sessionStorage.getItem(PENDING_INTENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingAuthIntent>
    if (
      typeof parsed.returnTo !== 'string' ||
      !parsed.returnTo.startsWith('/') ||
      parsed.returnTo.startsWith('//') ||
      typeof parsed.createdAt !== 'number' ||
      Date.now() - parsed.createdAt > PENDING_INTENT_TTL_MS
    ) {
      clearPendingAuthIntent()
      return null
    }
    return {
      returnTo: parsed.returnTo,
      tier: typeof parsed.tier === 'string' ? parsed.tier : undefined,
      createdAt: parsed.createdAt,
    }
  } catch {
    return null
  }
}

export function clearPendingAuthIntent(): void {
  try {
    sessionStorage.removeItem(PENDING_INTENT_KEY)
  } catch {
    // ignore
  }
}
