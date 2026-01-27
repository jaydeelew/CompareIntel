/**
 * User Settings Service
 *
 * Handles user preferences and settings API endpoints including:
 * - Getting user preferences
 * - Updating user preferences (zipcode, remember state on logout, etc.)
 */

import { apiClient } from './api/client'

/**
 * User preferences response from the API
 */
export interface UserPreferences {
  preferred_models: string[] | null
  theme: 'light' | 'dark'
  email_notifications: boolean
  usage_alerts: boolean
  zipcode: string | null
  remember_state_on_logout: boolean
}

/**
 * User preferences update request
 */
export interface UserPreferencesUpdate {
  preferred_models?: string[] | null
  theme?: 'light' | 'dark'
  email_notifications?: boolean
  usage_alerts?: boolean
  zipcode?: string | null
  remember_state_on_logout?: boolean
}

/**
 * Get user preferences/settings
 *
 * @returns Promise resolving to user preferences
 * @throws {ApiError} If the request fails or user is not authenticated
 */
export async function getUserPreferences(): Promise<UserPreferences> {
  const response = await apiClient.get<UserPreferences>('/user/preferences')
  return response.data
}

/**
 * Update user preferences/settings
 *
 * @param preferences - Partial preferences to update
 * @returns Promise resolving to updated preferences
 * @throws {ApiError} If the request fails or validation fails
 */
export async function updateUserPreferences(
  preferences: UserPreferencesUpdate
): Promise<UserPreferences> {
  const response = await apiClient.put<UserPreferences>('/user/preferences', preferences)
  return response.data
}
