export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthStorage {
  getAccessToken(): Promise<string | null>
  getRefreshToken(): Promise<string | null>
  setTokens(tokens: AuthTokens): Promise<void>
  clearTokens(): Promise<void>
  getAuthMode(): 'cookie' | 'bearer'
}

export interface AuthStorageConfig {
  apiBaseUrl: string
}
