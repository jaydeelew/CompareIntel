/**
 * Configuration types for CompareIntel
 *
 * These types define the structure of configuration constants and settings
 * used throughout the application.
 */

import type { SubscriptionTier } from '../config/constants'

/**
 * Subscription tier types - derived from constants
 */
export type { SubscriptionTier }

/**
 * Subscription status values
 */
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS]

/**
 * Subscription period values
 */
export const SUBSCRIPTION_PERIOD = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const

export type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIOD)[keyof typeof SUBSCRIPTION_PERIOD]

/**
 * User role values
 */
export const USER_ROLE = {
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE]

/**
 * Tier limits configuration
 */
export interface TierLimits {
  readonly input_chars: number
  readonly output_tokens: number
}

/**
 * Notification type for UI notifications
 */
export const NOTIFICATION_TYPE = {
  SUCCESS: 'success',
  ERROR: 'error',
} as const

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE]
