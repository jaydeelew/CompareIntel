import { afterEach, describe, expect, it, vi } from 'vitest'

describe('isVoiceFeatureEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is off by default', async () => {
    vi.stubEnv('VITE_ENABLE_VOICE', '')
    const { isVoiceFeatureEnabled } = await import('../voiceFeature')
    expect(isVoiceFeatureEnabled()).toBe(false)
  })

  it('turns on for true/1/yes/on', async () => {
    for (const value of ['true', '1', 'yes', 'on', 'TRUE']) {
      vi.stubEnv('VITE_ENABLE_VOICE', value)
      vi.resetModules()
      const { isVoiceFeatureEnabled } = await import('../voiceFeature')
      expect(isVoiceFeatureEnabled()).toBe(true)
    }
  })
})
