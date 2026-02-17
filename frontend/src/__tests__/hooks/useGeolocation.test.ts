/**
 * Tests for useGeolocation hook
 *
 * Tests saved zipcode precedence, BigDataCloud reverse geocoding,
 * IP fallback, coordinate rounding, and response parsing.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useGeolocation } from '../../hooks/useGeolocation'
import * as userSettingsService from '../../services/userSettingsService'
import type { User } from '../../types'

vi.mock('../../services/userSettingsService', () => ({
  getUserPreferences: vi.fn(),
}))

const mockUser = { id: '1', email: 'test@example.com' } as User

describe('useGeolocation', () => {
  let mockGetCurrentPosition: ReturnType<typeof vi.fn>
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })

    mockGetCurrentPosition = vi.fn()
    mockFetch = vi.fn()

    Object.defineProperty(global, 'navigator', {
      value: {
        geolocation: {
          getCurrentPosition: mockGetCurrentPosition,
        },
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'granted' }),
        },
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'fetch', {
      value: mockFetch,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should return null location initially', () => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: null,
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: false, user: null }))

      expect(result.current.userLocation).toBe(null)
    })
  })

  describe('when not authenticated', () => {
    it('should not load saved location', async () => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: '12345',
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: false, user: null }))

      await vi.runAllTimersAsync()

      expect(userSettingsService.getUserPreferences).not.toHaveBeenCalled()
      expect(result.current.userLocation).toBe(null)
    })
  })

  describe('saved zipcode', () => {
    it('should load location from saved zipcode via zippopotam', async () => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: '12345',
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            places: [{ 'place name': 'New York', state: 'NY' }],
          }),
      })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await waitFor(() => {
        expect(result.current.userLocation).toBe('New York, NY, United States')
      })

      expect(mockFetch).toHaveBeenCalledWith('https://api.zippopotam.us/us/12345')
    })

    it('should not trigger geolocation when saved zipcode exists', async () => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: '90210',
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            places: [{ 'place name': 'Beverly Hills', state: 'CA' }],
          }),
      })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await waitFor(() => {
        expect(result.current.userLocation).toBe('Beverly Hills, CA, United States')
      })

      // Advance past the 5s geolocation timeout - should not call BigDataCloud
      await act(async () => {
        vi.advanceTimersByTime(6000)
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockGetCurrentPosition).not.toHaveBeenCalled()
    })

    it('should handle zipcode lookup failure gracefully', async () => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: '00000',
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })

      mockFetch.mockResolvedValueOnce({ ok: false })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await vi.runAllTimersAsync()

      expect(result.current.userLocation).toBe(null)
    })
  })

  describe('BigDataCloud reverse geocoding', () => {
    beforeEach(() => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: null,
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })
    })

    it('should reverse geocode coordinates and set location', async () => {
      mockGetCurrentPosition.mockImplementation(cb =>
        cb({
          coords: { latitude: 32.7322225, longitude: -97.7898575 },
        })
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            city: 'Weatherford',
            principalSubdivision: 'Texas',
            countryName: 'United States of America (the)',
          }),
      })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      await waitFor(() => {
        expect(result.current.userLocation).toBe('Weatherford, Texas, United States of America')
      })

      // toFixed(6) rounds coords - exact string can vary by float representation
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /reverse-geocode-client\?latitude=32\.73222\d&longitude=-97\.78985\d&localityLanguage=en/
        )
      )
    })

    it('should round coordinates to 6 decimal places', async () => {
      mockGetCurrentPosition.mockImplementation(cb =>
        cb({
          coords: {
            latitude: 37.123456789,
            longitude: -122.987654321,
          },
        })
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            city: 'Mountain View',
            principalSubdivision: 'California',
            countryName: 'United States of America (the)',
          }),
      })

      renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('latitude=37.123457'))
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('longitude=-122.987654'))
      })
    })

    it('should strip (the) suffix from country name', async () => {
      mockGetCurrentPosition.mockImplementation(cb =>
        cb({
          coords: { latitude: 51.5, longitude: -0.1 },
        })
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            city: 'London',
            principalSubdivision: 'England',
            countryName: 'United Kingdom of Great Britain and Northern Ireland (the)',
          }),
      })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      await waitFor(() => {
        expect(result.current.userLocation).toContain(
          'United Kingdom of Great Britain and Northern Ireland'
        )
        expect(result.current.userLocation).not.toContain('(the)')
      })
    })
  })

  describe('IP fallback', () => {
    beforeEach(() => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: null,
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })
    })

    it('should fall back to IP geolocation when coordinate request fails', async () => {
      mockGetCurrentPosition.mockImplementation(cb =>
        cb({
          coords: { latitude: 32.73, longitude: -97.79 },
        })
      )

      mockFetch.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            city: 'Dallas',
            principalSubdivision: 'Texas',
            countryName: 'United States of America (the)',
          }),
      })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      await waitFor(() => {
        expect(result.current.userLocation).toBe('Dallas, Texas, United States of America')
      })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en'
      )
    })

    it('should handle both coordinate and IP fallback failures gracefully', async () => {
      mockGetCurrentPosition.mockImplementation(cb =>
        cb({
          coords: { latitude: 32.73, longitude: -97.79 },
        })
      )

      mockFetch.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false })

      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2)
      })

      expect(result.current.userLocation).toBe(null)
    })
  })

  describe('geolocation permission denied', () => {
    beforeEach(() => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: null,
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })

      Object.defineProperty(global, 'navigator', {
        value: {
          geolocation: { getCurrentPosition: mockGetCurrentPosition },
          permissions: {
            query: vi.fn().mockResolvedValue({ state: 'denied' }),
          },
        },
        writable: true,
        configurable: true,
      })
    })

    it('should not attempt geolocation when permission is denied', async () => {
      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      expect(mockGetCurrentPosition).not.toHaveBeenCalled()
      expect(result.current.userLocation).toBe(null)
    })
  })

  describe('geolocation unavailable', () => {
    beforeEach(() => {
      vi.mocked(userSettingsService.getUserPreferences).mockResolvedValue({
        zipcode: null,
        theme: 'light',
        email_notifications: false,
        usage_alerts: false,
        preferred_models: null,
        remember_state_on_logout: false,
      })

      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      })
    })

    it('should return null when geolocation is not supported', async () => {
      const { result } = renderHook(() => useGeolocation({ isAuthenticated: true, user: mockUser }))

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      expect(result.current.userLocation).toBe(null)
    })
  })
})
