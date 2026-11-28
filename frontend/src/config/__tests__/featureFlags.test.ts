import { afterEach, describe, expect, it, vi } from 'vitest'

import { isVerdictPanelEnabledFromEnv } from '../featureFlags'

describe('isVerdictPanelEnabledFromEnv', () => {
  it('is on in Vite dev', () => {
    expect(isVerdictPanelEnabledFromEnv({ DEV: true, PROD: false, MODE: 'development' })).toBe(true)
    expect(isVerdictPanelEnabledFromEnv({ DEV: 'true', PROD: false })).toBe(true)
  })

  it('is off in production and Cloudflare preview builds', () => {
    expect(isVerdictPanelEnabledFromEnv({ DEV: false, PROD: true, MODE: 'production' })).toBe(false)
    expect(
      isVerdictPanelEnabledFromEnv({
        DEV: false,
        PROD: true,
        MODE: 'production',
        CF_PAGES: '1',
        VITE_DEPLOY_ENV: 'preview',
      })
    ).toBe(false)
  })

  it('ignores the removed VITE_ENABLE_VERDICT_PANEL override', () => {
    expect(
      isVerdictPanelEnabledFromEnv({
        DEV: false,
        PROD: true,
        MODE: 'production',
        VITE_ENABLE_VERDICT_PANEL: 'true',
      })
    ).toBe(false)
    expect(
      isVerdictPanelEnabledFromEnv({
        DEV: false,
        PROD: true,
        MODE: 'production',
        VITE_ENABLE_VERDICT_PANEL: '1',
      })
    ).toBe(false)
    expect(isVerdictPanelEnabledFromEnv({ VITE_ENABLE_VERDICT_PANEL: 'yes' })).toBe(false)
    expect(isVerdictPanelEnabledFromEnv({ VITE_ENABLE_VERDICT_PANEL: 'TRUE' })).toBe(false)
  })

  it('allows only the non-production verdict-e2e Vite mode', () => {
    expect(isVerdictPanelEnabledFromEnv({ DEV: false, PROD: true, MODE: 'verdict-e2e' })).toBe(true)
    expect(isVerdictPanelEnabledFromEnv({ DEV: false, PROD: true, MODE: 'e2e' })).toBe(false)
  })
})

describe('isVerdictPanelEnabled runtime', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('follows DEV and ignores a production env override', async () => {
    vi.stubEnv('DEV', '')
    vi.stubEnv('PROD', 'true')
    vi.stubEnv('MODE', 'production')
    vi.stubEnv('VITE_ENABLE_VERDICT_PANEL', 'true')
    const { isVerdictPanelEnabled: readFlag } = await import('../featureFlags')
    expect(readFlag()).toBe(false)

    vi.resetModules()
    vi.stubEnv('DEV', 'true')
    vi.stubEnv('PROD', '')
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_ENABLE_VERDICT_PANEL', '')
    const { isVerdictPanelEnabled: readFlagOn } = await import('../featureFlags')
    expect(readFlagOn()).toBe(true)
  })
})
