import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionStore = new Map<string, string>()
const localStore = new Map<string, string>()
const setAccessLevel = vi.fn().mockResolvedValue(undefined)

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      session: {
        get: async (keys: string[]) => {
          const out: Record<string, string> = {}
          for (const key of keys) {
            const value = sessionStore.get(key)
            if (value != null) out[key] = value
          }
          return out
        },
        set: async (items: Record<string, string>) => {
          for (const [key, value] of Object.entries(items)) sessionStore.set(key, value)
        },
        remove: async (keys: string[]) => {
          for (const key of keys) sessionStore.delete(key)
        },
      },
      local: {
        get: async (keys: string[]) => {
          const out: Record<string, string> = {}
          for (const key of keys) {
            const value = localStore.get(key)
            if (value != null) out[key] = value
          }
          return out
        },
        set: async (items: Record<string, string>) => {
          for (const [key, value] of Object.entries(items)) localStore.set(key, value)
        },
        remove: async (keys: string[]) => {
          for (const key of keys) localStore.delete(key)
        },
      },
    },
  },
}))

vi.stubGlobal('chrome', {
  storage: { local: { setAccessLevel } },
})

import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  authStorage,
  lockRefreshTokenToTrustedContexts,
} from '../authStorage'

describe('authStorage', () => {
  beforeEach(() => {
    sessionStore.clear()
    localStore.clear()
    setAccessLevel.mockClear()
  })

  it('keeps the access token in session storage and the refresh token in local storage', async () => {
    await authStorage.setTokens({ accessToken: 'access', refreshToken: 'refresh' })
    expect(sessionStore.get(ACCESS_TOKEN_KEY)).toBe('access')
    expect(sessionStore.get(REFRESH_TOKEN_KEY)).toBeUndefined()
    expect(localStore.get(REFRESH_TOKEN_KEY)).toBe('refresh')
    expect(localStore.get(ACCESS_TOKEN_KEY)).toBeUndefined()
    expect(await authStorage.getAccessToken()).toBe('access')
    expect(await authStorage.getRefreshToken()).toBe('refresh')
  })

  it('locks local storage to trusted contexts', async () => {
    await lockRefreshTokenToTrustedContexts()
    expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' })
  })

  it('clears both tokens', async () => {
    await authStorage.setTokens({ accessToken: 'access', refreshToken: 'refresh' })
    await authStorage.clearTokens()
    expect(await authStorage.getAccessToken()).toBeNull()
    expect(await authStorage.getRefreshToken()).toBeNull()
  })
})
