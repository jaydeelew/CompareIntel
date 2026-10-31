import { BearerAuthStorage } from '@compareintel/core'
import browser from 'webextension-polyfill'

export const ACCESS_TOKEN_KEY = 'compareintel_access_token'
export const REFRESH_TOKEN_KEY = 'compareintel_refresh_token'
export const AUTH_TOKEN_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY] as const

type StorageArea = {
  get: (keys: string[]) => Promise<Record<string, unknown>>
  set: (items: Record<string, string>) => Promise<void>
  remove: (keys: string[]) => Promise<void>
}

function wrapArea(area: {
  get: (keys: string | string[]) => Promise<Record<string, unknown>>
  set: (items: Record<string, unknown>) => Promise<void>
  remove: (keys: string | string[]) => Promise<void>
}): StorageArea {
  return {
    async get(keys) {
      return area.get(keys)
    },
    async set(items) {
      await area.set(items)
    },
    async remove(keys) {
      await area.remove(keys)
    },
  }
}

const sessionArea = wrapArea(browser.storage.session)
const localArea = wrapArea(browser.storage.local)

/** Access token lives in session; refresh token lives in local (trusted contexts only). */
const splitTokenStorage = {
  async get(keys: string[]) {
    const accessKeys = keys.filter((key) => key === ACCESS_TOKEN_KEY)
    const refreshKeys = keys.filter((key) => key === REFRESH_TOKEN_KEY)
    const [access, refresh] = await Promise.all([
      accessKeys.length > 0 ? sessionArea.get(accessKeys) : Promise.resolve({}),
      refreshKeys.length > 0 ? localArea.get(refreshKeys) : Promise.resolve({}),
    ])
    return {
      ...(access as Record<string, string | undefined>),
      ...(refresh as Record<string, string | undefined>),
    }
  },
  async set(items: Record<string, string>) {
    const sessionItems: Record<string, string> = {}
    const localItems: Record<string, string> = {}
    if (ACCESS_TOKEN_KEY in items) sessionItems[ACCESS_TOKEN_KEY] = items[ACCESS_TOKEN_KEY]
    if (REFRESH_TOKEN_KEY in items) localItems[REFRESH_TOKEN_KEY] = items[REFRESH_TOKEN_KEY]
    await Promise.all([
      Object.keys(sessionItems).length > 0 ? sessionArea.set(sessionItems) : Promise.resolve(),
      Object.keys(localItems).length > 0 ? localArea.set(localItems) : Promise.resolve(),
    ])
  },
  async remove(keys: string[]) {
    const accessKeys = keys.filter((key) => key === ACCESS_TOKEN_KEY)
    const refreshKeys = keys.filter((key) => key === REFRESH_TOKEN_KEY)
    await Promise.all([
      accessKeys.length > 0 ? sessionArea.remove(accessKeys) : Promise.resolve(),
      refreshKeys.length > 0 ? localArea.remove(refreshKeys) : Promise.resolve(),
    ])
  },
}

export async function lockRefreshTokenToTrustedContexts(): Promise<void> {
  try {
    await chrome.storage?.local?.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
  } catch {
    // Firefox and older Chrome do not support setAccessLevel.
  }
}

void lockRefreshTokenToTrustedContexts()

export const authStorage = new BearerAuthStorage(splitTokenStorage)
