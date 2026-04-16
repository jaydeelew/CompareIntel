import { useCallback, useEffect, useRef, useState } from 'react'

import { OVERAGE_USD_PER_CREDIT } from '../config/constants'

type CreditWarningType = 'low' | 'insufficient' | 'none' | 'overage_active' | 'overage_cap_hit'

export interface OverageContext {
  overage_enabled?: boolean
  overage_credits_used_this_period?: number
  overage_limit_credits?: number | null
}

export function useCreditWarningManager() {
  const [creditWarningMessage, setCreditWarningMessage] = useState<string | null>(null)
  const [creditWarningType, setCreditWarningType] = useState<CreditWarningType>('none')
  const [creditWarningDismissible, setCreditWarningDismissible] = useState(false)
  const [showOverageExtend, setShowOverageExtend] = useState(false)
  const creditWarningMessageRef = useRef<HTMLDivElement>(null)
  const prevCreditWarningMessageRef = useRef<string | null>(null)

  const scrollToCenterElement = useCallback((element: HTMLElement | null) => {
    if (!element) return

    setTimeout(() => {
      const elementRect = element.getBoundingClientRect()
      const elementTop = elementRect.top + window.scrollY
      const elementHeight = elementRect.height
      const windowHeight = window.innerHeight

      const scrollPosition = elementTop - windowHeight / 2 + elementHeight / 2

      window.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: 'smooth',
      })
    }, 100)
  }, [])

  useEffect(() => {
    if (creditWarningMessage && !prevCreditWarningMessageRef.current) {
      scrollToCenterElement(creditWarningMessageRef.current)
    }
    prevCreditWarningMessageRef.current = creditWarningMessage
  }, [creditWarningMessage, scrollToCenterElement])

  const getCreditWarningMessage = useCallback(
    (
      type: CreditWarningType,
      tier: string,
      creditsRemaining: number,
      estimatedCredits?: number,
      creditsResetAt?: string,
      overageCtx?: OverageContext
    ): string => {
      const resetDateStr = creditsResetAt
        ? new Date(creditsResetAt).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          })
        : 'N/A'
      const isPaid = !['unregistered', 'free'].includes(tier)
      const ov = overageCtx ?? {}

      if (type === 'overage_cap_hit') {
        const used = ov.overage_credits_used_this_period ?? 0
        const cost = (used * OVERAGE_USD_PER_CREDIT).toFixed(2)
        return `You've reached your overage spending limit (${used.toLocaleString()} overage credits, $${cost}). Increase the limit in Settings → Billing & Overages or wait for credits to reset on ${resetDateStr}.`
      }

      if (type === 'overage_active') {
        return `Your monthly pool is exhausted — using overage credits at $${OVERAGE_USD_PER_CREDIT}/credit. Manage limits in Settings → Billing & Overages.`
      }

      if (type === 'none') {
        if (tier === 'unregistered') {
          return "You've run out of credits. Credits will reset to 50 tomorrow, or sign-up for a free account to get more credits, more models, and more history!"
        } else if (tier === 'free') {
          return "You've run out of credits. Credits will reset to 100 tomorrow. Use Account → Upgrade plan for paid monthly pools."
        } else if (isPaid && ov.overage_enabled) {
          return `Your monthly pool and overage budget are exhausted. Credits reset on ${resetDateStr}. Increase your overage limit in Settings → Billing & Overages, or upgrade your plan.`
        } else if (isPaid) {
          return `You've run out of credits which will reset on ${resetDateStr}. Enable pay-as-you-go overages in Settings → Billing & Overages to keep using the service.`
        }
        return `You've run out of credits which will reset on ${resetDateStr}. Enable overages in Settings → Billing & Overages or upgrade your plan.`
      }

      if (type === 'insufficient') {
        const extra =
          isPaid && !ov.overage_enabled
            ? ' Enable overages in Settings → Billing & Overages to avoid truncation.'
            : ''
        return `This comparison is estimated to take ${estimatedCredits?.toFixed(1) || 'X'} credits and you have ${Math.round(creditsRemaining)} credits remaining. The model responses may be truncated. Try selecting fewer models or shorten your input.${extra}`
      }

      // type === 'low'
      if (tier === 'unregistered') {
        return `You have ${Math.round(creditsRemaining)} credits left for today. Credits will reset to 50 tomorrow, or sign-up for a free account to get more credits, more models, and more history!`
      } else if (tier === 'free') {
        return `You have ${Math.round(creditsRemaining)} credits left for today. Credits will reset to 100 tomorrow. Paid plans add monthly pools — Account → Upgrade plan.`
      } else if (isPaid && ov.overage_enabled) {
        return `You have ${Math.round(creditsRemaining)} credits left in your monthly pool. When depleted, overage credits will be used automatically at $${OVERAGE_USD_PER_CREDIT}/credit.`
      } else if (isPaid) {
        return `You have ${Math.round(creditsRemaining)} credits left in your monthly billing cycle. Enable overages in Settings → Billing & Overages so you can keep using the service when credits run out.`
      }
      return `You have ${Math.round(creditsRemaining)} credits left in your monthly billing cycle. Enable overages in Settings → Billing & Overages or upgrade your plan.`
    },
    []
  )

  const isLowCreditWarningDismissed = useCallback(
    (tier: string, periodType: 'daily' | 'monthly', creditsResetAt?: string): boolean => {
      if (periodType === 'daily') {
        const today = new Date().toDateString()
        const dismissedDate = localStorage.getItem(`credit-warning-dismissed-${tier}-daily`)
        return dismissedDate === today
      }
      if (!creditsResetAt) return false
      const resetDate = new Date(creditsResetAt).toDateString()
      const dismissedResetDate = localStorage.getItem(`credit-warning-dismissed-${tier}-monthly`)
      return dismissedResetDate === resetDate
    },
    []
  )

  const dismissLowCreditWarning = useCallback(
    (tier: string, periodType: 'daily' | 'monthly', creditsResetAt?: string) => {
      if (periodType === 'daily') {
        const today = new Date().toDateString()
        localStorage.setItem(`credit-warning-dismissed-${tier}-daily`, today)
      } else if (creditsResetAt) {
        const resetDate = new Date(creditsResetAt).toDateString()
        localStorage.setItem(`credit-warning-dismissed-${tier}-monthly`, resetDate)
      }
      setCreditWarningMessage(null)
      setCreditWarningDismissible(false)
    },
    []
  )

  const OVERAGE_ACTIVE_DISMISSED_KEY = 'overage-active-dismissed'

  const isOverageActiveDismissed = useCallback((creditsResetAt?: string): boolean => {
    if (!creditsResetAt) return false
    const resetDate = new Date(creditsResetAt).toDateString()
    return localStorage.getItem(OVERAGE_ACTIVE_DISMISSED_KEY) === resetDate
  }, [])

  const dismissOverageActive = useCallback((creditsResetAt?: string) => {
    if (creditsResetAt) {
      const resetDate = new Date(creditsResetAt).toDateString()
      localStorage.setItem(OVERAGE_ACTIVE_DISMISSED_KEY, resetDate)
    }
    setCreditWarningMessage(null)
    setCreditWarningType('none')
    setCreditWarningDismissible(false)
  }, [])

  return {
    creditWarningMessage,
    setCreditWarningMessage,
    creditWarningType,
    setCreditWarningType,
    creditWarningDismissible,
    setCreditWarningDismissible,
    showOverageExtend,
    setShowOverageExtend,
    creditWarningMessageRef,
    getCreditWarningMessage,
    isLowCreditWarningDismissed,
    dismissLowCreditWarning,
    isOverageActiveDismissed,
    dismissOverageActive,
  }
}
