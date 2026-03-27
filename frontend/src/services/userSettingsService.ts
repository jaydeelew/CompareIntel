/**
 * User Settings Service
 *
 * Handles user preferences and settings API endpoints including:
 * - Getting user preferences
 * - Updating user preferences (zipcode, remember state on logout, etc.)
 */

import { apiClient } from './api/client'

/** Dispatched on document when preferences are saved so the UI can update without a full reload */
export const USER_PREFERENCES_UPDATED_EVENT = 'compareintel:user-preferences-updated'

/** Main page listens and saves current text composer advanced values (after enabling “remember”) */
export const REQUEST_PERSIST_TEXT_COMPOSER_ADVANCED_EVENT =
  'compareintel:request-persist-text-composer-advanced'

/** Main page listens and saves current image composer advanced values (after enabling “remember”) */
export const REQUEST_PERSIST_IMAGE_COMPOSER_ADVANCED_EVENT =
  'compareintel:request-persist-image-composer-advanced'

/** Stored text-mode advanced settings (API snake_case) */
export interface TextComposerAdvancedStored {
  temperature: number
  top_p: number
  max_tokens: number | null
}

/** Stored image-mode advanced settings (API snake_case) */
export interface ImageComposerAdvancedStored {
  aspect_ratio: string
  image_size: string
}

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
  hide_hero_utility_tiles: boolean
  remember_text_advanced_settings: boolean
  remember_image_advanced_settings: boolean
  text_composer_advanced: TextComposerAdvancedStored | null
  image_composer_advanced: ImageComposerAdvancedStored | null
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
  hide_hero_utility_tiles?: boolean
  remember_text_advanced_settings?: boolean
  remember_image_advanced_settings?: boolean
  text_composer_advanced?: TextComposerAdvancedStored | null
  image_composer_advanced?: ImageComposerAdvancedStored | null
}

/**
 * Get user preferences/settings
 *
 * @returns Promise resolving to user preferences
 * @throws {ApiError} If the request fails or user is not authenticated
 */
export async function getUserPreferences(): Promise<UserPreferences> {
  // Preferences must not use the API client GET cache — stale hide_hero_utility_tiles (etc.)
  // breaks layout until cache TTL expires after toggles or auth/user ref updates.
  const response = await apiClient.get<UserPreferences>('/user/preferences', {
    enableCache: false,
  })
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
