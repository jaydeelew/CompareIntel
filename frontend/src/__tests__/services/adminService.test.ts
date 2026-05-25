/**
 * Tests for adminService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import * as adminService from '../../services/adminService'
import { ApiError } from '../../services/api/errors'
import { createUserId } from '../../types'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'
import { createMockUser } from '../utils'

const baseAppSettings: adminService.AppSettings = {
  anonymous_mock_mode_enabled: false,
  is_development: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  anonymous_users_with_usage: 0,
  anonymous_db_usage_count: 0,
}

describe('adminService', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('listUsers', () => {
    it('should list users without filters', async () => {
      const mockResponse = {
        users: [createMockUser(), createMockUser()],
        total: 2,
        page: 1,
        per_page: 10,
        total_pages: 1,
      }

      server.use(
        http.get(apiPathGlob('/api/admin/users'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.pathname.endsWith('/api/admin/users')).toBe(true)
          expect(u.searchParams.toString()).toBe('')
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await adminService.listUsers()
      expect(result).toEqual(mockResponse)
    })

    it('should list users with pagination', async () => {
      const mockResponse = {
        users: [createMockUser()],
        total: 1,
        page: 2,
        per_page: 10,
        total_pages: 1,
      }

      server.use(
        http.get(apiPathGlob('/api/admin/users'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('page')).toBe('2')
          expect(u.searchParams.get('per_page')).toBe('10')
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await adminService.listUsers({ page: 2, per_page: 10 })
      expect(result).toEqual(mockResponse)
    })

    it('should list users with filters', async () => {
      const mockResponse = {
        users: [createMockUser({ subscription_tier: 'pro' })],
        total: 1,
        page: 1,
        per_page: 10,
        total_pages: 1,
      }

      server.use(
        http.get(apiPathGlob('/api/admin/users'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('search')).toBe('test')
          expect(u.searchParams.get('role')).toBe('user')
          expect(u.searchParams.get('tier')).toBe('pro')
          expect(u.searchParams.get('is_active')).toBe('true')
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await adminService.listUsers({
        search: 'test',
        role: 'user',
        tier: 'pro',
        is_active: true,
      })
      expect(result).toEqual(mockResponse)
    })

    it('should handle API errors', () => {
      server.use(
        http.get(apiPathGlob('/api/admin/users'), () =>
          HttpResponse.json({ detail: 'Access forbidden' }, { status: 403 })
        )
      )

      return expect(adminService.listUsers()).rejects.toThrow(ApiError)
    })
  })

  describe('getAdminStats', () => {
    it('should get admin statistics', async () => {
      const mockStats = {
        total_users: 100,
        active_users: 80,
        verified_users: 75,
        users_by_tier: { free: 50, pro: 30 },
        users_by_role: { user: 95, admin: 5 },
        recent_registrations: 10,
        total_usage_today: 500,
        admin_actions_today: 5,
      }

      server.use(http.get(apiPathGlob('/api/admin/stats'), () => HttpResponse.json(mockStats)))

      const result = await adminService.getAdminStats()
      expect(result).toEqual(mockStats)
    })
  })

  describe('getUser', () => {
    it('should get user details', async () => {
      const userId = createUserId(1)
      const mockUser = createMockUser({ id: userId })

      server.use(
        http.get(apiPathGlob(`/api/admin/users/${userId}`), () => HttpResponse.json(mockUser))
      )

      const result = await adminService.getUser(userId)
      expect(result).toEqual(mockUser)
    })
  })

  describe('createUser', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
        subscription_tier: 'free',
      }

      const mockUser = createMockUser({ email: userData.email })
      server.use(
        http.post(apiPathGlob('/api/admin/users'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.email).toBe(userData.email)
          return HttpResponse.json(mockUser)
        })
      )

      const result = await adminService.createUser(userData)
      expect(result).toEqual(mockUser)
    })
  })

  describe('updateUser', () => {
    it('should update a user', async () => {
      const userId = createUserId(1)
      const userData = {
        subscription_tier: 'pro',
        is_active: true,
      }

      const mockUser = createMockUser({ id: userId, subscription_tier: 'pro' })
      server.use(
        http.put(apiPathGlob(`/api/admin/users/${userId}`), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.subscription_tier).toBe('pro')
          expect(body.is_active).toBe(true)
          return HttpResponse.json(mockUser)
        })
      )

      const result = await adminService.updateUser(userId, userData)
      expect(result).toEqual(mockUser)
    })
  })

  describe('deleteUser', () => {
    it('should delete a user', async () => {
      const userId = createUserId(1)
      let invoked = false
      server.use(
        http.delete(apiPathGlob(`/api/admin/users/${userId}`), ({ request }) => {
          invoked = true
          expect(request.method).toBe('DELETE')
          return new HttpResponse(null, { status: 204 })
        })
      )

      await adminService.deleteUser(userId)
      expect(invoked).toBe(true)
    })
  })

  describe('resetUserPassword', () => {
    it('should reset user password', async () => {
      const userId = createUserId(1)
      const newPassword = 'new-password-123'
      const mockResponse = { message: 'Password reset successfully' }

      server.use(
        http.post(apiPathGlob(`/api/admin/users/${userId}/reset-password`), async ({ request }) => {
          const body = (await request.json()) as { new_password: string }
          expect(body.new_password).toBe(newPassword)
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await adminService.resetUserPassword(userId, newPassword)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('sendUserVerification', () => {
    it('should send verification email to user', async () => {
      const userId = createUserId(1)
      const mockResponse = { message: 'Verification email sent' }

      server.use(
        http.post(apiPathGlob(`/api/admin/users/${userId}/send-verification`), () =>
          HttpResponse.json(mockResponse)
        )
      )

      const result = await adminService.sendUserVerification(userId)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('toggleUserActive', () => {
    it('should toggle user active status', async () => {
      const userId = createUserId(1)
      const mockUser = createMockUser({ id: userId, is_active: false })
      server.use(
        http.post(apiPathGlob(`/api/admin/users/${userId}/toggle-active`), () =>
          HttpResponse.json(mockUser)
        )
      )

      const result = await adminService.toggleUserActive(userId)
      expect(result).toEqual(mockUser)
    })
  })

  describe('resetUserUsage', () => {
    it('should reset user usage statistics', async () => {
      const userId = createUserId(1)
      const mockUser = createMockUser({ id: userId, daily_usage_count: 0 })
      server.use(
        http.post(apiPathGlob(`/api/admin/users/${userId}/reset-usage`), () =>
          HttpResponse.json(mockUser)
        )
      )

      const result = await adminService.resetUserUsage(userId)
      expect(result).toEqual(mockUser)
    })
  })

  describe('toggleUserMockMode', () => {
    it('should toggle user mock mode', async () => {
      const userId = createUserId(1)
      const mockUser = createMockUser({ id: userId, mock_mode_enabled: true })
      server.use(
        http.post(apiPathGlob(`/api/admin/users/${userId}/toggle-mock-mode`), () =>
          HttpResponse.json(mockUser)
        )
      )

      const result = await adminService.toggleUserMockMode(userId)
      expect(result).toEqual(mockUser)
    })
  })

  describe('changeUserTier', () => {
    it('should change user subscription tier', async () => {
      const userId = createUserId(1)
      const tier = 'pro'
      const mockUser = createMockUser({ id: userId, subscription_tier: tier })
      server.use(
        http.post(apiPathGlob(`/api/admin/users/${userId}/change-tier`), async ({ request }) => {
          const body = (await request.json()) as { subscription_tier: string }
          expect(body.subscription_tier).toBe(tier)
          return HttpResponse.json(mockUser)
        })
      )

      const result = await adminService.changeUserTier(userId, tier)
      expect(result).toEqual(mockUser)
    })
  })

  describe('getActionLogs', () => {
    it('should get action logs without filters', async () => {
      const mockLogs = [
        {
          id: 1,
          admin_user_id: 1,
          target_user_id: 2,
          action_type: 'user_update',
          action_description: 'Updated user',
          details: null,
          ip_address: '127.0.0.1',
          user_agent: 'test',
          created_at: new Date().toISOString(),
        },
      ]

      server.use(
        http.get(apiPathGlob('/api/admin/action-logs'), ({ request }) => {
          expect(new URL(request.url).searchParams.toString()).toBe('')
          return HttpResponse.json(mockLogs)
        })
      )

      const result = await adminService.getActionLogs()
      expect(result).toEqual(mockLogs)
    })

    it('should get action logs with filters', async () => {
      const mockLogs: adminService.AdminActionLog[] = []
      server.use(
        http.get(apiPathGlob('/api/admin/action-logs'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('page')).toBe('1')
          expect(u.searchParams.get('per_page')).toBe('20')
          expect(u.searchParams.get('action_type')).toBe('user_update')
          return HttpResponse.json(mockLogs)
        })
      )

      const result = await adminService.getActionLogs({
        page: 1,
        per_page: 20,
        action_type: 'user_update',
      })
      expect(result).toEqual(mockLogs)
    })
  })

  describe('getAppSettings', () => {
    it('should get app settings', async () => {
      const mockSettings = { ...baseAppSettings }

      server.use(
        http.get(apiPathGlob('/api/admin/settings'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.pathname.endsWith('/api/admin/settings')).toBe(true)
          return HttpResponse.json(mockSettings)
        })
      )

      const result = await adminService.getAppSettings()
      expect(result).toEqual(mockSettings)
    })
  })

  describe('toggleAnonymousMockMode', () => {
    it('should toggle anonymous mock mode', async () => {
      const mockSettings = {
        ...baseAppSettings,
        anonymous_mock_mode_enabled: true,
      }

      server.use(
        http.post(apiPathGlob('/api/admin/settings/toggle-anonymous-mock-mode'), () =>
          HttpResponse.json(mockSettings)
        )
      )

      const result = await adminService.toggleAnonymousMockMode()
      expect(result).toEqual(mockSettings)
    })
  })

  describe('zeroAnonymousUsage', () => {
    it('should zero out anonymous usage statistics', async () => {
      const mockResponse = { message: 'Anonymous usage zeroed' }

      server.use(
        http.post(apiPathGlob('/api/admin/settings/zero-anonymous-usage'), () =>
          HttpResponse.json(mockResponse)
        )
      )

      const result = await adminService.zeroAnonymousUsage()
      expect(result).toEqual(mockResponse)
    })
  })
})
