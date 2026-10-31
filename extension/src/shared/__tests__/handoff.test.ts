import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      session: {
        get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) store.set(key, value)
        },
        remove: async (key: string) => {
          store.delete(key)
        },
      },
    },
  },
}))

import { claimHandoffTokens, consumeHandoff, storeHandoff, stripHandoffSecrets } from '../handoff'

const payload = {
  input: 'hello',
  selectedModels: ['openai/gpt-4o'],
  results: [],
  conversationHistory: [],
  conversationId: null,
  accessToken: 'secret-access',
  refreshToken: 'secret-refresh',
}

describe('handoff', () => {
  beforeEach(() => {
    store.clear()
  })

  it('never includes tokens on the public payload', () => {
    expect(stripHandoffSecrets(payload, 'nonce-1')).toEqual({
      input: 'hello',
      selectedModels: ['openai/gpt-4o'],
      results: [],
      conversationHistory: [],
      conversationId: null,
      browserFingerprint: undefined,
      handoffNonce: 'nonce-1',
    })
  })

  it('stores tokens separately and returns them only via nonce claim', async () => {
    const nonce = await storeHandoff(payload, {
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
    })
    const publicPayload = await consumeHandoff()
    expect(publicPayload?.accessToken).toBeUndefined()
    expect(publicPayload?.refreshToken).toBeUndefined()
    expect(publicPayload?.handoffNonce).toBe(nonce)
    expect(publicPayload?.input).toBe('hello')

    expect(await claimHandoffTokens('wrong-nonce-value')).toBeNull()
    const claimed = await claimHandoffTokens(nonce)
    expect(claimed).toEqual({
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
    })
    expect(await claimHandoffTokens(nonce)).toBeNull()
  })
})
