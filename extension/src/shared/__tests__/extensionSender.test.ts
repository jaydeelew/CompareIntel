import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  authorizeTabContextMessage,
  isExtensionPageSender,
  isSensitiveTabContextMessage,
} from '../extensionSender'

describe('extensionSender', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats chrome-extension:// senders as extension pages', () => {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` },
    })
    expect(
      isExtensionPageSender({ url: 'chrome-extension://abc/src/sidepanel/index.html' }),
    ).toBe(true)
    expect(isExtensionPageSender({ url: 'https://example.com/page', tab: { id: 1 } })).toBe(false)
    expect(isExtensionPageSender({ tab: { id: 1 } })).toBe(false)
    expect(isExtensionPageSender({})).toBe(true)
  })

  it('rejects GET_TAB_CONTEXT, LIST_TABS, and PIN_TAB from page content scripts', () => {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` },
    })
    const pageSender = { url: 'https://evil.example/', tab: { id: 9 } }
    const panelSender = { url: 'chrome-extension://abc/src/sidepanel/index.html' }

    for (const type of ['GET_TAB_CONTEXT', 'LIST_TABS', 'PIN_TAB']) {
      expect(isSensitiveTabContextMessage(type)).toBe(true)
      expect(authorizeTabContextMessage(type, pageSender)).toBe(false)
      expect(authorizeTabContextMessage(type, panelSender)).toBe(true)
    }
    expect(authorizeTabContextMessage('GET_ACTIVE_TAB', pageSender)).toBe(true)
  })
})
