/**
 * Email typo suggestions using the mailcheck library.
 * Suggests fixes for common domain misspellings (e.g. gmail.cm → gmail.com).
 */

import Mailcheck from 'mailcheck'

export interface EmailTypoSuggestion {
  full: string
  address: string
  domain: string
}

/**
 * If the address is close to a known provider domain, returns the suggested correction;
 * otherwise returns null.
 */
export function getEmailTypoSuggestion(email: string): EmailTypoSuggestion | null {
  const trimmed = email.trim()
  if (!trimmed || !trimmed.includes('@')) {
    return null
  }

  const result = Mailcheck.run({
    email: trimmed,
    suggested: (s: EmailTypoSuggestion) => s,
    empty: () => null,
  }) as EmailTypoSuggestion | null

  if (!result || !result.full) {
    return null
  }

  if (result.full.toLowerCase() === trimmed.toLowerCase()) {
    return null
  }

  return result
}
