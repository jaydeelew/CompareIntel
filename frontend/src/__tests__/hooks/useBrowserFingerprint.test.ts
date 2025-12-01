/**
 * Tests for useBrowserFingerprint hook
 *
 * Tests fingerprint generation, state updates, and side effects.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useBrowserFingerprint } from '../../hooks/useBrowserFingerprint'
import * as fingerprintUtils from '../../utils/fingerprint'

// Mock the fingerprint utility
vi.mock('../../utils/fingerprint', () => ({
  generateBrowserFingerprint: vi.fn(),
}))

describe('useBrowserFingerprint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with empty fingerprint', () => {
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockResolvedValue('mock-fingerprint')

    const { result } = renderHook(() => useBrowserFingerprint())

    expect(result.current.browserFingerprint).toBe('')
  })

  it('should generate fingerprint on mount', async () => {
    const mockFingerprint = 'test-fingerprint-123'
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockResolvedValue(mockFingerprint)

    const { result } = renderHook(() => useBrowserFingerprint())

    await waitFor(() => {
      expect(result.current.browserFingerprint).toBe(mockFingerprint)
    })

    expect(fingerprintUtils.generateBrowserFingerprint).toHaveBeenCalledTimes(1)
  })

  it('should allow manual setting of fingerprint', async () => {
    const mockFingerprint = 'auto-generated-fingerprint'
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockResolvedValue(mockFingerprint)

    const { result } = renderHook(() => useBrowserFingerprint())

    await waitFor(() => {
      expect(result.current.browserFingerprint).toBe(mockFingerprint)
    })

    // Manually set fingerprint
    act(() => {
      result.current.setBrowserFingerprint('manual-fingerprint')
    })

    expect(result.current.browserFingerprint).toBe('manual-fingerprint')
  })

  it('should handle fingerprint generation errors gracefully', async () => {
    const error = new Error('Fingerprint generation failed')
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockRejectedValue(error)

    const { result } = renderHook(() => useBrowserFingerprint())

    await waitFor(
      () => {
        expect(fingerprintUtils.generateBrowserFingerprint).toHaveBeenCalled()
      },
      { timeout: 1000 }
    )

    // Fingerprint should remain empty on error
    expect(result.current.browserFingerprint).toBe('')
  })

  it('should only generate fingerprint once on mount', async () => {
    const mockFingerprint = 'single-generation-fingerprint'
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockResolvedValue(mockFingerprint)

    const { rerender } = renderHook(() => useBrowserFingerprint())

    await waitFor(() => {
      expect(fingerprintUtils.generateBrowserFingerprint).toHaveBeenCalledTimes(1)
    })

    // Rerender should not trigger another generation
    rerender()

    await waitFor(() => {
      expect(fingerprintUtils.generateBrowserFingerprint).toHaveBeenCalledTimes(1)
    })
  })

  it('should handle setBrowserFingerprint with function updater', async () => {
    const mockFingerprint = 'initial-fingerprint'
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockResolvedValue(mockFingerprint)

    const { result } = renderHook(() => useBrowserFingerprint())

    await waitFor(() => {
      expect(result.current.browserFingerprint).toBe(mockFingerprint)
    })

    // Use function updater
    act(() => {
      result.current.setBrowserFingerprint(prev => `${prev}-updated`)
    })

    expect(result.current.browserFingerprint).toBe(`${mockFingerprint}-updated`)
  })

  it('should handle multiple rapid setBrowserFingerprint calls', async () => {
    const mockFingerprint = 'base-fingerprint'
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockResolvedValue(mockFingerprint)

    const { result } = renderHook(() => useBrowserFingerprint())

    await waitFor(() => {
      expect(result.current.browserFingerprint).toBe(mockFingerprint)
    })

    // Set multiple times rapidly
    act(() => {
      result.current.setBrowserFingerprint('fingerprint1')
      result.current.setBrowserFingerprint('fingerprint2')
      result.current.setBrowserFingerprint('fingerprint3')
    })

    expect(result.current.browserFingerprint).toBe('fingerprint3')
  })

  it('should handle empty string fingerprint', async () => {
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockResolvedValue('')

    const { result } = renderHook(() => useBrowserFingerprint())

    await waitFor(() => {
      expect(result.current.browserFingerprint).toBe('')
    })
  })

  it('should handle very long fingerprint strings', async () => {
    const longFingerprint = 'a'.repeat(1000)
    vi.mocked(fingerprintUtils.generateBrowserFingerprint).mockResolvedValue(longFingerprint)

    const { result } = renderHook(() => useBrowserFingerprint())

    await waitFor(() => {
      expect(result.current.browserFingerprint).toBe(longFingerprint)
    })
  })
})
