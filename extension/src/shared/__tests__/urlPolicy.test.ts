import { describe, expect, it } from 'vitest'

import { canExtractTab, isBlockedUrl } from '../urlPolicy'

describe('urlPolicy', () => {
  it('blocks chrome internal URLs', () => {
    expect(isBlockedUrl('chrome://settings')).toBe(true)
    expect(canExtractTab('chrome://settings')).toBe(false)
  })

  it('allows https pages', () => {
    expect(canExtractTab('https://example.com/article')).toBe(true)
  })
})
