/**
 * Centralized configuration constants for CompareIntel frontend.
 *
 * This module consolidates all configuration constants to avoid duplication
 * and provides a single source of truth for frontend settings.
 *
 * Should match backend configuration for consistency.
 * See: backend/app/config.py
 */

// Unregistered User Limits

/** Maximum models per comparison for unregistered users */
export const ANONYMOUS_MODEL_LIMIT = 3

// Extended tier usage tracking removed - extended mode is now unlimited (only limited by credits)

// Model Limits per Subscription Tier

export const MODEL_LIMITS = {
  unregistered: 3,
  free: 3,
  starter: 6,
  starter_plus: 6,
  pro: 9,
  pro_plus: 12,
} as const

// Comparison history entries (stored conversations) per tier; must match backend HISTORY_ENTRY_LIMITS.

export const HISTORY_ENTRY_LIMITS = {
  unregistered: 2,
  free: 3,
  starter: 10,
  starter_plus: 20,
  pro: 40,
  pro_plus: 80,
} as const

// Saved Model Selection Limits

export const SAVED_MODEL_SELECTION_LIMITS = {
  unregistered: 2,
  free: 3,
  starter: 5,
  starter_plus: 10,
  pro: 15,
  pro_plus: 20,
} as const

// Credit-Based System Configuration
// Text credits follow provider cost (see docs/features/CREDIT_SYSTEM.md); token weighting is legacy fallback.

// Daily credit limits for free tiers (resets daily)
export const DAILY_CREDIT_LIMITS = {
  unregistered: 50, // 50 credits/day (~10 exchanges/day)
  free: 100, // 100 credits/day (~20 exchanges/day)
} as const

// Monthly credit allocations for paid tiers
export const MONTHLY_CREDIT_ALLOCATIONS = {
  starter: 720,
  starter_plus: 1_600,
  pro: 3_300,
  pro_plus: 6_700,
} as const

// Subscription pricing (monthly USD) — must match Stripe products and backend TIER_PRICING
export const TIER_PRICING = {
  unregistered: 0.0,
  free: 0.0,
  starter: 9,
  starter_plus: 19,
  pro: 39,
  pro_plus: 79,
} as const

/** Flat USD charged per credit beyond the monthly pool (list rate; same for all paid tiers). */
export const OVERAGE_USD_PER_CREDIT = 0.013

// Type Exports

export type SubscriptionTier = keyof typeof MODEL_LIMITS

// Helper Functions

/**
 * Get maximum models per comparison for a given subscription tier.
 *
 * @param tier - Subscription tier name
 * @returns Maximum number of models allowed per comparison
 */
export function getModelLimit(tier: SubscriptionTier | string): number {
  return MODEL_LIMITS[tier as SubscriptionTier] ?? MODEL_LIMITS.unregistered
}

/**
 * Maximum comparison history entries for a tier (matches backend get_history_entry_limit).
 */
export function getHistoryEntryLimit(tier: SubscriptionTier | string): number {
  return (
    HISTORY_ENTRY_LIMITS[tier as keyof typeof HISTORY_ENTRY_LIMITS] ??
    HISTORY_ENTRY_LIMITS.unregistered
  )
}

/**
 * Get saved model selection limit for a given subscription tier.
 *
 * @param tier - Subscription tier name
 * @returns Maximum number of saved model selections allowed
 */
export function getSavedModelSelectionLimit(tier: SubscriptionTier | string): number {
  return (
    SAVED_MODEL_SELECTION_LIMITS[tier as SubscriptionTier] ??
    SAVED_MODEL_SELECTION_LIMITS.unregistered
  )
}

/**
 * Get daily credit limit for a given subscription tier (for free/unregistered tiers).
 *
 * @param tier - Subscription tier name
 * @returns Daily credit limit (0 if not a daily-reset tier)
 */
export function getDailyCreditLimit(tier: SubscriptionTier | string): number {
  return DAILY_CREDIT_LIMITS[tier as keyof typeof DAILY_CREDIT_LIMITS] ?? 0
}

/**
 * Get monthly credit allocation for a given subscription tier (for paid tiers).
 *
 * @param tier - Subscription tier name
 * @returns Monthly credit allocation (0 if not a paid tier)
 */
export function getMonthlyCreditAllocation(tier: SubscriptionTier | string): number {
  return MONTHLY_CREDIT_ALLOCATIONS[tier as keyof typeof MONTHLY_CREDIT_ALLOCATIONS] ?? 0
}

/**
 * Get credit allocation for a given subscription tier.
 * Returns daily limit for free/unregistered, monthly allocation for paid tiers.
 *
 * @param tier - Subscription tier name
 * @returns Credit allocation for the tier
 */
export function getCreditAllocation(tier: SubscriptionTier | string): number {
  const dailyLimit = getDailyCreditLimit(tier)
  if (dailyLimit > 0) {
    return dailyLimit
  }
  return getMonthlyCreditAllocation(tier)
}

// Responsive Breakpoints
// These should be kept in sync with frontend/src/styles/responsive.css

/**
 * Breakpoint for small layouts (e.g., character count display wrapping)
 * CSS: @media (max-width: 640px)
 */
export const BREAKPOINT_SMALL = 640

/**
 * Breakpoint for mobile layouts (e.g., tabbed views, compact UI)
 * CSS: @media (max-width: 768px)
 */
export const BREAKPOINT_MOBILE = 768

/**
 * Breakpoint for wide layouts (e.g., header controls alignment)
 * CSS: @media (min-width: 1001px) / @media (max-width: 1000px)
 */
export const BREAKPOINT_WIDE = 1000

/**
 * Breakpoint for tablet layouts
 * CSS: @media (max-width: 1024px)
 */
export const BREAKPOINT_TABLET = 1024

/**
 * All breakpoints as an object for convenient access
 */
export const BREAKPOINTS = {
  small: BREAKPOINT_SMALL,
  mobile: BREAKPOINT_MOBILE,
  wide: BREAKPOINT_WIDE,
  tablet: BREAKPOINT_TABLET,
} as const
