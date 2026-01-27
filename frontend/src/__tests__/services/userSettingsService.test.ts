/**
 * Tests for userSettingsService
 *
 * Tests user preferences/settings API operations and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { apiClient } from '../../services/api/client'
import { ApiError } from '../../services/api/errors'
import * as userSettingsService from '../../services/userSettingsService'
import type { UserPreferences } from '../../services/userSettingsService'

// Mock the API client
vi.mock('../../services/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

describe('userSettingsService', () => {
  const mockPreferences: UserPreferences = {
    preferred_models: ['gpt-4', 'claude-3'],
    theme: 'light',
    email_notifications: true,
    usage_alerts: true,
    zipcode: '12345',
    remember_state_on_logout: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserPreferences', () => {
    it('should get user preferences', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPreferences })

      const result = await userSettingsService.getUserPreferences()

      expect(apiClient.get).toHaveBeenCalledWith('/user/preferences')
      expect(result).toEqual(mockPreferences)
    })

    it('should return preferences with null zipcode', async () => {
      const prefsWithoutZipcode: UserPreferences = {
        ...mockPreferences,
        zipcode: null,
      }
      vi.mocked(apiClient.get).mockResolvedValue({ data: prefsWithoutZipcode })

      const result = await userSettingsService.getUserPreferences()

      expect(result.zipcode).toBeNull()
    })

    it('should handle authentication errors', async () => {
      const error = new ApiError('Not authenticated', 401, 'Unauthorized')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(userSettingsService.getUserPreferences()).rejects.toThrow(ApiError)
    })

    it('should handle server errors', async () => {
      const error = new ApiError('Server error', 500, 'Internal Server Error')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(userSettingsService.getUserPreferences()).rejects.toThrow(ApiError)
    })
  })

  describe('updateUserPreferences', () => {
    it('should update user preferences', async () => {
      const updateData = {
        zipcode: '54321',
        remember_state_on_logout: false,
      }
      const updatedPrefs: UserPreferences = {
        ...mockPreferences,
        ...updateData,
      }
      vi.mocked(apiClient.put).mockResolvedValue({ data: updatedPrefs })

      const result = await userSettingsService.updateUserPreferences(updateData)

      expect(apiClient.put).toHaveBeenCalledWith('/user/preferences', updateData)
      expect(result).toEqual(updatedPrefs)
    })

    it('should update only zipcode', async () => {
      const updateData = { zipcode: '90210' }
      const updatedPrefs: UserPreferences = {
        ...mockPreferences,
        zipcode: '90210',
      }
      vi.mocked(apiClient.put).mockResolvedValue({ data: updatedPrefs })

      const result = await userSettingsService.updateUserPreferences(updateData)

      expect(apiClient.put).toHaveBeenCalledWith('/user/preferences', updateData)
      expect(result.zipcode).toBe('90210')
    })

    it('should update only remember_state_on_logout', async () => {
      const updateData = { remember_state_on_logout: true }
      const updatedPrefs: UserPreferences = {
        ...mockPreferences,
        remember_state_on_logout: true,
      }
      vi.mocked(apiClient.put).mockResolvedValue({ data: updatedPrefs })

      const result = await userSettingsService.updateUserPreferences(updateData)

      expect(apiClient.put).toHaveBeenCalledWith('/user/preferences', updateData)
      expect(result.remember_state_on_logout).toBe(true)
    })

    it('should clear zipcode by setting to null', async () => {
      const updateData = { zipcode: null }
      const updatedPrefs: UserPreferences = {
        ...mockPreferences,
        zipcode: null,
      }
      vi.mocked(apiClient.put).mockResolvedValue({ data: updatedPrefs })

      const result = await userSettingsService.updateUserPreferences(updateData)

      expect(result.zipcode).toBeNull()
    })

    it('should handle validation errors for invalid zipcode', async () => {
      const error = new ApiError('Invalid zipcode format', 422, 'Unprocessable Entity')
      vi.mocked(apiClient.put).mockRejectedValue(error)

      await expect(
        userSettingsService.updateUserPreferences({ zipcode: 'invalid' })
      ).rejects.toThrow(ApiError)
    })

    it('should handle authentication errors', async () => {
      const error = new ApiError('Not authenticated', 401, 'Unauthorized')
      vi.mocked(apiClient.put).mockRejectedValue(error)

      await expect(userSettingsService.updateUserPreferences({ zipcode: '12345' })).rejects.toThrow(
        ApiError
      )
    })

    it('should handle server errors', async () => {
      const error = new ApiError('Server error', 500, 'Internal Server Error')
      vi.mocked(apiClient.put).mockRejectedValue(error)

      await expect(userSettingsService.updateUserPreferences({ zipcode: '12345' })).rejects.toThrow(
        ApiError
      )
    })
  })
})
