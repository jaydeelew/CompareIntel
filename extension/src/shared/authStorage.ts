import { BearerAuthStorage } from '@compareintel/core/auth/bearerAuth'
import browser from 'webextension-polyfill'

const chromeLocalStorage = {
  async get(keys: string[]) {
    return browser.storage.local.get(keys) as Promise<Record<string, string | undefined>>
  },
  async set(items: Record<string, string>) {
    await browser.storage.local.set(items)
  },
  async remove(keys: string[]) {
    await browser.storage.local.remove(keys)
  },
}

export const authStorage = new BearerAuthStorage(chromeLocalStorage)

export const AUTH_TOKEN_KEYS = ['compareintel_access_token', 'compareintel_refresh_token'] as const
