import { describe, expect, it } from 'vitest'

import {
  getDisplayCreditsRemaining,
  getSpendableCreditsRemaining,
  type CreditBalance,
} from '../credits'

describe('credits helpers', () => {
  const anonBalance: CreditBalance = {
    credits_allocated: 50,
    credits_used_today: 0,
    credits_remaining: 50,
    period_type: 'daily',
    subscription_tier: 'unregistered',
  }

  it('returns credits_remaining for anonymous users', () => {
    expect(getDisplayCreditsRemaining(anonBalance, 'unregistered')).toBe(50)
  })

  it('returns 0 when monthly pool is exhausted without overage', () => {
    const balance: CreditBalance = {
      credits_allocated: 720,
      credits_used_this_period: 720,
      credits_remaining: 0,
      period_type: 'monthly',
      subscription_tier: 'starter',
      overage_enabled: false,
    }
    expect(getSpendableCreditsRemaining(balance, 'starter')).toBe(0)
  })

  it('returns overage headroom when pool is exhausted and overage is enabled', () => {
    const balance: CreditBalance = {
      credits_allocated: 720,
      credits_used_this_period: 720,
      credits_remaining: 0,
      period_type: 'monthly',
      subscription_tier: 'starter',
      overage_enabled: true,
      overage_credits_used_this_period: 2,
      overage_limit_credits: 10,
    }
    expect(getSpendableCreditsRemaining(balance, 'starter')).toBe(8)
  })
})
