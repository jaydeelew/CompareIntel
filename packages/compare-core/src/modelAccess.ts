import type { ModelInfo, User } from './api/services'

export type ModelsByProvider = Record<string, ModelInfo[]>

export const MODEL_LIMITS = {
  unregistered: 3,
  free: 3,
  starter: 6,
  starter_plus: 6,
  pro: 9,
  pro_plus: 12,
} as const

const PAID_SUBSCRIPTION_TIERS = ['starter', 'starter_plus', 'pro', 'pro_plus'] as const

export type SubscriptionTier = keyof typeof MODEL_LIMITS

export function getModelLimit(tier: SubscriptionTier | string): number {
  return MODEL_LIMITS[tier as SubscriptionTier] ?? MODEL_LIMITS.unregistered
}

export function hasStaffFullModelAccess(user: User | null): boolean {
  if (!user) return false
  return Boolean(user.is_admin || user.role === 'admin' || user.role === 'super_admin')
}

export function getUserTierInfo(isAuthenticated: boolean, user: User | null) {
  const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
  const isPaidTier =
    PAID_SUBSCRIPTION_TIERS.includes(userTier as (typeof PAID_SUBSCRIPTION_TIERS)[number]) ||
    hasStaffFullModelAccess(user)
  return { userTier, isPaidTier }
}

export function isModelRestrictedForUser(
  model: Pick<ModelInfo, 'tier_access' | 'trial_unlocked'>,
  userTier: string,
  isPaidTier: boolean,
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
  user: User | null,
): boolean {
  const { userTier, isPaidTier } = getUserTierInfo(isAuthenticated, user)
  for (const providerModels of Object.values(modelsByProvider)) {
    const model = providerModels.find((item) => String(item.id) === String(modelId))
    if (model) {
      if (model.available === false) return false
      return !isModelRestrictedForUser(model, userTier, isPaidTier)
    }
  }
  return false
}

export function filterModelsByProviderToText(
  modelsByProvider: ModelsByProvider,
): ModelsByProvider {
  const result: ModelsByProvider = {}
  for (const [provider, models] of Object.entries(modelsByProvider)) {
    const textModels = models.filter((model) => !model.supports_image_generation)
    if (textModels.length > 0) result[provider] = textModels
  }
  return result
}
