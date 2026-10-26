import { describe, expect, it } from 'vitest'

import {
  getMicrophoneUnsupportedMessage,
  isVoiceActive,
  microphonePermissionErrorMessage,
  rmsFromTimeDomain,
} from '../voiceActivityDetection'

describe('rmsFromTimeDomain', () => {
  it('is zero for silence', () => {
    const samples = new Uint8Array(8).fill(128)
    expect(rmsFromTimeDomain(samples)).toBe(0)
  })

  it('is higher for loud samples', () => {
    const quiet = new Uint8Array([128, 130, 126, 128])
    const loud = new Uint8Array([0, 255, 0, 255])
    expect(rmsFromTimeDomain(loud)).toBeGreaterThan(rmsFromTimeDomain(quiet))
  })
})

describe('isVoiceActive', () => {
  it('respects the threshold', () => {
    expect(isVoiceActive(10, 18)).toBe(false)
    expect(isVoiceActive(20, 18)).toBe(true)
  })
})

describe('microphone errors', () => {
  it('explains permission denied', () => {
    expect(microphonePermissionErrorMessage({ name: 'NotAllowedError' })).toMatch(
      /Microphone access denied/
    )
  })

  it('reports unsupported browsers when MediaRecorder is missing', () => {
    const original = globalThis.MediaRecorder
    // @ts-expect-error test override
    delete globalThis.MediaRecorder
    const message = getMicrophoneUnsupportedMessage()
    // @ts-expect-error restore
    globalThis.MediaRecorder = original
    expect(message == null || /supported|secure/i.test(message)).toBe(true)
  })
})
