/**
 * Tests for useRateLimitStatus hook
 *
 * Tests rate limit fetching, state updates, localStorage handling, and error handling.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useRateLimitStatus } from '../../hooks/useRateLimitStatus'
import * as compareService from '../../services/compareService'
import { createMockRateLimitStatus } from '../utils'

// Mock the compare service
vi.mock('../../services/compareService', () => ({
  getRateLimitStatus: vi.fn(),
}))

describe('useRateLimitStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: '',
        })
      )

      expect(result.current.usageCount).toBe(0)
      expect(result.current.rateLimitStatus).toBe(null)
    })

    it('should not fetch when not authenticated and no fingerprint', async () => {
      renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: '',
        })
      )

      await waitFor(() => {
        expect(compareService.getRateLimitStatus).not.toHaveBeenCalled()
      })
    })
  })

  describe('authenticated users', () => {
    it('should fetch rate limit status on mount', async () => {
      const mockStatus = createMockRateLimitStatus({
        daily_usage: 5,
        daily_limit: 20,
        subscription_tier: 'free',
      })

      vi.mocked(compareService.getRateLimitStatus).mockResolvedValue(mockStatus)

      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: true,
          browserFingerprint: '',
        })
      )

      await waitFor(() => {
        expect(result.current.rateLimitStatus).toEqual(mockStatus)
      })

      expect(compareService.getRateLimitStatus).toHaveBeenCalledWith(undefined)
    })

    it('should fetch when authentication status changes', async () => {
      const mockStatus = createMockRateLimitStatus()
      vi.mocked(compareService.getRateLimitStatus).mockResolvedValue(mockStatus)

      const { result: _result, rerender } = renderHook(
        ({ isAuthenticated, browserFingerprint }) =>
          useRateLimitStatus({ isAuthenticated, browserFingerprint }),
        {
          initialProps: {
            isAuthenticated: false,
            browserFingerprint: '',
          },
        }
      )

      expect(compareService.getRateLimitStatus).not.toHaveBeenCalled()

      rerender({ isAuthenticated: true, browserFingerprint: '' })

      await waitFor(() => {
        expect(compareService.getRateLimitStatus).toHaveBeenCalled()
      })
    })
  })

  describe('unregistered users', () => {
    it('should fetch rate limit status with fingerprint', async () => {
      const mockStatus = createMockRateLimitStatus({
        daily_usage: 3,
        daily_limit: 10,
        user_type: 'anonymous',
      })

      vi.mocked(compareService.getRateLimitStatus).mockResolvedValue(mockStatus)

      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: 'test-fingerprint-123',
        })
      )

      await waitFor(() => {
        expect(result.current.rateLimitStatus).toEqual(mockStatus)
      })

      expect(compareService.getRateLimitStatus).toHaveBeenCalledWith('test-fingerprint-123')
    })

    it('should load usage count from localStorage', async () => {
      const today = new Date().toDateString()
      localStorage.setItem('compareintel_usage', JSON.stringify({ count: 5, date: today }))

      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: 'test-fingerprint',
        })
      )

      await waitFor(() => {
        expect(result.current.usageCount).toBe(5)
      })
    })

    it('should reset usage count if date is different', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      localStorage.setItem(
        'compareintel_usage',
        JSON.stringify({ count: 5, date: yesterday.toDateString() })
      )

      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: 'test-fingerprint',
        })
      )

      await waitFor(() => {
        expect(result.current.usageCount).toBe(0)
        // Should remove old localStorage entry when date is different
        expect(localStorage.getItem('compareintel_usage')).toBeNull()
      })
    })

    // Note: Extended usage count tests removed - functionality was removed from useRateLimitStatus hook

    it('should handle invalid localStorage data gracefully', async () => {
      localStorage.setItem('compareintel_usage', 'invalid-json')

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: 'test-fingerprint',
        })
      )

      await waitFor(() => {
        expect(result.current.usageCount).toBe(0)
      })

      consoleErrorSpy.mockRestore()
    })
  })

  describe('setUsageCount', () => {
    it('should allow setting usage count', async () => {
      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: 'test-fingerprint',
        })
      )

      await waitFor(() => {
        expect(result.current.usageCount).toBe(0)
      })

      act(() => {
        result.current.setUsageCount(5)
      })

      expect(result.current.usageCount).toBe(5)
    })

    it('should allow setting with function updater', async () => {
      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: 'test-fingerprint',
        })
      )

      act(() => {
        result.current.setUsageCount(3)
        result.current.setUsageCount(prev => prev + 2)
      })

      expect(result.current.usageCount).toBe(5)
    })
  })

  // Note: Extended usage count functionality was removed from useRateLimitStatus hook
  // The hook now only tracks regular usage count

  describe('fetchRateLimitStatus', () => {
    it('should allow manual fetching', async () => {
      const mockStatus = createMockRateLimitStatus()
      vi.mocked(compareService.getRateLimitStatus).mockResolvedValue(mockStatus)

      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: true,
          browserFingerprint: '',
        })
      )

      await waitFor(() => {
        expect(result.current.rateLimitStatus).toEqual(mockStatus)
      })

      const newStatus = createMockRateLimitStatus({ daily_usage: 10 })
      vi.mocked(compareService.getRateLimitStatus).mockResolvedValue(newStatus)

      await act(async () => {
        await result.current.fetchRateLimitStatus()
      })

      expect(result.current.rateLimitStatus).toEqual(newStatus)
    })

    it('should handle fetch errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(compareService.getRateLimitStatus).mockRejectedValue(new Error('API Error'))

      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: true,
          browserFingerprint: '',
        })
      )

      await waitFor(() => {
        expect(result.current.rateLimitStatus).toBe(null)
      })

      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('should not fetch when not authenticated and no fingerprint', async () => {
      const { result } = renderHook(() =>
        useRateLimitStatus({
          isAuthenticated: false,
          browserFingerprint: '',
        })
      )

      await result.current.fetchRateLimitStatus()

      expect(compareService.getRateLimitStatus).not.toHaveBeenCalled()
    })
  })

  describe('fingerprint changes', () => {
    it('should refetch when fingerprint changes', async () => {
      const mockStatus = createMockRateLimitStatus()
      vi.mocked(compareService.getRateLimitStatus).mockResolvedValue(mockStatus)

      const { rerender } = renderHook(
        ({ isAuthenticated, browserFingerprint }) =>
          useRateLimitStatus({ isAuthenticated, browserFingerprint }),
        {
          initialProps: {
            isAuthenticated: false,
            browserFingerprint: 'fingerprint1',
          },
        }
      )

      await waitFor(() => {
        expect(compareService.getRateLimitStatus).toHaveBeenCalledWith('fingerprint1')
      })

      rerender({ isAuthenticated: false, browserFingerprint: 'fingerprint2' })

      await waitFor(() => {
        expect(compareService.getRateLimitStatus).toHaveBeenCalledWith('fingerprint2')
      })
    })
  })
})
