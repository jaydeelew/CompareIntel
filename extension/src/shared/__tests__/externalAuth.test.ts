import { describe, expect, it } from 'vitest'

import {
  MAX_AUTH_TOKEN_CHARS,
  parseCiAuthTokens,
  parseCiClaimHandoffNonce,
  senderWebOrigin,
} from '../externalAuth'

describe('externalAuth', () => {
  it('parses sender.origin from sender.url and swallows invalid URLs', () => {
    expect(senderWebOrigin({ url: 'https://compareintel.com/app?x=1' })).toBe(
      'https://compareintel.com',
    )
    expect(senderWebOrigin({ url: 'not a url' })).toBeUndefined()
    expect(senderWebOrigin({ origin: 'https://compareintel.com' })).toBe('https://compareintel.com')
  })

  it('accepts well-formed CI_AUTH tokens and rejects bad types or lengths', () => {
    expect(
      parseCiAuthTokens({
        type: 'CI_AUTH',
        access_token: 'access',
        refresh_token: 'refresh',
      }),
    ).toEqual({ accessToken: 'access', refreshToken: 'refresh' })
    expect(parseCiAuthTokens({ type: 'CI_AUTH', access_token: '', refresh_token: 'x' })).toBeNull()
    expect(parseCiAuthTokens({ type: 'CI_AUTH', access_token: 1, refresh_token: 'x' })).toBeNull()
    expect(
      parseCiAuthTokens({
        type: 'CI_AUTH',
        access_token: 'a'.repeat(MAX_AUTH_TOKEN_CHARS + 1),
        refresh_token: 'refresh',
      }),
    ).toBeNull()
    expect(parseCiAuthTokens({ type: 'CI_LOGOUT' })).toBeNull()
  })

  it('accepts a plausible CI_CLAIM_HANDOFF nonce', () => {
    expect(parseCiClaimHandoffNonce({ type: 'CI_CLAIM_HANDOFF', nonce: '12345678-abcd' })).toBe(
      '12345678-abcd',
    )
    expect(parseCiClaimHandoffNonce({ type: 'CI_CLAIM_HANDOFF', nonce: 'short' })).toBeNull()
    expect(parseCiClaimHandoffNonce({ type: 'CI_AUTH' })).toBeNull()
  })
})
