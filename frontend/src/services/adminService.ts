/**
 * Admin Service
 *
 * Handles all admin-related API endpoints including:
 * - User management (CRUD operations)
 * - Admin statistics
 * - Action logs
 * - App settings
 */

import type { User, UserId } from '../types'

import { apiClient } from './api/client'

/**
 * Admin statistics response
 */
export interface AdminStats {
  total_users: number
  active_users: number
  verified_users: number
  users_by_tier: Record<string, number>
  users_by_role: Record<string, number>
  recent_registrations: number
  total_usage_today: number
  admin_actions_today: number
}

/**
 * Visitor analytics response
 */
export interface VisitorAnalytics {
  total_unique_visitors: number
  total_unique_devices: number
  total_comparisons: number
  unique_visitors_today: number
  unique_visitors_this_week: number
  unique_visitors_this_month: number
  authenticated_visitors: number
  anonymous_visitors: number
  daily_breakdown: Array<{
    date: string
    unique_visitors: number
    total_comparisons: number
  }>
  comparisons_today: number
  comparisons_this_week: number
  comparisons_this_month: number
}

/**
 * Admin user list response
 */
export interface AdminUserList {
  users: User[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

/**
 * Admin action log entry
 */
export interface AdminActionLog {
  id: number
  admin_user_id: number
  target_user_id: number | null
  action_type: string
  action_description: string
  details: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/**
 * App settings response
 */
export interface AppSettings {
  anonymous_mock_mode_enabled: boolean
  is_development: boolean
  created_at: string | null
  updated_at: string | null
  /** Number of unregistered users with credits used (memory storage) */
  anonymous_users_with_usage: number
  /** Number of unregistered usage log entries in database */
  anonymous_db_usage_count: number
}

/**
 * User creation request
 */
export interface CreateUserRequest {
  email: string
  password: string
  subscription_tier?: string
  role?: string
  is_active?: boolean
}

/**
 * User update request
 */
export interface UpdateUserRequest {
  email?: string
  subscription_tier?: string
  role?: string
  is_active?: boolean
  mock_mode_enabled?: boolean
}

/**
 * Change tier request
 */
export interface ChangeTierRequest {
  subscription_tier: string
}

/**
 * List users with filtering and pagination
 *
 * @param params - Query parameters
 * @returns Promise resolving to user list
 * @throws {ApiError} If the request fails
 */
export async function listUsers(params?: {
  page?: number
  per_page?: number
  search?: string
  role?: string
  tier?: string
  is_active?: boolean
}): Promise<AdminUserList> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.per_page) queryParams.append('per_page', params.per_page.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.role) queryParams.append('role', params.role)
  if (params?.tier) queryParams.append('tier', params.tier)
  if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString())

  const queryString = queryParams.toString()
  const url = `/admin/users${queryString ? `?${queryString}` : ''}`

  const response = await apiClient.get<AdminUserList>(url)
  return response.data
}

/**
 * Get admin dashboard statistics
 *
 * @returns Promise resolving to admin statistics
 * @throws {ApiError} If the request fails
 */
export async function getAdminStats(): Promise<AdminStats> {
  const response = await apiClient.get<AdminStats>('/admin/stats')
  return response.data
}

/**
 * Get visitor analytics statistics
 *
 * @returns Promise resolving to visitor analytics
 * @throws {ApiError} If the request fails
 */
export async function getVisitorAnalytics(): Promise<VisitorAnalytics> {
  const response = await apiClient.get<VisitorAnalytics>('/admin/analytics/visitors')
  return response.data
}

/**
 * Get specific user details
 *
 * @param userId - User ID
 * @returns Promise resolving to user data
 * @throws {ApiError} If the request fails
 */
export async function getUser(userId: UserId): Promise<User> {
  const response = await apiClient.get<User>(`/admin/users/${userId}`)
  return response.data
}

/**
 * Create a new user
 *
 * @param userData - User creation data
 * @returns Promise resolving to created user
 * @throws {ApiError} If creation fails
 */
export async function createUser(userData: CreateUserRequest): Promise<User> {
  const response = await apiClient.post<User>('/admin/users', userData)
  return response.data
}

/**
 * Update a user
 *
 * @param userId - User ID
 * @param userData - User update data
 * @returns Promise resolving to updated user
 * @throws {ApiError} If update fails
 */
export async function updateUser(userId: UserId, userData: UpdateUserRequest): Promise<User> {
  const response = await apiClient.put<User>(`/admin/users/${userId}`, userData)
  return response.data
}

/**
 * Delete a user (super admin only)
 *
 * @param userId - User ID
 * @returns Promise resolving when deletion completes
 * @throws {ApiError} If deletion fails
 */
export async function deleteUser(userId: UserId): Promise<void> {
  await apiClient.delete(`/admin/users/${userId}`)
}

/**
 * Reset a user's password
 *
 * @param userId - User ID
 * @param newPassword - New password
 * @returns Promise resolving to success message
 * @throws {ApiError} If reset fails
 */
export async function resetUserPassword(
  userId: UserId,
  newPassword: string
): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>(
    `/admin/users/${userId}/reset-password`,
    { new_password: newPassword }
  )
  return response.data
}

/**
 * Send verification email to a user
 *
 * @param userId - User ID
 * @returns Promise resolving to success message
 * @throws {ApiError} If request fails
 */
export async function sendUserVerification(userId: UserId): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>(
    `/admin/users/${userId}/send-verification`
  )
  return response.data
}

/**
 * Toggle user active status
 *
 * @param userId - User ID
 * @returns Promise resolving to updated user
 * @throws {ApiError} If update fails
 */
export async function toggleUserActive(userId: UserId): Promise<User> {
  const response = await apiClient.post<User>(`/admin/users/${userId}/toggle-active`)
  return response.data
}

/**
 * Reset user usage statistics
 *
 * @param userId - User ID
 * @returns Promise resolving to updated user
 * @throws {ApiError} If reset fails
 */
export async function resetUserUsage(userId: UserId): Promise<User> {
  const response = await apiClient.post<User>(`/admin/users/${userId}/reset-usage`)
  return response.data
}

/**
 * Toggle user mock mode
 *
 * @param userId - User ID
 * @returns Promise resolving to updated user
 * @throws {ApiError} If update fails
 */
export async function toggleUserMockMode(userId: UserId): Promise<User> {
  const response = await apiClient.post<User>(`/admin/users/${userId}/toggle-mock-mode`)
  return response.data
}

/**
 * Change user subscription tier
 *
 * @param userId - User ID
 * @param tier - New subscription tier
 * @returns Promise resolving to updated user
 * @throws {ApiError} If update fails
 */
export async function changeUserTier(userId: UserId, tier: string): Promise<User> {
  const response = await apiClient.post<User>(`/admin/users/${userId}/change-tier`, {
    subscription_tier: tier,
  })
  return response.data
}

/**
 * Get admin action logs
 *
 * @param params - Query parameters
 * @returns Promise resolving to action logs
 * @throws {ApiError} If the request fails
 */
export async function getActionLogs(params?: {
  page?: number
  per_page?: number
  action_type?: string
}): Promise<AdminActionLog[]> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.per_page) queryParams.append('per_page', params.per_page.toString())
  if (params?.action_type) queryParams.append('action_type', params.action_type)

  const queryString = queryParams.toString()
  const url = `/admin/action-logs${queryString ? `?${queryString}` : ''}`

  const response = await apiClient.get<AdminActionLog[]>(url)
  return response.data
}

/**
 * Get app settings
 *
 * @returns Promise resolving to app settings
 * @throws {ApiError} If the request fails
 */
export async function getAppSettings(): Promise<AppSettings> {
  const response = await apiClient.get<AppSettings>('/admin/settings')
  return response.data
}

/**
 * Toggle anonymous mock mode
 *
 * @returns Promise resolving to updated settings
 * @throws {ApiError} If update fails
 */
export async function toggleAnonymousMockMode(): Promise<AppSettings> {
  const response = await apiClient.post<AppSettings>('/admin/settings/toggle-anonymous-mock-mode')
  return response.data
}

/**
 * Reset unregistered user credits to maximum allocation
 *
 * Resets all unregistered user credit usage to 0, restoring full credits (50/day).
 * Does NOT affect comparison history.
 *
 * @returns Promise resolving to success message
 * @throws {ApiError} If reset fails
 */
export async function zeroAnonymousUsage(): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>('/admin/settings/zero-anonymous-usage')
  return response.data
}

/**
 * Search provider information
 */
export interface SearchProvider {
  name: string
  display_name: string
  is_configured: boolean
  is_active: boolean
}

/**
 * Search provider test result
 */
export interface SearchProviderTestResult {
  success: boolean
  provider: string
  query?: string
  results_count?: number
  results?: Array<{
    title: string
    url: string
    snippet: string
    source: string
  }>
  error?: string
}

/**
 * Search providers response
 */
export interface SearchProvidersResponse {
  providers: SearchProvider[]
  active_provider: string | null
  is_development: boolean
}

/**
 * Get list of search providers and current active one
 *
 * @returns Promise resolving to search providers information
 * @throws {ApiError} If the request fails
 */
export async function getSearchProviders(): Promise<SearchProvidersResponse> {
  const response = await apiClient.get<SearchProvidersResponse>('/admin/search-providers')
  return response.data
}

/**
 * Set the active search provider
 *
 * @param provider - Provider name ("brave" or "tavily")
 * @returns Promise resolving to success message
 * @throws {ApiError} If setting fails (may throw 403 in production)
 */
export async function setActiveSearchProvider(
  provider: string
): Promise<{ success: boolean; active_provider: string; message: string }> {
  const response = await apiClient.post<{
    success: boolean
    active_provider: string
    message: string
  }>('/admin/search-providers/set-active', { provider })
  return response.data
}

/**
 * Test the currently active search provider
 *
 * @returns Promise resolving to test results
 * @throws {ApiError} If the request fails
 */
export async function testSearchProvider(): Promise<SearchProviderTestResult> {
  const response = await apiClient.get<SearchProviderTestResult>('/admin/search-providers/test')
  return response.data
}

/**
 * Test a specific search provider with a custom query
 *
 * @param provider - Provider name ("brave" or "tavily")
 * @param query - Search query to test
 * @returns Promise resolving to test results
 * @throws {ApiError} If the request fails
 */
export async function testSearchProviderWithQuery(
  provider: string,
  query: string
): Promise<SearchProviderTestResult> {
  const response = await apiClient.post<SearchProviderTestResult>(
    '/admin/search-providers/test-provider',
    { provider, query }
  )
  return response.data
}
