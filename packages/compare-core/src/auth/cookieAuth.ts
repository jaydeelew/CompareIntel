import type { AuthStorage, AuthTokens } from './types'

/** Web app auth: HttpOnly cookies managed by the browser. */
export class CookieAuthStorage implements AuthStorage {
  getAuthMode(): 'cookie' {
    return 'cookie'
  }

  async getAccessToken(): Promise<string | null> {
    return null
  }

  async getRefreshToken(): Promise<string | null> {
    return null
  }

  async setTokens(_tokens: AuthTokens): Promise<void> {
    // Cookies are set by the backend response; nothing to store client-side.
  }

  async clearTokens(): Promise<void> {
    // Logout endpoint clears cookies.
  }
}
