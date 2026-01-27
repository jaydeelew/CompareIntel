import { useCallback, useEffect, useRef, useState } from 'react'

type CreditWarningType = 'low' | 'insufficient' | 'none'

export function useCreditWarningManager() {
  const [creditWarningMessage, setCreditWarningMessage] = useState<string | null>(null)
  const [creditWarningType, setCreditWarningType] = useState<CreditWarningType>('none')
  const [creditWarningDismissible, setCreditWarningDismissible] = useState(false)
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
      creditsResetAt?: string
    ): string => {
      if (type === 'none') {
        if (tier === 'unregistered') {
          return "You've run out of credits. Credits will reset to 50 tomorrow, or sign-up for a free account to get more credits, more models, and more history!"
        } else if (tier === 'free') {
          return "You've run out of credits. Credits will reset to 100 tomorrow. Paid plans with more credits are coming soon!"
        } else if (tier === 'pro_plus') {
          const resetDate = creditsResetAt
            ? new Date(creditsResetAt).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
              })
            : 'N/A'
          return `You've run out of credits which will reset on ${resetDate}. Wait until your reset, or sign-up for model comparison overages.`
        } else {
          const resetDate = creditsResetAt
            ? new Date(creditsResetAt).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
              })
            : 'N/A'
          return `You've run out of credits which will reset on ${resetDate}. More subscription options are coming soon!`
        }
      } else if (type === 'insufficient') {
        return `This comparison is estimated to take ${estimatedCredits?.toFixed(1) || 'X'} credits and you have ${Math.round(creditsRemaining)} credits remaining. The model responses may be truncated. If possible, try selecting less models or shorten your input.`
      } else {
        if (tier === 'unregistered') {
          return `You have ${Math.round(creditsRemaining)} credits left for today. Credits will reset to 50 tomorrow, or sign-up for a free account to get more credits, more models, and more history!`
        } else if (tier === 'free') {
          return `You have ${Math.round(creditsRemaining)} credits left for today. Credits will reset to 100 tomorrow. Paid plans with more credits are coming soon!`
        } else if (tier === 'pro_plus') {
          return `You have ${Math.round(creditsRemaining)} credits left in your monthly billing cycle. Wait until your cycle starts again, or sign-up for model comparison overages.`
        } else {
          return `You have ${Math.round(creditsRemaining)} credits left in your monthly billing cycle. More subscription options are coming soon!`
        }
      }
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

  return {
    creditWarningMessage,
    setCreditWarningMessage,
    creditWarningType,
    setCreditWarningType,
    creditWarningDismissible,
    setCreditWarningDismissible,
    creditWarningMessageRef,
    getCreditWarningMessage,
    isLowCreditWarningDismissed,
    dismissLowCreditWarning,
  }
}
