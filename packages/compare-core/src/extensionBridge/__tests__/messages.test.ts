import { describe, expect, it } from 'vitest'

import { CI_BRIDGE_SOURCE, CI_PAGE_MESSAGE, isCiPageMessage } from '../messages'

describe('isCiPageMessage', () => {
  it('accepts only the exact CompareIntel page-message types', () => {
    expect(
      isCiPageMessage({ source: CI_BRIDGE_SOURCE, type: CI_PAGE_MESSAGE.HANDOFF_REQUEST }),
    ).toBe(true)
    expect(
      isCiPageMessage({ source: CI_BRIDGE_SOURCE, type: CI_PAGE_MESSAGE.HANDOFF_RESPONSE }),
    ).toBe(true)
    expect(isCiPageMessage({ source: CI_BRIDGE_SOURCE, type: CI_PAGE_MESSAGE.LOGOUT })).toBe(true)
    expect(
      isCiPageMessage({ source: CI_BRIDGE_SOURCE, type: CI_PAGE_MESSAGE.EXTENSION_LOGOUT }),
    ).toBe(true)
    expect(isCiPageMessage({ source: CI_BRIDGE_SOURCE, type: CI_PAGE_MESSAGE.AUTH })).toBe(true)
  })

  it('rejects unknown types, missing source, and non-objects', () => {
    expect(isCiPageMessage({ source: CI_BRIDGE_SOURCE, type: 'CI_STEAL_TOKENS' })).toBe(false)
    expect(isCiPageMessage({ source: 'other', type: CI_PAGE_MESSAGE.LOGOUT })).toBe(false)
    expect(isCiPageMessage({ type: CI_PAGE_MESSAGE.LOGOUT })).toBe(false)
    expect(isCiPageMessage(null)).toBe(false)
    expect(isCiPageMessage('CI_AUTH')).toBe(false)
  })
})
