import {
  CompareIntelApiClient,
  fetchCreditBalance,
  fetchCurrentUser,
  fetchModels,
  type CreditBalance,
  type ModelInfo,
  type User,
} from '@compareintel/core'

import { authStorage } from '../shared/authStorage'

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'https://compareintel.com/api'

export function getWebAppUrl(): string {
  const configured = import.meta.env.VITE_WEB_APP_URL
  if (configured) return configured

  if (API_BASE_URL.includes('localhost:8000')) {
    return 'http://localhost:5173'
  }

  return API_BASE_URL.replace(/\/api\/?$/, '') || 'https://compareintel.com'
}

export { authStorage }

export const apiClient = new CompareIntelApiClient({
  baseUrl: API_BASE_URL,
  authStorage,
  clientSource: 'extension',
})

export async function extensionLogout(): Promise<void> {
  await authStorage.clearTokens()
}

export async function loadModels(): Promise<Record<string, ModelInfo[]>> {
  const data = await fetchModels(apiClient)
  return data.models_by_provider
}

export async function loadCreditBalance(fingerprint?: string): Promise<CreditBalance> {
  return fetchCreditBalance(apiClient, fingerprint)
}

export async function fetchCurrentUserFromApi(): Promise<User | null> {
  return fetchCurrentUser(apiClient)
}

export async function getAuthTokens(): Promise<{
  accessToken: string | null
  refreshToken: string | null
}> {
  return {
    accessToken: await authStorage.getAccessToken(),
    refreshToken: await authStorage.getRefreshToken(),
  }
}
