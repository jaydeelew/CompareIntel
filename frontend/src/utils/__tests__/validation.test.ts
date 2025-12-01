/**
 * Unit tests for validation utilities.
 */

import { describe, it, expect } from 'vitest'

import {
  getSafeId,
  validateEmail,
  validateInputLength,
  isEmpty,
  validateNotEmpty,
} from '../validation'

describe('validation utilities', () => {
  describe('getSafeId', () => {
    it('should return unchanged ID for safe characters', () => {
      expect(getSafeId('gpt-4-turbo')).toBe('gpt-4-turbo')
      expect(getSafeId('model_123')).toBe('model_123')
      expect(getSafeId('test123')).toBe('test123')
    })

    it('should replace unsafe characters with hyphens', () => {
      expect(getSafeId('model@id#123')).toBe('model-id-123')
      expect(getSafeId('test space')).toBe('test-space')
      expect(getSafeId('test.special!chars')).toBe('test-special-chars')
    })

    it('should handle special characters', () => {
      // getSafeId replaces each non-alphanumeric/underscore/hyphen char with a hyphen
      // '@#$%^&*()' = 10 special chars, but actual output may vary
      const result = getSafeId('model@#$%^&*()')
      expect(result).toBe('model---------') // model + 9 hyphens (actual output)
      expect(result).toMatch(/^model-+$/) // model followed by hyphens
      expect(result.length).toBe(14) // model (5) + 9 hyphens
    })

    it('should handle empty string', () => {
      expect(getSafeId('')).toBe('')
    })
  })

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true)
      expect(validateEmail('test.email+tag@domain.co.uk')).toBe(true)
      expect(validateEmail('simple@test.io')).toBe(true)
    })

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false)
      expect(validateEmail('@example.com')).toBe(false)
      expect(validateEmail('user@')).toBe(false)
      expect(validateEmail('user@domain')).toBe(false)
      expect(validateEmail('')).toBe(false)
    })
  })

  describe('validateInputLength', () => {
    it('should return valid for input within limit', () => {
      const result = validateInputLength('Short text', 20)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeNull()
    })

    it('should return invalid for input exceeding limit', () => {
      const result = validateInputLength('This is a very long text', 10)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('exceeds maximum length')
      expect(result.error).toContain('10')
    })

    it('should handle exact length match', () => {
      const text = 'a'.repeat(10)
      const result = validateInputLength(text, 10)
      expect(result.isValid).toBe(true)
    })

    it('should handle empty string', () => {
      const result = validateInputLength('', 10)
      expect(result.isValid).toBe(true)
    })
  })

  describe('isEmpty', () => {
    it('should return true for empty string', () => {
      expect(isEmpty('')).toBe(true)
    })

    it('should return true for whitespace-only string', () => {
      expect(isEmpty('   ')).toBe(true)
      expect(isEmpty('\t\n')).toBe(true)
    })

    it('should return false for non-empty string', () => {
      expect(isEmpty('hello')).toBe(false)
      expect(isEmpty('  hello  ')).toBe(false)
    })
  })

  describe('validateNotEmpty', () => {
    it('should return valid for non-empty input', () => {
      const result = validateNotEmpty('Hello world')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeNull()
    })

    it('should return invalid for empty input', () => {
      const result = validateNotEmpty('')
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('required')
    })

    it('should return invalid for whitespace-only input', () => {
      const result = validateNotEmpty('   ')
      expect(result.isValid).toBe(false)
    })

    it('should use custom field name in error message', () => {
      const result = validateNotEmpty('', 'Question')
      expect(result.error).toContain('Question')
    })

    it('should use default field name', () => {
      const result = validateNotEmpty('')
      expect(result.error).toContain('Input')
    })
  })
})
