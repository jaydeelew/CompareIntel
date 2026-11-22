import { describe, expect, it } from 'vitest'

import { gateInstallPromptForOnboarding } from '../pwaInstallVisibility'

describe('gateInstallPromptForOnboarding', () => {
  it('returns visible when onboarding is inactive', () => {
    expect(gateInstallPromptForOnboarding(true, false)).toBe(true)
    expect(gateInstallPromptForOnboarding(false, false)).toBe(false)
  })

  it('hides install prompt while onboarding tutorial is active', () => {
    expect(gateInstallPromptForOnboarding(true, true)).toBe(false)
    expect(gateInstallPromptForOnboarding(false, true)).toBe(false)
  })
})
