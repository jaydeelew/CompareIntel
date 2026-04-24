/**
 * After Stripe Checkout redirects back with ?checkout=..., poll refreshUser + credit refetch a few
 * times (webhook may land after the first /auth/me). Strip query params when done. Effect deps use
 * user id only so refreshUser() identity changes do not cancel the poll mid-flight.
 */

import type { FC } from 'react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../../contexts/AuthContext'
import { dispatchBillingUpdatedImmediate } from '../../utils/billingSync'

const SUCCESS_CHECKOUT = new Set(['success'])

export const StripeCheckoutReturnSync: FC = () => {
  const { refreshUser, user, isLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const checkout = params.get('checkout')
    if (!checkout) {
      return
    }

    const stripStripeParams = () => {
      params.delete('checkout')
      params.delete('session_id')
      const next = params.toString()
      navigate({ pathname: location.pathname, search: next ? `?${next}` : '' }, { replace: true })
    }

    if (!SUCCESS_CHECKOUT.has(checkout)) {
      stripStripeParams()
      return
    }

    if (isLoading) {
      return
    }

    if (!user) {
      stripStripeParams()
      return
    }

    let cancelled = false
    const POLL_ATTEMPTS = 6
    const POLL_INTERVAL_MS = 1500

    ;(async () => {
      for (let i = 0; i < POLL_ATTEMPTS; i++) {
        if (cancelled) return
        if (i > 0) {
          await new Promise<void>(resolve => {
            setTimeout(resolve, POLL_INTERVAL_MS)
          })
        }
        if (cancelled) return
        await refreshUser()
        if (cancelled) return
        dispatchBillingUpdatedImmediate()
      }
      if (!cancelled) {
        stripStripeParams()
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user?.id only; full `user` restarts effect and cancels checkout polling on every refreshUser()
  }, [isLoading, location.pathname, location.search, navigate, refreshUser, user?.id])

  return null
}
