/**
 * Web app auth storage — HttpOnly cookies (see authInterceptor).
 */
export type AuthMode = 'cookie' | 'bearer'

let authMode: AuthMode = 'cookie'
let bearerAccessToken: string | null = null

export function setAuthMode(mode: AuthMode): void {
  authMode = mode
}

export function setBearerAccessToken(token: string | null): void {
  bearerAccessToken = token
}

export function getAuthMode(): AuthMode {
  return authMode
}

export function getBearerAccessToken(): string | null {
  return bearerAccessToken
}
