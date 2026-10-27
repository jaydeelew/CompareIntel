import { describe, expect, it } from 'vitest'

import { parseVoiceFlag, visibleHistoryEntries } from '../voiceFlag'

describe('voiceFlag', () => {
  it('defaults off unless the env value is true or 1', () => {
    expect(parseVoiceFlag(undefined)).toBe(false)
    expect(parseVoiceFlag('')).toBe(false)
    expect(parseVoiceFlag('false')).toBe(false)
    expect(parseVoiceFlag('yes')).toBe(false)
    expect(parseVoiceFlag('true')).toBe(true)
    expect(parseVoiceFlag('1')).toBe(true)
  })

  it('hides voice history entries when the flag is off', () => {
    const entries = [
      { id: '1', composer_mode: 'text' as const },
      { id: '2', composer_mode: 'voice' as const },
      { id: '3', composer_mode: 'image' as const },
    ]
    expect(visibleHistoryEntries(entries, false).map(entry => entry.id)).toEqual(['1', '3'])
  })

  it('keeps voice history entries when the flag is on', () => {
    const entries = [
      { id: '1', composer_mode: 'text' as const },
      { id: '2', composer_mode: 'voice' as const },
    ]
    expect(visibleHistoryEntries(entries, true).map(entry => entry.id)).toEqual(['1', '2'])
  })
})
