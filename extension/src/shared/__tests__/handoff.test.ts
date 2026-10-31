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

import {
  bindHandoffTab,
  claimHandoffTokens,
  consumeHandoff,
  storeHandoff,
  stripHandoffSecrets,
} from '../handoff'

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

  it('creates nonces with crypto.randomUUID only', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    const nonce = await storeHandoff(payload)
    expect(randomUUID).toHaveBeenCalled()
    expect(nonce).toBe('11111111-1111-4111-8111-111111111111')
    randomUUID.mockRestore()
  })

  it('stores tokens separately and returns them only via nonce claim on the bound tab', async () => {
    const nonce = await storeHandoff(payload, {
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
    })
    expect(await consumeHandoff(42)).toBeNull()

    await bindHandoffTab(42)
    const publicPayload = await consumeHandoff(42)
    expect(publicPayload?.accessToken).toBeUndefined()
    expect(publicPayload?.refreshToken).toBeUndefined()
    expect(publicPayload?.handoffNonce).toBe(nonce)
    expect(publicPayload?.input).toBe('hello')
    expect(await consumeHandoff(99)).toBeNull()
    expect(await consumeHandoff()).toBeNull()

    expect(await claimHandoffTokens('wrong-nonce-value', 42)).toBeNull()
    expect(await claimHandoffTokens(nonce, 99)).toBeNull()
    const claimed = await claimHandoffTokens(nonce, 42)
    expect(claimed).toEqual({
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
    })
    expect(await claimHandoffTokens(nonce, 42)).toBeNull()
  })

  it('does not rebind a handoff that is already attached to a tab', async () => {
    const nonce = await storeHandoff(payload, { accessToken: 'secret-access' })
    await bindHandoffTab(42)
    await bindHandoffTab(99)
    expect(await consumeHandoff(99)).toBeNull()
    expect((await consumeHandoff(42))?.handoffNonce).toBe(nonce)
  })
})
