import { describe, expect, it } from 'vitest'

import {
  INVOKE_TO_READ_MESSAGE,
  RESTRICTED_PAGE_MESSAGE,
  canExtractTab,
  isBlockedUrl,
  isChromeWebStoreUrl,
  isRestrictedPage,
  pageAccessMessage,
} from '../urlPolicy'

describe('urlPolicy', () => {
  it('blocks chrome internal URLs', () => {
    expect(isBlockedUrl('chrome://settings')).toBe(true)
    expect(canExtractTab('chrome://settings')).toBe(false)
    expect(isRestrictedPage('chrome://settings')).toBe(true)
    expect(pageAccessMessage('chrome://settings')).toBe(RESTRICTED_PAGE_MESSAGE)
  })

  it('blocks the Chrome Web Store', () => {
    expect(isChromeWebStoreUrl('https://chromewebstore.google.com/detail/example')).toBe(true)
    expect(isChromeWebStoreUrl('https://chrome.google.com/webstore/detail/example')).toBe(true)
    expect(canExtractTab('https://chromewebstore.google.com/detail/example')).toBe(false)
    expect(pageAccessMessage('https://chrome.google.com/webstore')).toBe(RESTRICTED_PAGE_MESSAGE)
  })

  it('allows https pages', () => {
    expect(canExtractTab('https://example.com/article')).toBe(true)
    expect(pageAccessMessage('https://example.com/article')).toBeNull()
  })

  it('asks the user to invoke the extension when the tab URL is unknown', () => {
    expect(pageAccessMessage(undefined)).toBe(INVOKE_TO_READ_MESSAGE)
    expect(pageAccessMessage('')).toBe(INVOKE_TO_READ_MESSAGE)
    expect(canExtractTab(undefined)).toBe(false)
  })
})
