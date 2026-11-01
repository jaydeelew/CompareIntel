export const MAX_AUTH_TOKEN_CHARS = 8192

export function senderWebOrigin(sender: { url?: string; origin?: string }): string | undefined {
  if (sender.url) {
    try {
      return new URL(sender.url).origin
    } catch {
      return undefined
    }
  }
  return sender.origin
}

export function isPlausibleAuthToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_AUTH_TOKEN_CHARS
}

export function parseCiAuthTokens(
  message: unknown,
): { accessToken: string; refreshToken: string } | null {
  if (!message || typeof message !== 'object') return null
  const typed = message as { type?: unknown; access_token?: unknown; refresh_token?: unknown }
  if (typed.type !== 'CI_AUTH') return null
  if (!isPlausibleAuthToken(typed.access_token) || !isPlausibleAuthToken(typed.refresh_token)) {
    return null
  }
  return { accessToken: typed.access_token, refreshToken: typed.refresh_token }
}

export function parseCiClaimHandoffNonce(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null
  const typed = message as { type?: unknown; nonce?: unknown }
  if (typed.type !== 'CI_CLAIM_HANDOFF') return null
  if (typeof typed.nonce !== 'string' || typed.nonce.length < 8 || typed.nonce.length > 128) {
    return null
  }
  return typed.nonce
}
