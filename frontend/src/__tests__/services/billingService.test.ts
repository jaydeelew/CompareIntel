/**
 * Tests for billingService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { ApiError } from '../../services/api/errors'
import * as billingService from '../../services/billingService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'

describe('billingService', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('createSubscriptionCheckoutSession', () => {
    it('should return Stripe checkout URL for tier', async () => {
      server.use(
        http.post(apiPathGlob('/api/billing/create-checkout-session'), async ({ request }) => {
          const body = (await request.json()) as { tier: billingService.PaidSubscriptionTier }
          expect(body.tier).toBe('starter')
          return HttpResponse.json({ url: 'https://checkout.example/session' })
        })
      )

      const url = await billingService.createSubscriptionCheckoutSession('starter')
      expect(url).toBe('https://checkout.example/session')
    })

    it('should surface API errors', () => {
      server.use(
        http.post(apiPathGlob('/api/billing/create-checkout-session'), () =>
          HttpResponse.json({ detail: 'Stripe not configured' }, { status: 503 })
        )
      )

      return expect(billingService.createSubscriptionCheckoutSession('pro')).rejects.toThrow(
        ApiError
      )
    })
  })

  describe('createBillingPortalSession', () => {
    it('should return customer portal URL', async () => {
      server.use(
        http.post(apiPathGlob('/api/billing/create-portal-session'), async ({ request }) => {
          await request.json()
          return HttpResponse.json({ url: 'https://billing.example/portal' })
        })
      )

      const url = await billingService.createBillingPortalSession()
      expect(url).toBe('https://billing.example/portal')
    })
  })

  describe('getOverageSettings', () => {
    it('should return current overage settings', async () => {
      const settings: billingService.OverageSettings = {
        overage_enabled: true,
        overage_spend_limit_cents: 500,
        overage_credits_used_this_period: 3,
        overage_limit_credits: 100,
        overage_usd_per_credit: 0.01,
        billing_period_end: new Date().toISOString(),
      }

      server.use(
        http.get(apiPathGlob('/api/billing/overage-settings'), () => HttpResponse.json(settings))
      )

      const result = await billingService.getOverageSettings()
      expect(result).toEqual(settings)
    })
  })

  describe('updateOverageSettings', () => {
    it('should update overage limits', async () => {
      const update: billingService.OverageSettingsUpdate = {
        overage_enabled: false,
      }
      const next: billingService.OverageSettings = {
        overage_enabled: false,
        overage_spend_limit_cents: null,
        overage_credits_used_this_period: 0,
        overage_limit_credits: null,
        overage_usd_per_credit: 0.01,
        billing_period_end: null,
      }

      server.use(
        http.put(apiPathGlob('/api/billing/overage-settings'), async ({ request }) => {
          expect(await request.json()).toEqual(update)
          return HttpResponse.json(next)
        })
      )

      const result = await billingService.updateOverageSettings(update)
      expect(result).toEqual(next)
    })
  })
})
