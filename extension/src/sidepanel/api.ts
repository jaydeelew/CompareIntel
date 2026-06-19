import {
  BearerAuthStorage,
  CompareIntelApiClient,
  fetchCurrentUser,
  fetchModels,
  fetchRateLimitStatus,
  login,
  register,
  type AuthResponse,
  type ModelInfo,
  type RateLimitStatus,
  type User,
} from '@compareintel/core'
import browser from 'webextension-polyfill'

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'https://compareintel.com/api'

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

export async function loadRateLimitStatus(fingerprint?: string): Promise<RateLimitStatus> {
  return fetchRateLimitStatus(apiClient, fingerprint)
}

export async function fetchCurrentUserFromApi(): Promise<User | null> {
  return fetchCurrentUser(apiClient)
}
