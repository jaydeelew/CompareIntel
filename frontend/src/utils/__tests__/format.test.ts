/**
 * Unit tests for formatting utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  formatDate,
  formatTime,
  formatNumber,
  truncatePrompt,
  formatConversationMessage,
} from '../format'

describe('format utilities', () => {
  describe('formatDate', () => {
    beforeEach(() => {
      // Mock current date to ensure consistent test results
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return "Just now" for very recent dates', () => {
      const date = new Date('2025-01-15T11:59:30Z').toISOString()
      expect(formatDate(date)).toBe('Just now')
    })

    it('should format minutes ago correctly', () => {
      const date = new Date('2025-01-15T11:55:00Z').toISOString()
      expect(formatDate(date)).toBe('5m ago')
    })

    it('should format hours ago correctly', () => {
      const date = new Date('2025-01-15T10:00:00Z').toISOString()
      expect(formatDate(date)).toBe('2h ago')
    })

    it('should return "Yesterday" for dates 24 hours ago', () => {
      const date = new Date('2025-01-14T12:00:00Z').toISOString()
      expect(formatDate(date)).toBe('Yesterday')
    })

    it('should format days ago correctly', () => {
      const date = new Date('2025-01-13T12:00:00Z').toISOString()
      expect(formatDate(date)).toBe('2d ago')
    })

    it('should format older dates with locale format', () => {
      const date = new Date('2025-01-01T12:00:00Z').toISOString()
      const result = formatDate(date)
      expect(result).toMatch(/Jan \d+/)
    })
  })

  describe('formatTime', () => {
    it('should format a date as a time string', () => {
      const date = new Date('2025-01-15T14:30:00Z').toISOString()
      const time = formatTime(date)
      expect(time).toBeTruthy()
      expect(typeof time).toBe('string')
    })

    it('should accept locale parameter', () => {
      const date = new Date('2025-01-15T14:30:00Z').toISOString()
      const time = formatTime(date, 'en-US')
      expect(time).toBeTruthy()
    })
  })

  describe('formatNumber', () => {
    it('should format numbers with thousands separators', () => {
      expect(formatNumber(1234567)).toBe('1,234,567')
    })

    it('should format decimal numbers', () => {
      expect(formatNumber(1234.56)).toBe('1,234.56')
    })

    it('should format small numbers without separators', () => {
      expect(formatNumber(123)).toBe('123')
    })

    it('should format zero', () => {
      expect(formatNumber(0)).toBe('0')
    })

    it('should accept locale parameter', () => {
      // Different locales may format differently
      const result = formatNumber(1234567, 'en-US')
      expect(result).toBeTruthy()
    })
  })

  describe('truncatePrompt', () => {
    it('should return original text if shorter than maxLength', () => {
      const text = 'Short text'
      expect(truncatePrompt(text, 20)).toBe(text)
    })

    it('should truncate text longer than maxLength', () => {
      const text = 'This is a very long text that should be truncated'
      const result = truncatePrompt(text, 20)
      expect(result.length).toBe(23) // 20 chars + '...'
      expect(result.endsWith('...')).toBe(true)
    })

    it('should use default maxLength of 60', () => {
      const text = 'a'.repeat(100)
      const result = truncatePrompt(text)
      expect(result.length).toBe(63) // 60 + '...'
    })

    it('should handle empty string', () => {
      expect(truncatePrompt('', 10)).toBe('')
    })

    it('should handle exact length match', () => {
      const text = 'a'.repeat(10)
      expect(truncatePrompt(text, 10)).toBe(text)
    })
  })

  describe('formatConversationMessage', () => {
    it('should format user message correctly', () => {
      const result = formatConversationMessage('user', 'Hello world', '2025-01-15T12:00:00Z')
      expect(result).toContain('[You]')
      expect(result).toContain('Hello world')
    })

    it('should format assistant message correctly', () => {
      const result = formatConversationMessage('assistant', 'AI response', '2025-01-15T12:00:00Z')
      expect(result).toContain('[AI]')
      expect(result).toContain('AI response')
    })

    it('should include timestamp', () => {
      const result = formatConversationMessage('user', 'Test', '2025-01-15T14:30:00Z')
      expect(result).toContain('Test')
      expect(result.split('\n').length).toBeGreaterThan(1)
    })
  })
})
