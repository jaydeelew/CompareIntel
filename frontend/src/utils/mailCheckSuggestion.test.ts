import { describe, it, expect } from 'vitest'

import { getEmailTypoSuggestion } from './mailCheckSuggestion'

describe('getEmailTypoSuggestion', () => {
  it('suggests gmail.com for a common misspelling of the gmail domain', () => {
    const s = getEmailTypoSuggestion('user@gmail.cm')
    expect(s).not.toBeNull()
    expect(s?.full).toBe('user@gmail.com')
  })

  it('returns null for a well-formed address with no near-match', () => {
    expect(getEmailTypoSuggestion('user@custom-domain.example')).toBeNull()
  })

  it('returns null for empty or invalid input', () => {
    expect(getEmailTypoSuggestion('')).toBeNull()
    expect(getEmailTypoSuggestion('nope')).toBeNull()
  })
})
