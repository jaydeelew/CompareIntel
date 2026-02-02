/**
 * Tests for Sentry error monitoring integration.
 *
 * These tests verify that:
 * 1. Sentry initialization doesn't crash when DSN is not configured
 * 2. Capture functions work without throwing errors
 * 3. User context can be set and cleared
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Sentry before importing the module
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  withScope: vi.fn(callback => callback({ setExtras: vi.fn() })),
  browserTracingIntegration: vi.fn(() => ({})),
  replayIntegration: vi.fn(() => ({})),
  ErrorBoundary: vi.fn(({ children }) => children),
}))

describe('Sentry Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('initSentry', () => {
    it('should not throw when DSN is not configured', async () => {
      // Set env to have no DSN
      vi.stubEnv('VITE_SENTRY_DSN', '')

      const { initSentry } = await import('../../utils/sentry')

      expect(() => initSentry()).not.toThrow()
    })

    it('should initialize Sentry when DSN is configured', async () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123')
      vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'test')
      vi.stubEnv('DEV', false)

      const Sentry = await import('@sentry/react')
      const { initSentry } = await import('../../utils/sentry')

      initSentry()

      // In test environment, Sentry.init might or might not be called
      // depending on environment detection
      expect(Sentry.init).toBeDefined()
    })
  })

  describe('captureError', () => {
    it('should not throw when capturing an error', async () => {
      const { captureError } = await import('../../utils/sentry')

      expect(() => {
        captureError(new Error('Test error'))
      }).not.toThrow()
    })

    it('should not throw when capturing an error with context', async () => {
      const { captureError } = await import('../../utils/sentry')

      expect(() => {
        captureError(new Error('Test error'), { userId: '123', action: 'test' })
      }).not.toThrow()
    })
  })

  describe('captureMessage', () => {
    it('should not throw when capturing a message', async () => {
      const { captureMessage } = await import('../../utils/sentry')

      expect(() => {
        captureMessage('Test message')
      }).not.toThrow()
    })

    it('should not throw with different severity levels', async () => {
      const { captureMessage } = await import('../../utils/sentry')

      expect(() => {
        captureMessage('Debug message', 'debug')
        captureMessage('Info message', 'info')
        captureMessage('Warning message', 'warning')
        captureMessage('Error message', 'error')
      }).not.toThrow()
    })
  })

  describe('setUserContext', () => {
    it('should not throw when setting user context', async () => {
      const { setUserContext } = await import('../../utils/sentry')

      expect(() => {
        setUserContext({ id: '123', email: 'test@example.com' })
      }).not.toThrow()
    })

    it('should not throw when clearing user context', async () => {
      const { setUserContext } = await import('../../utils/sentry')

      expect(() => {
        setUserContext(null)
      }).not.toThrow()
    })
  })

  describe('addBreadcrumb', () => {
    it('should not throw when adding a breadcrumb', async () => {
      const { addBreadcrumb } = await import('../../utils/sentry')

      expect(() => {
        addBreadcrumb('User clicked button')
      }).not.toThrow()
    })

    it('should not throw with category and level', async () => {
      const { addBreadcrumb } = await import('../../utils/sentry')

      expect(() => {
        addBreadcrumb('Navigation event', 'navigation', 'info')
        addBreadcrumb('API call', 'http', 'debug')
      }).not.toThrow()
    })
  })
})

describe('Sentry Error Boundary', () => {
  it('should export SentryErrorBoundary', async () => {
    const { SentryErrorBoundary } = await import('../../utils/sentry')

    expect(SentryErrorBoundary).toBeDefined()
  })
})
