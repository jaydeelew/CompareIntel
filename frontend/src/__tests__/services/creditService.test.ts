/**
 * Tests for creditService — pure helpers + HTTP via MSW (real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { ApiError } from '../../services/api/errors'
import {
  getCreditBalance,
  getCreditUsage,
  getSpendableCreditsRemaining,
  type CreditBalance,
  type CreditUsageHistory,
} from '../../services/creditService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'

describe('getSpendableCreditsRemaining', () => {
  const base: CreditBalance = {
    credits_allocated: 50,
    credits_remaining: 0,
    credits_used_today: 50,
    period_type: 'daily',
    subscription_tier: 'unregistered',
  }

  it('returns remaining credits when monthly pool > 0', () => {
    expect(
      getSpendableCreditsRemaining(
        { ...base, credits_remaining: 10, subscription_tier: 'starter' },
        'starter'
      )
    ).toBe(10)
  })

  it('returns 0 when exhausted for free-ish tiers', () => {
    expect(getSpendableCreditsRemaining({ ...base, subscription_tier: 'free' }, 'free')).toBe(0)
    expect(
      getSpendableCreditsRemaining({ ...base, subscription_tier: 'unregistered' }, 'unregistered')
    ).toBe(0)
  })

  it('returns 1 when unlimited overage (limit null) on paid tier', () => {
    const bal: CreditBalance = {
      ...base,
      credits_remaining: 0,
      subscription_tier: 'pro',
      overage_enabled: true,
      overage_credits_used_this_period: 99,
      overage_limit_credits: null,
    }
    expect(getSpendableCreditsRemaining(bal, 'pro')).toBe(1)
  })

  it('returns remaining capped overage when pool is 0', () => {
    const bal: CreditBalance = {
      ...base,
      credits_remaining: 0,
      subscription_tier: 'pro',
      overage_enabled: true,
      overage_credits_used_this_period: 3,
      overage_limit_credits: 10,
    }
    expect(getSpendableCreditsRemaining(bal, 'pro')).toBe(7)
  })

  it('returns 0 when overage disabled on paid tier with empty pool', () => {
    const bal: CreditBalance = {
      ...base,
      credits_remaining: 0,
      subscription_tier: 'pro',
      overage_enabled: false,
    }
    expect(getSpendableCreditsRemaining(bal, 'pro')).toBe(0)
  })
})

describe('creditService HTTP', () => {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  beforeEach(() => {
    server.resetHandlers()
  })

  describe('getCreditBalance', () => {
    it('fetches balance for authenticated caller', async () => {
      const balance: CreditBalance = {
        credits_allocated: 100,
        credits_remaining: 42,
        period_type: 'monthly',
        subscription_tier: 'pro',
      }

      server.use(
        http.get(apiPathGlob('/api/credits/balance'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('timezone')).toBe(userTimezone)
          expect(u.searchParams.has('fingerprint')).toBe(false)
          return HttpResponse.json(balance)
        })
      )

      const result = await getCreditBalance()
      expect(result).toEqual(balance)
    })

    it('includes fingerprint query for anonymous callers', async () => {
      const fp = 'abc'
      const stub: CreditBalance = {
        credits_allocated: 50,
        credits_remaining: 10,
        period_type: 'daily',
        subscription_tier: 'unregistered',
      }

      server.use(
        http.get(apiPathGlob('/api/credits/balance'), ({ request }) => {
          expect(new URL(request.url).searchParams.get('fingerprint')).toBe(fp)
          return HttpResponse.json(stub)
        })
      )

      const result = await getCreditBalance(fp)
      expect(result).toEqual(stub)
    })

    it('handles API errors', () => {
      server.use(
        http.get(apiPathGlob('/api/credits/balance'), () =>
          HttpResponse.json({ detail: 'boom' }, { status: 500 })
        )
      )

      return expect(getCreditBalance()).rejects.toThrow(ApiError)
    })
  })

  describe('getCreditUsage', () => {
    it('requests paginated usage history', async () => {
      const body: CreditUsageHistory = {
        total: 0,
        page: 2,
        per_page: 25,
        total_pages: 0,
        results: [],
      }

      server.use(
        http.get(apiPathGlob('/api/credits/usage'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('page')).toBe('2')
          expect(u.searchParams.get('per_page')).toBe('25')
          return HttpResponse.json(body)
        })
      )

      const result = await getCreditUsage(2, 25)
      expect(result).toEqual(body)
    })
  })
})
