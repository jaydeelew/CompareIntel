/**
 * Tests for userSettingsService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { ApiError } from '../../services/api/errors'
import * as userSettingsService from '../../services/userSettingsService'
import type { UserPreferences } from '../../services/userSettingsService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'

describe('userSettingsService', () => {
  const mockPreferences: UserPreferences = {
    preferred_models: ['gpt-4', 'claude-3'],
    theme: 'light',
    email_notifications: true,
    usage_alerts: true,
    zipcode: '12345',
    remember_state_on_logout: true,
    hide_hero_utility_tiles: false,
    remember_text_advanced_settings: false,
    remember_image_advanced_settings: false,
    text_composer_advanced: null,
    image_composer_advanced: null,
  }

  beforeEach(() => {
    server.resetHandlers()
  })

  describe('getUserPreferences', () => {
    it('should get user preferences', async () => {
      server.use(
        http.get(apiPathGlob('/api/user/preferences'), () => HttpResponse.json(mockPreferences))
      )

      const result = await userSettingsService.getUserPreferences()
      expect(result).toEqual(mockPreferences)
    })

    it('should return preferences with null zipcode', async () => {
      const prefsWithoutZipcode: UserPreferences = {
        ...mockPreferences,
        zipcode: null,
      }
      server.use(
        http.get(apiPathGlob('/api/user/preferences'), () => HttpResponse.json(prefsWithoutZipcode))
      )

      const result = await userSettingsService.getUserPreferences()
      expect(result.zipcode).toBeNull()
    })

    it('should handle authentication errors', async () => {
      server.use(
        http.get(apiPathGlob('/api/user/preferences'), () =>
          HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
        )
      )

      await expect(userSettingsService.getUserPreferences()).rejects.toThrow(ApiError)
    })

    it('should handle server errors', async () => {
      server.use(
        http.get(apiPathGlob('/api/user/preferences'), () =>
          HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        )
      )

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
      server.use(
        http.put(apiPathGlob('/api/user/preferences'), async ({ request }) => {
          expect(await request.json()).toEqual(updateData)
          return HttpResponse.json(updatedPrefs)
        })
      )

      const result = await userSettingsService.updateUserPreferences(updateData)
      expect(result).toEqual(updatedPrefs)
    })

    it('should update only zipcode', async () => {
      const updateData = { zipcode: '90210' }
      const updatedPrefs: UserPreferences = {
        ...mockPreferences,
        zipcode: '90210',
      }
      server.use(
        http.put(apiPathGlob('/api/user/preferences'), async ({ request }) => {
          expect(await request.json()).toEqual(updateData)
          return HttpResponse.json(updatedPrefs)
        })
      )

      const result = await userSettingsService.updateUserPreferences(updateData)
      expect(result.zipcode).toBe('90210')
    })

    it('should update only remember_state_on_logout', async () => {
      const updateData = { remember_state_on_logout: true }
      const updatedPrefs: UserPreferences = {
        ...mockPreferences,
        remember_state_on_logout: true,
      }
      server.use(
        http.put(apiPathGlob('/api/user/preferences'), async ({ request }) => {
          expect(await request.json()).toEqual(updateData)
          return HttpResponse.json(updatedPrefs)
        })
      )

      const result = await userSettingsService.updateUserPreferences(updateData)
      expect(result.remember_state_on_logout).toBe(true)
    })

    it('should clear zipcode by setting to null', async () => {
      const updateData = { zipcode: null }
      const updatedPrefs: UserPreferences = {
        ...mockPreferences,
        zipcode: null,
      }
      server.use(
        http.put(apiPathGlob('/api/user/preferences'), async ({ request }) => {
          expect(await request.json()).toEqual(updateData)
          return HttpResponse.json(updatedPrefs)
        })
      )

      const result = await userSettingsService.updateUserPreferences(updateData)
      expect(result.zipcode).toBeNull()
    })

    it('should handle validation errors for invalid zipcode', async () => {
      server.use(
        http.put(apiPathGlob('/api/user/preferences'), () =>
          HttpResponse.json({ detail: 'Invalid zipcode format' }, { status: 422 })
        )
      )

      await expect(
        userSettingsService.updateUserPreferences({ zipcode: 'invalid' })
      ).rejects.toThrow(ApiError)
    })

    it('should handle authentication errors', async () => {
      server.use(
        http.put(apiPathGlob('/api/user/preferences'), () =>
          HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
        )
      )

      await expect(userSettingsService.updateUserPreferences({ zipcode: '12345' })).rejects.toThrow(
        ApiError
      )
    })

    it('should handle server errors', async () => {
      server.use(
        http.put(apiPathGlob('/api/user/preferences'), () =>
          HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        )
      )

      await expect(userSettingsService.updateUserPreferences({ zipcode: '12345' })).rejects.toThrow(
        ApiError
      )
    })
  })
})
