import { useState } from 'react'

import { OVERAGE_USD_PER_CREDIT } from '../../config/constants'
import { updateOverageSettings } from '../../services/billingService'
import type { CreditBalance } from '../../services/creditService'

interface CreditWarningBannerProps {
  message: string | null
  messageRef: React.RefObject<HTMLDivElement | null>
  isDismissible: boolean
  creditBalance: CreditBalance | null
  onDismiss: () => void
  showOverageExtend?: boolean
  onOverageExtended?: () => void
}

const QUICK_EXTEND_AMOUNT = 5

export function CreditWarningBanner({
  message,
  messageRef,
  isDismissible,
  creditBalance,
  onDismiss,
  showOverageExtend,
  onOverageExtended,
}: CreditWarningBannerProps) {
  const [isExtending, setIsExtending] = useState(false)

  if (!message) {
    return null
  }

  const handleQuickExtend = async () => {
    if (isExtending) return
    setIsExtending(true)
    try {
      const currentLimitCents =
        creditBalance?.overage_limit_credits != null
          ? Math.round(
              (creditBalance.overage_credits_used_this_period ?? 0) * OVERAGE_USD_PER_CREDIT * 100
            ) +
            QUICK_EXTEND_AMOUNT * 100
          : QUICK_EXTEND_AMOUNT * 100
      await updateOverageSettings({
        overage_enabled: true,
        overage_limit_mode: 'capped',
        overage_spend_limit_dollars: currentLimitCents / 100,
      })
      onOverageExtended?.()
    } catch {
      // Error handled silently — user can retry or adjust in settings
    } finally {
      setIsExtending(false)
    }
  }

  const extendCredits = Math.floor(QUICK_EXTEND_AMOUNT / OVERAGE_USD_PER_CREDIT)

  return (
    <div className="error-message" ref={messageRef as React.RefObject<HTMLDivElement>}>
      <span>⚠️ {message}</span>
      <div className="credit-warning-actions">
        {showOverageExtend && (
          <button
            className="extend-overage-button"
            onClick={handleQuickExtend}
            disabled={isExtending}
            title={`Add $${QUICK_EXTEND_AMOUNT} (~${extendCredits} credits) to your overage limit`}
          >
            {isExtending ? 'Extending…' : `+$${QUICK_EXTEND_AMOUNT} (~${extendCredits} credits)`}
          </button>
        )}
        {isDismissible && creditBalance && (
          <button className="dismiss-warning-button" onClick={onDismiss} title="Dismiss warning">
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
