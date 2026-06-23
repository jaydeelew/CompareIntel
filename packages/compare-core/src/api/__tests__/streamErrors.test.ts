import { describe, expect, it } from 'vitest'

import { deriveStreamErrorMessage } from '../streamErrors'

describe('deriveStreamErrorMessage', () => {
  it('returns fallback for empty content', () => {
    expect(deriveStreamErrorMessage('')).toBe('Model returned an error')
    expect(deriveStreamErrorMessage('   ', 'Custom fallback')).toBe('Custom fallback')
  })

  it('strips Error: prefix from streamed backend messages', () => {
    expect(deriveStreamErrorMessage('Error: Rate limited')).toBe('Rate limited')
    expect(deriveStreamErrorMessage('Error: Model not available')).toBe('Model not available')
  })

  it('returns trimmed content when not an Error: prefix', () => {
    expect(deriveStreamErrorMessage('Something went wrong')).toBe('Something went wrong')
  })
})
