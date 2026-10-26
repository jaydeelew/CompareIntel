import { describe, expect, it } from 'vitest'

import { DEFAULT_VOICE_CONFIG, voiceForModelIndex } from '../../services/voiceService'

describe('voiceForModelIndex', () => {
  it('assigns a distinct voice to each of the first two models', () => {
    const first = voiceForModelIndex(0, DEFAULT_VOICE_CONFIG.voices)
    const second = voiceForModelIndex(1, DEFAULT_VOICE_CONFIG.voices)
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
  })
})
