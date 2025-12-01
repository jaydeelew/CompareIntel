/**
 * Tests for authService
 *
 * Tests authentication endpoints, token management, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { apiClient } from '../../services/api/client'
import { ApiError } from '../../services/api/errors'
import * as authService from '../../services/authService'
import {
  createMockUser,
  createMockAuthResponse,
  createMockLoginCredentials,
  createMockRegisterData,
} from '../utils'

// Mock the API client
vi.mock('../../services/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('register', () => {
    it('should register a new user', async () => {
      const registerData = createMockRegisterData()
      const mockResponse = createMockAuthResponse()
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await authService.register(registerData)

      expect(apiClient.post).toHaveBeenCalledWith('/auth/register', {
        email: registerData.email,
        password: registerData.password,
      })
      expect(result).toEqual(mockResponse)
    })

    it('should handle registration errors', async () => {
      const registerData = createMockRegisterData()
      const error = new ApiError('Email already exists', 400, 'Bad Request')
      vi.mocked(apiClient.post).mockRejectedValue(error)

      await expect(authService.register(registerData)).rejects.toThrow(ApiError)
    })
  })

  describe('login', () => {
    it('should login a user', async () => {
      const credentials = createMockLoginCredentials()
      const mockResponse = createMockAuthResponse()
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await authService.login(credentials)

      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', credentials)
      expect(result).toEqual(mockResponse)
    })

    it('should handle login errors', async () => {
      const credentials = createMockLoginCredentials()
      const error = new ApiError('Invalid credentials', 401, 'Unauthorized')
      vi.mocked(apiClient.post).mockRejectedValue(error)

      await expect(authService.login(credentials)).rejects.toThrow(ApiError)
    })
  })

  describe('refreshToken', () => {
    it('should refresh access token', async () => {
      const refreshToken = 'refresh-token-123'
      const mockResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'bearer',
      }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await authService.refreshToken(refreshToken)

      expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh', {
        refresh_token: refreshToken,
      })
      expect(result).toEqual(mockResponse)
    })

    it('should handle refresh token errors', async () => {
      const refreshToken = 'invalid-token'
      const error = new ApiError('Invalid refresh token', 401, 'Unauthorized')
      vi.mocked(apiClient.post).mockRejectedValue(error)

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(ApiError)
    })
  })

  describe('verifyEmail', () => {
    it('should verify email with token', async () => {
      const token = 'verification-token-123'
      const mockResponse = { message: 'Email verified successfully' }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await authService.verifyEmail(token)

      expect(apiClient.post).toHaveBeenCalledWith('/auth/verify-email', { token })
      expect(result).toEqual(mockResponse)
    })

    it('should handle verification errors', async () => {
      const token = 'invalid-token'
      const error = new ApiError('Invalid token', 400, 'Bad Request')
      vi.mocked(apiClient.post).mockRejectedValue(error)

      await expect(authService.verifyEmail(token)).rejects.toThrow(ApiError)
    })
  })

  describe('resendVerification', () => {
    it('should resend verification email', async () => {
      const email = 'test@example.com'
      const mockResponse = { message: 'Verification email sent' }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await authService.resendVerification(email)

      expect(apiClient.post).toHaveBeenCalledWith('/auth/resend-verification', { email })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('forgotPassword', () => {
    it('should request password reset email', async () => {
      const email = 'test@example.com'
      const mockResponse = { message: 'Password reset email sent' }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await authService.forgotPassword(email)

      expect(apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', { email })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('resetPassword', () => {
    it('should reset password with token', async () => {
      const token = 'reset-token-123'
      const newPassword = 'new-password-123'
      const mockResponse = { message: 'Password reset successfully' }

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await authService.resetPassword(token, newPassword)

      expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-password', {
        token,
        new_password: newPassword,
      })
      expect(result).toEqual(mockResponse)
    })

    it('should handle reset password errors', async () => {
      const token = 'invalid-token'
      const newPassword = 'new-password'
      const error = new ApiError('Invalid token', 400, 'Bad Request')
      vi.mocked(apiClient.post).mockRejectedValue(error)

      await expect(authService.resetPassword(token, newPassword)).rejects.toThrow(ApiError)
    })
  })

  describe('getCurrentUser', () => {
    it('should get current authenticated user', async () => {
      const mockUser = createMockUser()
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockUser })

      const result = await authService.getCurrentUser()

      expect(apiClient.get).toHaveBeenCalledWith('/auth/me')
      expect(result).toEqual(mockUser)
    })

    it('should handle authentication errors', async () => {
      const error = new ApiError('Not authenticated', 401, 'Unauthorized')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(authService.getCurrentUser()).rejects.toThrow(ApiError)
    })
  })

  describe('deleteAccount', () => {
    it('should delete user account', async () => {
      const mockResponse = { message: 'Account deleted successfully' }
      vi.mocked(apiClient.delete).mockResolvedValue({ data: mockResponse })

      const result = await authService.deleteAccount()

      expect(apiClient.delete).toHaveBeenCalledWith('/auth/delete-account')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('logout', () => {
    it('should logout user', async () => {
      const mockResponse = { message: 'Logged out successfully' }
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await authService.logout()

      expect(apiClient.post).toHaveBeenCalledWith('/auth/logout')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('testAuth', () => {
    it('should test authentication endpoint', async () => {
      const mockResponse = { message: 'Auth test successful' }
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse })

      const result = await authService.testAuth()

      expect(apiClient.get).toHaveBeenCalledWith('/auth/test')
      expect(result).toEqual(mockResponse)
    })
  })
})
