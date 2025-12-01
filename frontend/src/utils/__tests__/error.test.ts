/**
 * Unit tests for error handling utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { showNotification, formatError } from '../error'

describe('error utilities', () => {
  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = ''
  })

  afterEach(() => {
    // Clean up any notifications
    document.body.innerHTML = ''
    vi.clearAllTimers()
  })

  describe('showNotification', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should create a notification element', () => {
      showNotification('Test message')
      const notification = document.querySelector('[style*="position: fixed"]')
      expect(notification).toBeTruthy()
    })

    it('should display success notification by default', () => {
      showNotification('Success message')
      const notification = document.querySelector('[style*="position: fixed"]')
      expect(notification?.textContent).toContain('Success message')
      expect(notification?.textContent).toContain('✓')
    })

    it('should display error notification when specified', () => {
      showNotification('Error message', 'error')
      const notification = document.querySelector('[style*="position: fixed"]')
      expect(notification?.textContent).toContain('Error message')
      expect(notification?.textContent).toContain('✕')
    })

    it('should remove notification after timeout', () => {
      showNotification('Test message')
      expect(document.body.children.length).toBeGreaterThan(0)

      // Fast-forward time
      vi.advanceTimersByTime(3500)

      // Notification should be removed
      const notification = document.querySelector('[style*="position: fixed"]')
      expect(notification).toBeNull()
    })
  })

  describe('formatError', () => {
    it('should return string errors as-is', () => {
      expect(formatError('Simple error')).toBe('Simple error')
    })

    it('should extract message from Error objects', () => {
      const error = new Error('Error message')
      expect(formatError(error)).toBe('Error message')
    })

    it('should extract detail from error objects', () => {
      const error = { detail: 'API error detail' }
      expect(formatError(error)).toBe('API error detail')
    })

    it('should extract message from error objects', () => {
      const error = { message: 'Error message' }
      expect(formatError(error)).toBe('Error message')
    })

    it('should use default message for unknown error types', () => {
      const error = { someOtherField: 'value' }
      expect(formatError(error)).toBe('An unexpected error occurred')
    })

    it('should use custom default message', () => {
      const error = {}
      expect(formatError(error, 'Custom default')).toBe('Custom default')
    })

    it('should handle null and undefined', () => {
      expect(formatError(null)).toBe('An unexpected error occurred')
      expect(formatError(undefined)).toBe('An unexpected error occurred')
    })
  })
})
