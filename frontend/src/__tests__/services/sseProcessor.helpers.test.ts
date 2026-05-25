import { describe, it, expect } from 'vitest'

import {
  createStreamingMessage,
  estimateTokensSimple,
  normalizeImageUrlKey,
} from '../../services/sseProcessor'

describe('sseProcessor helpers', () => {
  describe('estimateTokensSimple', () => {
    it('returns 0 for empty or whitespace-only', () => {
      expect(estimateTokensSimple('')).toBe(0)
      expect(estimateTokensSimple('   \n\t')).toBe(0)
    })

    it('uses ≥1 token and ceil of length / 4', () => {
      expect(estimateTokensSimple('abcd')).toBe(1)
      expect(estimateTokensSimple('abcdefghijkl')).toBe(3)
    })
  })

  describe('createStreamingMessage', () => {
    it('creates assistant message with custom timestamp when provided', () => {
      const ts = '2026-05-01T00:00:00.000Z'
      const m = createStreamingMessage('assistant', 'hi', ts)
      expect(m.type).toBe('assistant')
      expect(m.content).toBe('hi')
      expect(m.timestamp).toBe(ts)
    })
  })

  describe('normalizeImageUrlKey', () => {
    it('stable key for duplicate data URLs differing only by padding/query encoding', () => {
      const plain = normalizeImageUrlKey('https://cdn.example/foo.png ')
      expect(plain).toBe('https://cdn.example/foo.png')

      const a = 'data:image/png;base64,' + encodeURIComponent('SGVsbG8') + '='
      const b = 'data:image/png;base64,SGVsbG8'
      expect(normalizeImageUrlKey(a)).toBe(normalizeImageUrlKey(b))
    })
  })
})
