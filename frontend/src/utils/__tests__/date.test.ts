/**
 * Unit tests for date utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  parseDate,
  isToday,
  getTodayStart,
  getCurrentISODate,
  getDateDiff,
  formatLocaleDate,
} from '../date'

describe('date utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('parseDate', () => {
    it('should parse ISO date strings', () => {
      const date = parseDate('2025-01-15T12:00:00Z')
      expect(date).toBeInstanceOf(Date)
      expect(date?.getTime()).toBe(new Date('2025-01-15T12:00:00Z').getTime())
    })

    it('should parse Date objects', () => {
      const dateObj = new Date('2025-01-15T12:00:00Z')
      const parsed = parseDate(dateObj)
      expect(parsed).toEqual(dateObj)
      expect(parsed?.getTime()).toBe(dateObj.getTime())
    })

    it('should parse timestamps', () => {
      const timestamp = 1736942400000
      const date = parseDate(timestamp)
      expect(date).toBeInstanceOf(Date)
      expect(date?.getTime()).toBe(timestamp)
    })

    it('should return null for invalid dates', () => {
      expect(parseDate('invalid-date')).toBeNull()
      expect(parseDate('not-a-date')).toBeNull()
    })
  })

  describe('isToday', () => {
    it('should return true for today', () => {
      const today = new Date().toISOString()
      expect(isToday(today)).toBe(true)
    })

    it('should return false for yesterday', () => {
      const yesterday = new Date('2025-01-14T12:00:00Z').toISOString()
      expect(isToday(yesterday)).toBe(false)
    })

    it('should return false for tomorrow', () => {
      const tomorrow = new Date('2025-01-16T12:00:00Z').toISOString()
      expect(isToday(tomorrow)).toBe(false)
    })

    it('should handle invalid dates', () => {
      expect(isToday('invalid-date')).toBe(false)
    })
  })

  describe('getTodayStart', () => {
    it('should return start of today in ISO format', () => {
      const start = getTodayStart()
      const date = new Date(start)
      expect(date.getHours()).toBe(0)
      expect(date.getMinutes()).toBe(0)
      expect(date.getSeconds()).toBe(0)
      expect(date.getMilliseconds()).toBe(0)
    })

    it('should return ISO string format', () => {
      const start = getTodayStart()
      expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('getCurrentISODate', () => {
    it('should return current date as ISO string', () => {
      const date = getCurrentISODate()
      expect(date).toBe(new Date().toISOString())
    })

    it('should return ISO format', () => {
      const date = getCurrentISODate()
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('getDateDiff', () => {
    it('should calculate difference in milliseconds', () => {
      const date1 = '2025-01-15T10:00:00Z'
      const date2 = '2025-01-15T11:00:00Z'
      const diff = getDateDiff(date1, date2)
      expect(diff).toBe(3600000) // 1 hour in ms
    })

    it('should use current date as default second argument', () => {
      const pastDate = '2025-01-15T10:00:00Z'
      const diff = getDateDiff(pastDate)
      expect(diff).toBeGreaterThan(0)
    })

    it('should handle Date objects', () => {
      const date1 = new Date('2025-01-15T10:00:00Z')
      const date2 = new Date('2025-01-15T11:00:00Z')
      const diff = getDateDiff(date1, date2)
      expect(diff).toBe(3600000)
    })

    it('should return 0 for invalid dates', () => {
      expect(getDateDiff('invalid', 'invalid')).toBe(0)
    })
  })

  describe('formatLocaleDate', () => {
    it('should format date with default locale', () => {
      const date = '2025-01-15T12:00:00Z'
      const formatted = formatLocaleDate(date)
      expect(formatted).toBeTruthy()
      expect(typeof formatted).toBe('string')
    })

    it('should accept custom locale', () => {
      const date = '2025-01-15T12:00:00Z'
      const formatted = formatLocaleDate(date, 'en-US')
      expect(formatted).toBeTruthy()
    })

    it('should accept format options', () => {
      const date = '2025-01-15T12:00:00Z'
      const formatted = formatLocaleDate(date, 'en-US', {
        month: 'short',
        day: 'numeric',
      })
      expect(formatted).toMatch(/Jan \d+/)
    })

    it('should return empty string for invalid dates', () => {
      expect(formatLocaleDate('invalid-date')).toBe('')
    })
  })
})
