import { describe, expect, it } from 'vitest'

import { allowedWebAppOrigins, isAllowedWebAppOrigin } from '../webAppOrigins'

describe('webAppOrigins', () => {
  it('allows localhost:5173 only in development', () => {
    expect(isAllowedWebAppOrigin('http://localhost:5173', true)).toBe(true)
    expect(isAllowedWebAppOrigin('http://localhost:5173', false)).toBe(false)
    expect(allowedWebAppOrigins(false)).not.toContain('http://localhost:5173')
  })

  it('always allows compareintel.com', () => {
    expect(isAllowedWebAppOrigin('https://compareintel.com', false)).toBe(true)
    expect(isAllowedWebAppOrigin('https://evil.example', false)).toBe(false)
    expect(isAllowedWebAppOrigin(undefined, true)).toBe(false)
  })
})
