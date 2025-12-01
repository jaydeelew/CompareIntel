/**
 * Unit tests for browser fingerprinting utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { generateBrowserFingerprint } from '../fingerprint'

describe('fingerprint utilities', () => {
  beforeEach(() => {
    // Mock browser APIs to ensure consistent test results
    global.navigator = {
      userAgent: 'test-user-agent',
      language: 'en-US',
      platform: 'test-platform',
      hardwareConcurrency: 4,
    } as Navigator

    global.screen = {
      width: 1920,
      height: 1080,
      colorDepth: 24,
    } as Screen

    // Mock Intl.DateTimeFormat
    global.Intl = {
      DateTimeFormat: vi.fn(() => ({
        resolvedOptions: () => ({ timeZone: 'UTC' }),
      })),
    } as unknown as typeof Intl

    // Mock canvas
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,test')
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      textBaseline: '',
      font: '',
      fillText: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generateBrowserFingerprint', () => {
    it('should generate a 64-character hash', async () => {
      const fingerprint = await generateBrowserFingerprint()
      expect(fingerprint).toHaveLength(64)
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce consistent fingerprints across calls', async () => {
      const fp1 = await generateBrowserFingerprint()
      const fp2 = await generateBrowserFingerprint()
      expect(fp1).toBe(fp2)
    })

    it('should include browser characteristics in fingerprint', async () => {
      // The fingerprint should be based on browser properties
      // We can't directly inspect the fingerprint data, but we can verify
      // that changes to browser properties result in different fingerprints
      const fp1 = await generateBrowserFingerprint()

      // Change user agent
      global.navigator = {
        ...global.navigator,
        userAgent: 'different-user-agent',
      } as Navigator

      const fp2 = await generateBrowserFingerprint()
      expect(fp1).not.toBe(fp2)
    })
  })
})
