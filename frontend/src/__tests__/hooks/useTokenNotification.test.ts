/**
 * Tests for useTokenNotification hook
 *
 * Tests token count notification with deduplication that replaces
 * cascading useEffect patterns for notifying parent components.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useTokenNotification, calculateTotalInputTokens } from '../../hooks/useTokenNotification'

describe('useTokenNotification', () => {
  let mockOnTokenCountChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnTokenCountChange = vi.fn()
  })

  describe('initialization', () => {
    it('should initialize with null last notified value', () => {
      const { result } = renderHook(() =>
        useTokenNotification({
          tokenCount: null,
          onTokenCountChange: mockOnTokenCountChange,
        })
      )

      expect(result.current.lastNotifiedValue).toBe(null)
    })
  })

  describe('automatic notification', () => {
    it('should notify parent when tokenCount changes', async () => {
      const { rerender } = renderHook(
        ({ tokenCount }) =>
          useTokenNotification({
            tokenCount,
            onTokenCountChange: mockOnTokenCountChange,
          }),
        { initialProps: { tokenCount: null as number | null } }
      )

      // Initial render with null
      expect(mockOnTokenCountChange).not.toHaveBeenCalled()

      // Change to 100
      rerender({ tokenCount: 100 })

      // Wait for microtask to complete
      await waitFor(() => {
        expect(mockOnTokenCountChange).toHaveBeenCalledWith(100)
      })
    })

    it('should deduplicate repeated notifications with same value', async () => {
      const { rerender } = renderHook(
        ({ tokenCount }) =>
          useTokenNotification({
            tokenCount,
            onTokenCountChange: mockOnTokenCountChange,
          }),
        { initialProps: { tokenCount: 100 as number | null } }
      )

      await waitFor(() => {
        expect(mockOnTokenCountChange).toHaveBeenCalledWith(100)
      })

      mockOnTokenCountChange.mockClear()

      // Rerender with same value
      rerender({ tokenCount: 100 })

      // Wait a bit to ensure no extra calls
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should NOT have been called again
      expect(mockOnTokenCountChange).not.toHaveBeenCalled()
    })

    it('should notify when value changes from number to null', async () => {
      const { rerender } = renderHook(
        ({ tokenCount }) =>
          useTokenNotification({
            tokenCount,
            onTokenCountChange: mockOnTokenCountChange,
          }),
        { initialProps: { tokenCount: 100 as number | null } }
      )

      await waitFor(() => {
        expect(mockOnTokenCountChange).toHaveBeenCalledWith(100)
      })

      mockOnTokenCountChange.mockClear()

      // Change to null
      rerender({ tokenCount: null })

      await waitFor(() => {
        expect(mockOnTokenCountChange).toHaveBeenCalledWith(null)
      })
    })
  })

  describe('manual notification', () => {
    it('should allow manual notification via notifyTokenCount', async () => {
      const { result } = renderHook(() =>
        useTokenNotification({
          tokenCount: null,
          onTokenCountChange: mockOnTokenCountChange,
        })
      )

      act(() => {
        result.current.notifyTokenCount(500)
      })

      expect(mockOnTokenCountChange).toHaveBeenCalledWith(500)
    })

    it('should deduplicate manual notifications with same value', () => {
      const { result } = renderHook(() =>
        useTokenNotification({
          tokenCount: null,
          onTokenCountChange: mockOnTokenCountChange,
        })
      )

      act(() => {
        result.current.notifyTokenCount(500)
      })

      expect(mockOnTokenCountChange).toHaveBeenCalledTimes(1)

      act(() => {
        result.current.notifyTokenCount(500)
      })

      // Should still be 1 (deduplicated)
      expect(mockOnTokenCountChange).toHaveBeenCalledTimes(1)
    })

    it('should notify when manual value changes', () => {
      const { result } = renderHook(() =>
        useTokenNotification({
          tokenCount: null,
          onTokenCountChange: mockOnTokenCountChange,
        })
      )

      act(() => {
        result.current.notifyTokenCount(500)
      })

      expect(mockOnTokenCountChange).toHaveBeenCalledWith(500)

      act(() => {
        result.current.notifyTokenCount(600)
      })

      expect(mockOnTokenCountChange).toHaveBeenCalledWith(600)
      expect(mockOnTokenCountChange).toHaveBeenCalledTimes(2)
    })
  })

  describe('enabled flag', () => {
    it('should not notify when disabled', async () => {
      const { rerender } = renderHook(
        ({ tokenCount, enabled }) =>
          useTokenNotification({
            tokenCount,
            onTokenCountChange: mockOnTokenCountChange,
            enabled,
          }),
        { initialProps: { tokenCount: null as number | null, enabled: false } }
      )

      // Change tokenCount while disabled
      rerender({ tokenCount: 100, enabled: false })

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockOnTokenCountChange).not.toHaveBeenCalled()
    })

    it('should notify when value changes while enabled', async () => {
      // This test verifies that when enabled, value changes trigger notifications
      const { rerender } = renderHook(
        ({ tokenCount, enabled }) =>
          useTokenNotification({
            tokenCount,
            onTokenCountChange: mockOnTokenCountChange,
            enabled,
          }),
        { initialProps: { tokenCount: null as number | null, enabled: true } }
      )

      // Change value while enabled
      rerender({ tokenCount: 100, enabled: true })

      await waitFor(() => {
        expect(mockOnTokenCountChange).toHaveBeenCalledWith(100)
      })

      mockOnTokenCountChange.mockClear()

      // Change value again
      rerender({ tokenCount: 200, enabled: true })

      await waitFor(() => {
        expect(mockOnTokenCountChange).toHaveBeenCalledWith(200)
      })
    })

    it('should not re-notify same value when re-enabled', async () => {
      const { rerender } = renderHook(
        ({ tokenCount, enabled }) =>
          useTokenNotification({
            tokenCount,
            onTokenCountChange: mockOnTokenCountChange,
            enabled,
          }),
        { initialProps: { tokenCount: 100 as number | null, enabled: true } }
      )

      // Wait for initial notification
      await waitFor(() => {
        expect(mockOnTokenCountChange).toHaveBeenCalledWith(100)
      })

      mockOnTokenCountChange.mockClear()

      // Disable
      rerender({ tokenCount: 100, enabled: false })

      // Re-enable with same value - should NOT notify again (deduplication)
      rerender({ tokenCount: 100, enabled: true })

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should not have been called because value is same as lastNotified
      expect(mockOnTokenCountChange).not.toHaveBeenCalled()
    })
  })

  describe('no callback provided', () => {
    it('should not throw when onTokenCountChange is undefined', async () => {
      const { rerender } = renderHook(
        ({ tokenCount }) =>
          useTokenNotification({
            tokenCount,
            onTokenCountChange: undefined,
          }),
        { initialProps: { tokenCount: null as number | null } }
      )

      // Should not throw
      expect(() => {
        rerender({ tokenCount: 100 })
      }).not.toThrow()
    })
  })
})

describe('calculateTotalInputTokens', () => {
  it('should return totalInputTokens from tokenUsageInfo when available', () => {
    const result = calculateTotalInputTokens(
      { totalInputTokens: 1000 },
      { input_tokens: 500 },
      false
    )

    expect(result).toBe(1000)
  })

  it('should return input_tokens from accurateTokenCounts when not in follow-up mode', () => {
    const result = calculateTotalInputTokens(null, { input_tokens: 500 }, false)

    expect(result).toBe(500)
  })

  it('should return null when in follow-up mode without tokenUsageInfo', () => {
    const result = calculateTotalInputTokens(null, { input_tokens: 500 }, true)

    expect(result).toBe(null)
  })

  it('should return null when no data available', () => {
    const result = calculateTotalInputTokens(null, null, false)

    expect(result).toBe(null)
  })

  it('should prioritize tokenUsageInfo over accurateTokenCounts', () => {
    const result = calculateTotalInputTokens(
      { totalInputTokens: 1000 },
      { input_tokens: 500 },
      true
    )

    // tokenUsageInfo takes priority regardless of follow-up mode
    expect(result).toBe(1000)
  })
})
