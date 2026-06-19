import type { AuthStorage, AuthTokens } from './types'

const ACCESS_KEY = 'compareintel_access_token'
const REFRESH_KEY = 'compareintel_refresh_token'

export interface SessionStorageLike {
  get(keys: string[]): Promise<Record<string, string | undefined>>
  set(items: Record<string, string>): Promise<void>
  remove(keys: string[]): Promise<void>
}

/** Chrome extension auth: Bearer tokens in chrome.storage.session. */
export class BearerAuthStorage implements AuthStorage {
  constructor(private readonly storage: SessionStorageLike) {}

  getAuthMode(): 'bearer' {
    return 'bearer'
  }

  async getAccessToken(): Promise<string | null> {
    const result = await this.storage.get([ACCESS_KEY])
    return result[ACCESS_KEY] ?? null
  }

  async getRefreshToken(): Promise<string | null> {
    const result = await this.storage.get([REFRESH_KEY])
    return result[REFRESH_KEY] ?? null
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    await this.storage.set({
      [ACCESS_KEY]: tokens.accessToken,
      [REFRESH_KEY]: tokens.refreshToken,
    })
  }

  async clearTokens(): Promise<void> {
    await this.storage.remove([ACCESS_KEY, REFRESH_KEY])
  }
}
