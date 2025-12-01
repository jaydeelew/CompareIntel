/**
 * Tests for adminService
 *
 * Tests admin endpoints, user management, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import * as adminService from '../../services/adminService'
import { apiClient } from '../../services/api/client'
import { ApiError } from '../../services/api/errors'
import { createUserId } from '../../types'
import { createMockUser } from '../utils'

// Mock the API client
vi.mock('../../services/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('adminService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse })

      const result = await adminService.listUsers()

      expect(apiClient.get).toHaveBeenCalledWith('/admin/users')
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

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse })

      const result = await adminService.listUsers({ page: 2, per_page: 10 })

      expect(apiClient.get).toHaveBeenCalledWith('/admin/users?page=2&per_page=10')
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

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse })

      const result = await adminService.listUsers({
        search: 'test',
        role: 'user',
        tier: 'pro',
        is_active: true,
      })

      expect(apiClient.get).toHaveBeenCalledWith(
        '/admin/users?search=test&role=user&tier=pro&is_active=true'
      )
      expect(result).toEqual(mockResponse)
    })

    it('should handle API errors', async () => {
      const error = new ApiError('Access forbidden', 403, 'Forbidden')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(adminService.listUsers()).rejects.toThrow(ApiError)
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

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStats })

      const result = await adminService.getAdminStats()

      expect(apiClient.get).toHaveBeenCalledWith('/admin/stats')
      expect(result).toEqual(mockStats)
    })
  })

  describe('getUser', () => {
    it('should get user details', async () => {
      const userId = createUserId(1)
      const mockUser = createMockUser({ id: userId })

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockUser })

      const result = await adminService.getUser(userId)

      expect(apiClient.get).toHaveBeenCalledWith(`/admin/users/${userId}`)
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
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockUser })

      const result = await adminService.createUser(userData)

      expect(apiClient.post).toHaveBeenCalledWith('/admin/users', userData)
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
      vi.mocked(apiClient.put).mockResolvedValue({ data: mockUser })

      const result = await adminService.updateUser(userId, userData)

      expect(apiClient.put).toHaveBeenCalledWith(`/admin/users/${userId}`, userData)
      expect(result).toEqual(mockUser)
    })
  })

  describe('deleteUser', () => {
    it('should delete a user', async () => {
      const userId = createUserId(1)
      vi.mocked(apiClient.delete).mockResolvedValue(undefined)

      await adminService.deleteUser(userId)

      expect(apiClient.delete).toHaveBeenCalledWith(`/admin/users/${userId}`)
    })
  })

  describe('resetUserPassword', () => {
    it('should reset user password', async () => {
      const userId = createUserId(1)
      const newPassword = 'new-password-123'
      const mockResponse = { message: 'Password reset successfully' }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await adminService.resetUserPassword(userId, newPassword)

      expect(apiClient.post).toHaveBeenCalledWith(`/admin/users/${userId}/reset-password`, {
        new_password: newPassword,
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('sendUserVerification', () => {
    it('should send verification email to user', async () => {
      const userId = createUserId(1)
      const mockResponse = { message: 'Verification email sent' }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await adminService.sendUserVerification(userId)

      expect(apiClient.post).toHaveBeenCalledWith(`/admin/users/${userId}/send-verification`)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('toggleUserActive', () => {
    it('should toggle user active status', async () => {
      const userId = createUserId(1)
      const mockUser = createMockUser({ id: userId, is_active: false })
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockUser })

      const result = await adminService.toggleUserActive(userId)

      expect(apiClient.post).toHaveBeenCalledWith(`/admin/users/${userId}/toggle-active`)
      expect(result).toEqual(mockUser)
    })
  })

  describe('resetUserUsage', () => {
    it('should reset user usage statistics', async () => {
      const userId = createUserId(1)
      const mockUser = createMockUser({ id: userId, daily_usage_count: 0 })
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockUser })

      const result = await adminService.resetUserUsage(userId)

      expect(apiClient.post).toHaveBeenCalledWith(`/admin/users/${userId}/reset-usage`)
      expect(result).toEqual(mockUser)
    })
  })

  describe('toggleUserMockMode', () => {
    it('should toggle user mock mode', async () => {
      const userId = createUserId(1)
      const mockUser = createMockUser({ id: userId, mock_mode_enabled: true })
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockUser })

      const result = await adminService.toggleUserMockMode(userId)

      expect(apiClient.post).toHaveBeenCalledWith(`/admin/users/${userId}/toggle-mock-mode`)
      expect(result).toEqual(mockUser)
    })
  })

  describe('changeUserTier', () => {
    it('should change user subscription tier', async () => {
      const userId = createUserId(1)
      const tier = 'pro'
      const mockUser = createMockUser({ id: userId, subscription_tier: tier })
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockUser })

      const result = await adminService.changeUserTier(userId, tier)

      expect(apiClient.post).toHaveBeenCalledWith(`/admin/users/${userId}/change-tier`, {
        subscription_tier: tier,
      })
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

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockLogs })

      const result = await adminService.getActionLogs()

      expect(apiClient.get).toHaveBeenCalledWith('/admin/action-logs')
      expect(result).toEqual(mockLogs)
    })

    it('should get action logs with filters', async () => {
      const mockLogs: adminService.AdminActionLog[] = []
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockLogs })

      const result = await adminService.getActionLogs({
        page: 1,
        per_page: 20,
        action_type: 'user_update',
      })

      expect(apiClient.get).toHaveBeenCalledWith(
        '/admin/action-logs?page=1&per_page=20&action_type=user_update'
      )
      expect(result).toEqual(mockLogs)
    })
  })

  describe('getAppSettings', () => {
    it('should get app settings', async () => {
      const mockSettings = {
        anonymous_mock_mode_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSettings })

      const result = await adminService.getAppSettings()

      expect(apiClient.get).toHaveBeenCalledWith('/admin/settings')
      expect(result).toEqual(mockSettings)
    })
  })

  describe('toggleAnonymousMockMode', () => {
    it('should toggle anonymous mock mode', async () => {
      const mockSettings = {
        anonymous_mock_mode_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockSettings })

      const result = await adminService.toggleAnonymousMockMode()

      expect(apiClient.post).toHaveBeenCalledWith('/admin/settings/toggle-anonymous-mock-mode')
      expect(result).toEqual(mockSettings)
    })
  })

  describe('zeroAnonymousUsage', () => {
    it('should zero out anonymous usage statistics', async () => {
      const mockResponse = { message: 'Anonymous usage zeroed' }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await adminService.zeroAnonymousUsage()

      expect(apiClient.post).toHaveBeenCalledWith('/admin/settings/zero-anonymous-usage')
      expect(result).toEqual(mockResponse)
    })
  })
})
