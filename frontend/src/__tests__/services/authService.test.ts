/**
 * Tests for authService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { ApiError } from '../../services/api/errors'
import * as authService from '../../services/authService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'
import {
  createMockUser,
  createMockAuthResponse,
  createMockLoginCredentials,
  createMockRegisterData,
} from '../utils'

describe('authService', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('register', () => {
    it('should register a new user', async () => {
      const registerData = createMockRegisterData()
      const mockResponse = createMockAuthResponse()
      server.use(
        http.post(apiPathGlob('/api/auth/register'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.email).toBe(registerData.email)
          expect(body.password).toBe(registerData.password)
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await authService.register(registerData)
      expect(result).toEqual(mockResponse)
    })

    it('should handle registration errors', () => {
      const registerData = createMockRegisterData()
      server.use(
        http.post(apiPathGlob('/api/auth/register'), () =>
          HttpResponse.json({ detail: 'Email already exists' }, { status: 400 })
        )
      )

      return expect(authService.register(registerData)).rejects.toThrow(ApiError)
    })
  })

  describe('login', () => {
    it('should login a user', async () => {
      const credentials = createMockLoginCredentials()
      const mockResponse = createMockAuthResponse()
      server.use(
        http.post(apiPathGlob('/api/auth/login'), async ({ request }) => {
          expect(await request.json()).toEqual(credentials)
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await authService.login(credentials)
      expect(result).toEqual(mockResponse)
    })

    it('should handle login errors', () => {
      const credentials = createMockLoginCredentials()
      server.use(
        http.post(apiPathGlob('/api/auth/login'), () =>
          HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 })
        )
      )

      return expect(authService.login(credentials)).rejects.toThrow(ApiError)
    })
  })

  describe('refreshToken', () => {
    it('should refresh access token', async () => {
      const refreshTokenVal = 'refresh-token-123'
      const mockResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'bearer',
      }

      server.use(
        http.post(apiPathGlob('/api/auth/refresh'), async ({ request }) => {
          expect(await request.json()).toEqual({ refresh_token: refreshTokenVal })
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await authService.refreshToken(refreshTokenVal)
      expect(result).toEqual(mockResponse)
    })

    it('should handle refresh token errors', () => {
      const refreshTokenVal = 'invalid-token'
      server.use(
        http.post(apiPathGlob('/api/auth/refresh'), () =>
          HttpResponse.json({ detail: 'Invalid refresh token' }, { status: 401 })
        )
      )

      return expect(authService.refreshToken(refreshTokenVal)).rejects.toThrow(ApiError)
    })
  })

  describe('verifyEmail', () => {
    it('should verify email with token', async () => {
      const token = 'verification-token-123'
      const mockResponse = { message: 'Email verified successfully' }

      server.use(
        http.post(apiPathGlob('/api/auth/verify-email'), async ({ request }) => {
          expect(await request.json()).toEqual({ token })
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await authService.verifyEmail(token)
      expect(result).toEqual(mockResponse)
    })

    it('should handle verification errors', () => {
      const token = 'invalid-token'
      server.use(
        http.post(apiPathGlob('/api/auth/verify-email'), () =>
          HttpResponse.json({ detail: 'Invalid token' }, { status: 400 })
        )
      )

      return expect(authService.verifyEmail(token)).rejects.toThrow(ApiError)
    })
  })

  describe('resendVerification', () => {
    it('should resend verification email', async () => {
      const email = 'test@example.com'
      const mockResponse = { message: 'Verification email sent' }

      server.use(
        http.post(apiPathGlob('/api/auth/resend-verification'), async ({ request }) => {
          expect(await request.json()).toEqual({ email })
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await authService.resendVerification(email)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('forgotPassword', () => {
    it('should request password reset email', async () => {
      const email = 'test@example.com'
      const mockResponse = { message: 'Password reset email sent' }

      server.use(
        http.post(apiPathGlob('/api/auth/forgot-password'), async ({ request }) => {
          expect(await request.json()).toEqual({ email })
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await authService.forgotPassword(email)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('resetPassword', () => {
    it('should reset password with token', async () => {
      const token = 'reset-token-123'
      const newPassword = 'new-password-123'
      const mockResponse = { message: 'Password reset successfully' }

      server.use(
        http.post(apiPathGlob('/api/auth/reset-password'), async ({ request }) => {
          expect(await request.json()).toEqual({ token, new_password: newPassword })
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await authService.resetPassword(token, newPassword)
      expect(result).toEqual(mockResponse)
    })

    it('should handle reset password errors', () => {
      const token = 'invalid-token'
      const newPassword = 'new-password'
      server.use(
        http.post(apiPathGlob('/api/auth/reset-password'), () =>
          HttpResponse.json({ detail: 'Invalid token' }, { status: 400 })
        )
      )

      return expect(authService.resetPassword(token, newPassword)).rejects.toThrow(ApiError)
    })
  })

  describe('getCurrentUser', () => {
    it('should get current authenticated user', async () => {
      const mockUser = createMockUser()
      server.use(http.get(apiPathGlob('/api/auth/me'), () => HttpResponse.json(mockUser)))

      const result = await authService.getCurrentUser()
      expect(result).toEqual(mockUser)
    })

    it('should handle authentication errors', () => {
      server.use(
        http.get(apiPathGlob('/api/auth/me'), () =>
          HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
        )
      )

      return expect(authService.getCurrentUser()).rejects.toThrow(ApiError)
    })
  })

  describe('deleteAccount', () => {
    it('should delete user account', async () => {
      const mockResponse = { message: 'Account deleted successfully' }
      server.use(
        http.delete(apiPathGlob('/api/auth/delete-account'), () => HttpResponse.json(mockResponse))
      )

      const result = await authService.deleteAccount()
      expect(result).toEqual(mockResponse)
    })
  })

  describe('logout', () => {
    it('should logout user', async () => {
      const mockResponse = { message: 'Logged out successfully' }
      server.use(http.post(apiPathGlob('/api/auth/logout'), () => HttpResponse.json(mockResponse)))

      const result = await authService.logout()
      expect(result).toEqual(mockResponse)
    })
  })

  describe('testAuth', () => {
    it('should test authentication endpoint', async () => {
      const mockResponse = { message: 'Auth test successful' }
      server.use(http.get(apiPathGlob('/api/auth/test'), () => HttpResponse.json(mockResponse)))

      const result = await authService.testAuth()
      expect(result).toEqual(mockResponse)
    })
  })
})
