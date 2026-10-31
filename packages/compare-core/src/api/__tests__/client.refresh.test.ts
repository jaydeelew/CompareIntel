import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthStorage } from '../../auth/types'
import { CompareIntelApiClient } from '../client'

function memoryAuth(): AuthStorage & { access: string | null; refresh: string | null } {
  const auth = {
    access: 'old-access' as string | null,
    refresh: 'old-refresh' as string | null,
    getAuthMode: () => 'bearer' as const,
    getAccessToken: async () => auth.access,
    getRefreshToken: async () => auth.refresh,
    setTokens: async (tokens: { accessToken: string; refreshToken: string }) => {
      auth.access = tokens.accessToken
      auth.refresh = tokens.refreshToken
    },
    clearTokens: async () => {
      auth.access = null
      auth.refresh = null
    },
  }
  return auth
}

describe('CompareIntelApiClient refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clears access and refresh tokens when /auth/refresh returns 401', async () => {
    const auth = memoryAuth()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 401 }))
      .mockResolvedValueOnce(new Response('expired', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new CompareIntelApiClient({ baseUrl: 'https://compareintel.com/api', authStorage: auth })
    await expect(client.get('/me')).rejects.toMatchObject({ status: 401 })
    expect(auth.access).toBeNull()
    expect(auth.refresh).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/auth/refresh')
  })
})
