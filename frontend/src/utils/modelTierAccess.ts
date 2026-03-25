/**
 * Single source of truth for which models a user may select.
 * Must stay aligned with backend is_model_available_for_tier (registry.py).
 */

import type { SubscriptionTier } from '../config/constants'
import type { Model, ModelsByProvider, User } from '../types'

const PAID_SUBSCRIPTION_TIERS = ['starter', 'starter_plus', 'pro', 'pro_plus'] as const

export function hasStaffFullModelAccess(user: User | null): boolean {
  if (!user) return false
  return user.is_admin || user.role === 'admin' || user.role === 'super_admin'
}

/**
 * Tier info for hooks that have a full User (MainPage, useModelManagement).
 */
export function getUserTierInfo(isAuthenticated: boolean, user: User | null) {
  const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
  const isPaidTier =
    PAID_SUBSCRIPTION_TIERS.includes(userTier as (typeof PAID_SUBSCRIPTION_TIERS)[number]) ||
    hasStaffFullModelAccess(user)
  return { userTier, isPaidTier }
}

/**
 * For saved-selection flows that store subscription tier separately from User.
 */
export function getModelAccessContext(
  isAuthenticated: boolean,
  subscriptionTier: SubscriptionTier,
  user: User | null | undefined
): { userTier: string; isPaidTier: boolean } {
  const u = user ?? null
  const userTier = isAuthenticated
    ? subscriptionTier === 'unregistered'
      ? 'free'
      : subscriptionTier
    : 'unregistered'
  const isPaidTier =
    PAID_SUBSCRIPTION_TIERS.includes(userTier as (typeof PAID_SUBSCRIPTION_TIERS)[number]) ||
    hasStaffFullModelAccess(u)
  return { userTier, isPaidTier }
}

export function isModelRestrictedForUser(
  model: Pick<Model, 'tier_access' | 'trial_unlocked'>,
  userTier: string,
  isPaidTier: boolean
): boolean {
  if (isPaidTier) return false
  if (model.trial_unlocked) return false
  const access = model.tier_access ?? 'paid'
  if (userTier === 'unregistered') return access !== 'unregistered'
  if (userTier === 'free') return access === 'paid'
  return false
}

export function isModelIdSelectableForUser(
  modelId: string,
  modelsByProvider: ModelsByProvider,
  isAuthenticated: boolean,
  user: User | null
): boolean {
  const { userTier, isPaidTier } = getUserTierInfo(isAuthenticated, user)
  for (const providerModels of Object.values(modelsByProvider)) {
    const model = providerModels.find(m => String(m.id) === String(modelId))
    if (model) {
      if (model.available === false) return false
      return !isModelRestrictedForUser(model, userTier, isPaidTier)
    }
  }
  return false
}

export function isModelIdSelectableForAccessContext(
  modelId: string,
  modelsByProvider: ModelsByProvider,
  isAuthenticated: boolean,
  subscriptionTier: SubscriptionTier | 'unregistered',
  user: User | null | undefined
): boolean {
  const { userTier, isPaidTier } = getModelAccessContext(isAuthenticated, subscriptionTier, user)
  for (const providerModels of Object.values(modelsByProvider)) {
    const model = providerModels.find(m => String(m.id) === String(modelId))
    if (model) {
      if (model.available === false) return false
      return !isModelRestrictedForUser(model, userTier, isPaidTier)
    }
  }
  return false
}
