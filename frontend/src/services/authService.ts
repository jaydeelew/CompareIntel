/**
 * Authentication Service
 *
 * Handles all authentication-related API endpoints including:
 * - User registration
 * - User login
 * - Token refresh
 * - Email verification
 * - Password reset
 * - Account management
 */

import type { User, LoginCredentials, RegisterData, AuthResponse } from '../types'

import { apiClient } from './api/client'

/**
 * Email verification request
 */
export interface EmailVerificationRequest {
  token: string
}

/**
 * Resend verification request
 */
export interface ResendVerificationRequest {
  email: string
}

/**
 * Forgot password request
 */
export interface ForgotPasswordRequest {
  email: string
}

/**
 * Reset password request
 */
export interface ResetPasswordRequest {
  token: string
  new_password: string
}

/**
 * Refresh token request
 */
export interface RefreshTokenRequest {
  refresh_token: string
}

/**
 * Register a new user account
 *
 * @param data - Registration data
 * @returns Promise resolving to authentication response
 * @throws {ApiError} If registration fails
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/register', {
    email: data.email,
    password: data.password,
    recaptcha_token: data.recaptcha_token,
  })
  return response.data
}

/**
 * Log in a user
 *
 * @param credentials - Login credentials
 * @returns Promise resolving to authentication response
 * @throws {ApiError} If login fails
 */
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', credentials)
  return response.data
}

/**
 * Refresh an access token using a refresh token
 *
 * @param refreshToken - Refresh token
 * @returns Promise resolving to new tokens
 * @throws {ApiError} If token refresh fails
 */
export async function refreshToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  token_type: string
}> {
  const response = await apiClient.post<{
    access_token: string
    refresh_token: string
    token_type: string
  }>('/auth/refresh', { refresh_token: refreshToken })
  return response.data
}

/**
 * Verify user email address
 *
 * @param token - Verification token
 * @returns Promise resolving to success message
 * @throws {ApiError} If verification fails
 */
export async function verifyEmail(token: string): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>('/auth/verify-email', { token })
  return response.data
}

/**
 * Resend verification email
 *
 * @param email - User's email address
 * @returns Promise resolving to success message
 * @throws {ApiError} If request fails
 */
export async function resendVerification(email: string): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>('/auth/resend-verification', { email })
  return response.data
}

/**
 * Request password reset email
 *
 * @param email - User's email address
 * @returns Promise resolving to success message
 * @throws {ApiError} If request fails
 */
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>('/auth/forgot-password', { email })
  return response.data
}

/**
 * Reset password using reset token
 *
 * @param token - Password reset token
 * @param newPassword - New password
 * @returns Promise resolving to success message
 * @throws {ApiError} If reset fails
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>('/auth/reset-password', {
    token,
    new_password: newPassword,
  })
  return response.data
}

/**
 * Get current authenticated user
 *
 * @returns Promise resolving to user data
 * @throws {ApiError} If request fails or user is not authenticated
 */
export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<User>('/auth/me')
  return response.data
}

/**
 * Delete user account
 *
 * @returns Promise resolving to success message
 * @throws {ApiError} If deletion fails
 */
export async function deleteAccount(): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>('/auth/delete-account')
  return response.data
}

/**
 * Log out the current user
 *
 * @returns Promise resolving to success message
 * @throws {ApiError} If logout fails
 */
export async function logout(): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>('/auth/logout')
  return response.data
}

/**
 * Test authentication endpoint (for development)
 *
 * @returns Promise resolving to test response
 * @throws {ApiError} If request fails
 */
export async function testAuth(): Promise<{ message: string }> {
  const response = await apiClient.get<{ message: string }>('/auth/test')
  return response.data
}
