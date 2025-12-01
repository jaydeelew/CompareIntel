/**
 * Unit tests for hash utilities.
 */

import { describe, it, expect } from 'vitest'

import { simpleHash } from '../hash'

describe('hash utilities', () => {
  describe('simpleHash', () => {
    it('should hash a string and return a 64-character hexadecimal string', async () => {
      const hash = await simpleHash('test string')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce consistent hashes for the same input', async () => {
      const input = 'consistent test'
      const hash1 = await simpleHash(input)
      const hash2 = await simpleHash(input)
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await simpleHash('input 1')
      const hash2 = await simpleHash('input 2')
      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty strings', async () => {
      const hash = await simpleHash('')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should handle special characters', async () => {
      const hash = await simpleHash('!@#$%^&*()_+-=[]{}|;:,.<>?')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should handle unicode characters', async () => {
      const hash = await simpleHash('Hello 世界 🌍')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })
  })
})
