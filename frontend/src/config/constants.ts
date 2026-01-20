/**
 * Centralized configuration constants for CompareIntel frontend.
 *
 * This module consolidates all configuration constants to avoid duplication
 * and provides a single source of truth for frontend settings.
 *
 * Should match backend configuration for consistency.
 * See: backend/app/config.py
 */

// ============================================================================
// Unregistered User Limits
// ============================================================================
// Limits for unregistered users

/** Maximum models per comparison for unregistered users */
export const ANONYMOUS_MODEL_LIMIT = 3

// Extended tier usage tracking removed - extended mode is now unlimited (only limited by credits)

// ============================================================================
// Model Limits per Subscription Tier
// ============================================================================
// Maximum number of models that can be selected per comparison

export const MODEL_LIMITS = {
  unregistered: 3,
  free: 3,
  starter: 6,
  starter_plus: 6,
  pro: 9,
  pro_plus: 12,
} as const

// ============================================================================
// Daily Limits per Subscription Tier
// ============================================================================
// Daily model response limits (model responses per day, not comparisons)

export const DAILY_LIMITS = {
  unregistered: 10,
  free: 20,
  starter: 50,
  starter_plus: 100,
  pro: 200,
  pro_plus: 400,
} as const

// ============================================================================
// Conversation History Limits
// ============================================================================
// Maximum number of conversations stored per subscription tier
// Each conversation (with or without follow-ups) counts as 1 conversation

export const CONVERSATION_LIMITS = {
  unregistered: 2,
  free: 3,
  starter: 10,
  starter_plus: 20,
  pro: 40,
  pro_plus: 80,
} as const

// ============================================================================
// Saved Model Selection Limits
// ============================================================================
// Maximum number of saved model selections per subscription tier

export const SAVED_MODEL_SELECTION_LIMITS = {
  unregistered: 2,
  free: 3,
  starter: 5,
  starter_plus: 10,
  pro: 15,
  pro_plus: 20,
} as const

// ============================================================================
// Credit-Based System Configuration
// ============================================================================
// Credit allocations for each tier
// 1 credit = 1,000 effective tokens
// Effective tokens = input_tokens + (output_tokens × 2.5)

// Daily credit limits for free tiers (resets daily)
export const DAILY_CREDIT_LIMITS = {
  unregistered: 50, // 50 credits/day (~10 exchanges/day)
  free: 100, // 100 credits/day (~20 exchanges/day)
} as const

// Monthly credit allocations for paid tiers
export const MONTHLY_CREDIT_ALLOCATIONS = {
  starter: 1_200, // $9.95/month - ~240 exchanges/month (~8/day)
  starter_plus: 2_500, // $19.95/month - ~500 exchanges/month (~17/day)
  pro: 5_000, // $39.95/month - ~1,000 exchanges/month (~33/day)
  pro_plus: 10_000, // $79.95/month - ~2,000 exchanges/month (~67/day)
} as const

// Subscription pricing (monthly)
export const TIER_PRICING = {
  unregistered: 0.0,
  free: 0.0,
  starter: 9.95,
  starter_plus: 19.95,
  pro: 39.95,
  pro_plus: 79.95,
} as const

// Overage pricing (per 1,000 credits)
export const OVERAGE_PRICE_PER_1000_CREDITS = 12.0 // $12 per 1,000 credits ($0.012 per credit)

// ============================================================================
// Type Exports
// ============================================================================
// TypeScript types derived from constants for type safety

export type SubscriptionTier = keyof typeof MODEL_LIMITS

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Get daily model response limit for a given subscription tier.
 *
 * @param tier - Subscription tier name
 * @returns Daily limit for model responses
 */
export function getDailyLimit(tier: SubscriptionTier | string): number {
  return DAILY_LIMITS[tier as SubscriptionTier] ?? DAILY_LIMITS.unregistered
}

/**
 * Get conversation history limit for a given subscription tier.
 *
 * @param tier - Subscription tier name
 * @returns Maximum number of conversations stored (each conversation counts as 1)
 */
export function getConversationLimit(tier: SubscriptionTier | string): number {
  return CONVERSATION_LIMITS[tier as SubscriptionTier] ?? CONVERSATION_LIMITS.unregistered
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

// ============================================================================
// Responsive Breakpoints
// ============================================================================
// Standard breakpoints for responsive design (matches CSS media queries)
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
