/**
 * Stripe Checkout / Customer Portal (requires backend STRIPE_* configuration).
 */

import { apiClient } from './api/client'

export type PaidSubscriptionTier = 'starter' | 'starter_plus' | 'pro' | 'pro_plus'

export async function createSubscriptionCheckoutSession(
  tier: PaidSubscriptionTier
): Promise<string> {
  const { data } = await apiClient.post<{ url: string }>('/billing/create-checkout-session', {
    tier,
  })
  return data.url
}

export async function createCreditPackCheckoutSession(): Promise<string> {
  const { data } = await apiClient.post<{ url: string }>(
    '/billing/create-credit-pack-checkout-session',
    {}
  )
  return data.url
}

export async function createBillingPortalSession(): Promise<string> {
  const { data } = await apiClient.post<{ url: string }>('/billing/create-portal-session', {})
  return data.url
}
