import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildAuthModalPath,
  clearPendingAuthIntent,
  parseAuthModalParam,
  peekPendingAuthIntent,
  savePendingAuthIntent,
  stripAuthModalParam,
} from '../../utils/authIntent'

describe('authIntent', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  it('builds and parses the modal param', () => {
    expect(buildAuthModalPath('signup')).toBe('/?showAuthModal=signup')
    expect(parseAuthModalParam('?showAuthModal=signup')).toBe('signup')
    expect(parseAuthModalParam('?showAuthModal=login')).toBe('login')
    expect(parseAuthModalParam('?showAuthModal=other')).toBeNull()
    expect(parseAuthModalParam('')).toBeNull()
  })

  it('strips only the modal param', () => {
    expect(stripAuthModalParam('?showAuthModal=signup')).toBe('')
    expect(stripAuthModalParam('?a=1&showAuthModal=signup&b=2')).toBe('?a=1&b=2')
  })

  it('round-trips and clears a pending intent', () => {
    savePendingAuthIntent({ returnTo: '/pricing', tier: 'starter' })
    expect(peekPendingAuthIntent()).toMatchObject({ returnTo: '/pricing', tier: 'starter' })
    clearPendingAuthIntent()
    expect(peekPendingAuthIntent()).toBeNull()
  })

  it('expires stale intents', () => {
    vi.useFakeTimers()
    savePendingAuthIntent({ returnTo: '/pricing', tier: 'pro' })
    vi.advanceTimersByTime(16 * 60 * 1000)
    expect(peekPendingAuthIntent()).toBeNull()
  })

  it('rejects non-relative return paths', () => {
    sessionStorage.setItem(
      'compareintel:pendingAuthIntent',
      JSON.stringify({ returnTo: '//evil.example', createdAt: Date.now() })
    )
    expect(peekPendingAuthIntent()).toBeNull()
  })
})
