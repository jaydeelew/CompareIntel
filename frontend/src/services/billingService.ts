/**
 * Stripe Checkout / Customer Portal / Overage Settings (requires backend STRIPE_* configuration).
 */

import { apiClient } from './api/client'

export type PaidSubscriptionTier = 'starter' | 'starter_plus' | 'pro' | 'pro_plus'

export interface OverageSettings {
  overage_enabled: boolean
  overage_spend_limit_cents: number | null
  overage_credits_used_this_period: number
  overage_limit_credits: number | null
  overage_usd_per_credit: number
  billing_period_end: string | null
}

export interface OverageSettingsUpdate {
  overage_enabled?: boolean
  overage_limit_mode?: 'unlimited' | 'capped'
  overage_spend_limit_dollars?: number
}

export async function createSubscriptionCheckoutSession(
  tier: PaidSubscriptionTier
): Promise<string> {
  const { data } = await apiClient.post<{ url: string }>('/billing/create-checkout-session', {
    tier,
  })
  return data.url
}

export async function createBillingPortalSession(): Promise<string> {
  const { data } = await apiClient.post<{ url: string }>('/billing/create-portal-session', {})
  return data.url
}

export async function getOverageSettings(): Promise<OverageSettings> {
  const { data } = await apiClient.get<OverageSettings>('/billing/overage-settings', {
    enableCache: false,
  })
  return data
}

export async function updateOverageSettings(
  update: OverageSettingsUpdate
): Promise<OverageSettings> {
  const { data } = await apiClient.put<OverageSettings>('/billing/overage-settings', update)
  return data
}
