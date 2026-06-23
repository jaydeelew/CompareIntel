import {
  BearerAuthStorage,
  CompareIntelApiClient,
  fetchCreditBalance,
  fetchCurrentUser,
  fetchModels,
  login,
  register,
  type AuthResponse,
  type CreditBalance,
  type ModelInfo,
  type User,
} from '@compareintel/core'
import browser from 'webextension-polyfill'

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

const chromeSessionStorage = {
  async get(keys: string[]) {
    return browser.storage.session.get(keys) as Promise<Record<string, string | undefined>>
  },
  async set(items: Record<string, string>) {
    await browser.storage.session.set(items)
  },
  async remove(keys: string[]) {
    await browser.storage.session.remove(keys)
  },
}

export const authStorage = new BearerAuthStorage(chromeSessionStorage)

export const apiClient = new CompareIntelApiClient({
  baseUrl: API_BASE_URL,
  authStorage,
  clientSource: 'extension',
})

export async function extensionLogin(email: string, password: string): Promise<User | null> {
  const response: AuthResponse = await login(apiClient, email, password)
  await authStorage.setTokens({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
  })
  return response.user ?? (await fetchCurrentUser(apiClient))
}

export async function extensionRegister(email: string, password: string): Promise<User | null> {
  const response: AuthResponse = await register(apiClient, email, password)
  await authStorage.setTokens({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
  })
  return response.user ?? (await fetchCurrentUser(apiClient))
}

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
