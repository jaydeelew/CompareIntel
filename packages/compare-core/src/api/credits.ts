import type { CompareIntelApiClient } from './client'

export interface CreditBalance {
  credits_allocated: number
  credits_used_this_period?: number
  credits_used_today?: number
  credits_remaining: number
  total_credits_used?: number
  credits_reset_at?: string
  billing_period_start?: string
  billing_period_end?: string
  period_type: 'daily' | 'monthly'
  subscription_tier: string
  overage_enabled?: boolean
  overage_credits_used_this_period?: number
  overage_limit_credits?: number | null
  credits_reset_shows_utc?: boolean
}

/** Spendable credits: monthly pool first, then metered overage when enabled. */
export function getSpendableCreditsRemaining(
  balance: CreditBalance,
  subscriptionTier: string
): number {
  if (balance.credits_remaining > 0) {
    return balance.credits_remaining
  }
  const isPaid = subscriptionTier !== 'unregistered' && subscriptionTier !== 'free'
  if (!isPaid || !balance.overage_enabled) {
    return 0
  }
  const used = balance.overage_credits_used_this_period ?? 0
  const limit = balance.overage_limit_credits
  if (limit == null) {
    return 1
  }
  return Math.max(0, limit - used)
}

export function getDisplayCreditsRemaining(
  balance: CreditBalance | null,
  subscriptionTier: string
): number | null {
  if (!balance) return null
  const tier = balance.subscription_tier || subscriptionTier
  if (balance.subscription_tier === tier || !balance.subscription_tier) {
    return getSpendableCreditsRemaining(balance, tier)
  }
  return getSpendableCreditsRemaining(balance, subscriptionTier)
}

function buildCreditBalanceQuery(fingerprint?: string): string {
  const params = new URLSearchParams()
  if (fingerprint) {
    params.append('fingerprint', fingerprint)
  }
  try {
    params.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    // timezone unavailable in some environments
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function fetchCreditBalance(
  client: CompareIntelApiClient,
  fingerprint?: string
): Promise<CreditBalance> {
  return client.get<CreditBalance>(`/credits/balance${buildCreditBalanceQuery(fingerprint)}`)
}
