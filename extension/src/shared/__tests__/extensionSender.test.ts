import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  acceptHandoffTokensFromSender,
  authorizeRuntimeMessage,
  CONTENT_SCRIPT_DENIED_TYPES,
  isContentScriptAllowedMessage,
  isExtensionPageSender,
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

  it('allowlists only GET_HANDOFF, BROADCAST_LOGOUT, and WEB_APP_BRIDGE_READY for content scripts', () => {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` },
    })
    const pageSender = { url: 'https://evil.example/', tab: { id: 9 } }
    const tabOnlySender = { tab: { id: 3 } }
    const pageOriginSender = { url: 'https://compareintel.com/' }
    const panelSender = { url: 'chrome-extension://abc/src/sidepanel/index.html' }

    for (const type of ['GET_HANDOFF', 'BROADCAST_LOGOUT', 'WEB_APP_BRIDGE_READY'] as const) {
      expect(isContentScriptAllowedMessage(type)).toBe(true)
      expect(authorizeRuntimeMessage(type, pageSender)).toBe(true)
      expect(authorizeRuntimeMessage(type, tabOnlySender)).toBe(true)
      expect(authorizeRuntimeMessage(type, pageOriginSender)).toBe(true)
      expect(authorizeRuntimeMessage(type, panelSender)).toBe(true)
    }
  })

  it('denies content-script senders for every non-allowlisted type (default deny)', () => {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` },
    })
    const pageSender = { url: 'https://evil.example/', tab: { id: 9 } }
    const tabOnlySender = { tab: { id: 3 } }
    const pageOriginSender = { url: 'https://compareintel.com/' }
    const panelSender = { url: 'chrome-extension://abc/src/sidepanel/index.html' }

    expect(CONTENT_SCRIPT_DENIED_TYPES).toEqual([
      'GET_SELECTION',
      'GET_ACTIVE_TAB',
      'SET_PINNED_TABS',
      'UNPIN_TAB',
      'CLEAR_CONTEXT_CACHE',
      'GET_PINNED_TABS',
      'SET_PANEL_SCOPE',
      'OPEN_TAB_WITHOUT_PANEL',
      'STORE_HANDOFF',
      'GET_TAB_CONTEXT',
      'LIST_TABS',
      'PIN_TAB',
    ])

    for (const type of [...CONTENT_SCRIPT_DENIED_TYPES, 'FUTURE_TYPE']) {
      expect(isContentScriptAllowedMessage(type)).toBe(false)
      expect(authorizeRuntimeMessage(type, pageSender)).toBe(false)
      expect(authorizeRuntimeMessage(type, tabOnlySender)).toBe(false)
      expect(authorizeRuntimeMessage(type, pageOriginSender)).toBe(false)
      expect(authorizeRuntimeMessage(type, panelSender)).toBe(true)
    }
  })

  it('never accepts STORE_HANDOFF tokens from a content-script sender', () => {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` },
    })
    const pageTokens = { accessToken: 'page-supplied', refreshToken: 'stolen' }
    expect(
      acceptHandoffTokensFromSender(
        { url: 'https://evil.example/', tab: { id: 9 } },
        pageTokens,
      ),
    ).toBeUndefined()
    expect(
      acceptHandoffTokensFromSender({ url: 'chrome-extension://abc/src/sidepanel/index.html' }, pageTokens),
    ).toEqual(pageTokens)
  })
})
