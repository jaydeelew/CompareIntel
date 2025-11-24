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
// Anonymous User Limits
// ============================================================================
// Limits for unregistered (anonymous) users

/** Maximum models per comparison for anonymous users */
export const ANONYMOUS_MODEL_LIMIT = 3

// Extended tier usage tracking removed - extended mode is now unlimited (only limited by credits)

// ============================================================================
// Model Limits per Subscription Tier
// ============================================================================
// Maximum number of models that can be selected per comparison

export const MODEL_LIMITS = {
  anonymous: 3,
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
  anonymous: 10,
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
  anonymous: 2,
  free: 3,
  starter: 10,
  starter_plus: 20,
  pro: 40,
  pro_plus: 80,
} as const

// ============================================================================
// Credit-Based System Configuration
// ============================================================================
// Credit allocations for each tier
// 1 credit = 1,000 effective tokens
// Effective tokens = input_tokens + (output_tokens × 2.5)

// Daily credit limits for free tiers (resets daily)
export const DAILY_CREDIT_LIMITS = {
  anonymous: 50, // 50 credits/day (~10 exchanges/day)
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
  anonymous: 0.0,
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
  return MODEL_LIMITS[tier as SubscriptionTier] ?? MODEL_LIMITS.anonymous
}

/**
 * Get daily model response limit for a given subscription tier.
 *
 * @param tier - Subscription tier name
 * @returns Daily limit for model responses
 */
export function getDailyLimit(tier: SubscriptionTier | string): number {
  return DAILY_LIMITS[tier as SubscriptionTier] ?? DAILY_LIMITS.anonymous
}

/**
 * Get conversation history limit for a given subscription tier.
 *
 * @param tier - Subscription tier name
 * @returns Maximum number of conversations stored (each conversation counts as 1)
 */
export function getConversationLimit(tier: SubscriptionTier | string): number {
  return CONVERSATION_LIMITS[tier as SubscriptionTier] ?? CONVERSATION_LIMITS.anonymous
}

/**
 * Get daily credit limit for a given subscription tier (for free/anonymous tiers).
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
 * Returns daily limit for free/anonymous, monthly allocation for paid tiers.
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
