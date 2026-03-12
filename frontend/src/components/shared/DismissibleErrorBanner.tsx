/**
 * DismissibleErrorBanner - Error-styled banner that only closes when user dismisses
 *
 * Uses the same .error-message styling as other error banners (CreditWarningBanner,
 * main error display) for consistent theme/appearance.
 */

interface DismissibleErrorBannerProps {
  message: string | null
  onDismiss: () => void
}

export function DismissibleErrorBanner({ message, onDismiss }: DismissibleErrorBannerProps) {
  if (!message) {
    return null
  }

  return (
    <div className="error-message">
      <span>⚠️ {message}</span>
      <button type="button" className="dismiss-warning-button" onClick={onDismiss} title="Dismiss">
        Dismiss
      </button>
    </div>
  )
}
