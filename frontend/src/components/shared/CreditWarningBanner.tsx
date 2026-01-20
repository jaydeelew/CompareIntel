import type { CreditBalance } from '../../services/creditService'

interface CreditWarningBannerProps {
  message: string | null
  messageRef: React.RefObject<HTMLDivElement>
  isDismissible: boolean
  creditBalance: CreditBalance | null
  onDismiss: () => void
}

export function CreditWarningBanner({
  message,
  messageRef,
  isDismissible,
  creditBalance,
  onDismiss,
}: CreditWarningBannerProps) {
  if (!message) {
    return null
  }

  return (
    <div className="error-message" ref={messageRef}>
      <span>⚠️ {message}</span>
      {isDismissible && creditBalance && (
        <button className="dismiss-warning-button" onClick={onDismiss} title="Dismiss warning">
          Dismiss
        </button>
      )}
    </div>
  )
}
