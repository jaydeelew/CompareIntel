import { afterEach, describe, expect, it, vi } from 'vitest'

import { isVerdictPanelEnabledFromEnv } from '../featureFlags'

describe('isVerdictPanelEnabledFromEnv', () => {
  it('is on in Vite dev by default', () => {
    expect(isVerdictPanelEnabledFromEnv({ DEV: true, PROD: false })).toBe(true)
  })

  it('is off in production builds unless VITE_ENABLE_VERDICT_PANEL is set', () => {
    expect(isVerdictPanelEnabledFromEnv({ PROD: true, MODE: 'production' })).toBe(false)
    expect(
      isVerdictPanelEnabledFromEnv({
        PROD: true,
        MODE: 'production',
        VITE_ENABLE_VERDICT_PANEL: 'true',
      })
    ).toBe(true)
    expect(
      isVerdictPanelEnabledFromEnv({
        PROD: true,
        VITE_ENABLE_VERDICT_PANEL: '1',
      })
    ).toBe(true)
  })

  it('accepts common truthy spellings for the explicit env flag', () => {
    expect(isVerdictPanelEnabledFromEnv({ VITE_ENABLE_VERDICT_PANEL: 'yes' })).toBe(true)
    expect(isVerdictPanelEnabledFromEnv({ VITE_ENABLE_VERDICT_PANEL: 'TRUE' })).toBe(true)
    expect(isVerdictPanelEnabledFromEnv({ VITE_ENABLE_VERDICT_PANEL: 'false' })).toBe(false)
  })
})

describe('isVerdictPanelEnabled runtime', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('reflects import.meta.env in vitest', async () => {
    vi.stubEnv('VITE_ENABLE_VERDICT_PANEL', '')
    vi.stubEnv('DEV', '')
    vi.stubEnv('PROD', 'true')
    const { isVerdictPanelEnabled: readFlag } = await import('../featureFlags')
    expect(readFlag()).toBe(false)

    vi.resetModules()
    vi.stubEnv('VITE_ENABLE_VERDICT_PANEL', 'true')
    vi.stubEnv('DEV', '')
    const { isVerdictPanelEnabled: readFlagOn } = await import('../featureFlags')
    expect(readFlagOn()).toBe(true)
  })
})
