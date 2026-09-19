import { afterEach, describe, expect, it, vi } from 'vitest'

import { addExtensionMessageListener, sendExtensionMessage } from '../extensionRuntime'

describe('extensionRuntime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not throw when chrome.runtime is missing', async () => {
    vi.stubGlobal('chrome', {})
    await expect(sendExtensionMessage({ type: 'PING' })).resolves.toBeUndefined()
    expect(() => addExtensionMessageListener(() => undefined)).not.toThrow()
  })

  it('does not throw when chrome is missing', async () => {
    vi.stubGlobal('chrome', undefined)
    await expect(sendExtensionMessage({ type: 'PING' })).resolves.toBeUndefined()
  })

  it('forwards messages when sendMessage is available', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ type: 'OK' })
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    await expect(sendExtensionMessage({ type: 'PING' })).resolves.toEqual({ type: 'OK' })
    expect(sendMessage).toHaveBeenCalledWith({ type: 'PING' })
  })

  it('swallows sendMessage rejections from an invalidated extension context', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('Extension context invalidated'))
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    await expect(sendExtensionMessage({ type: 'PING' })).resolves.toBeUndefined()
  })
})
