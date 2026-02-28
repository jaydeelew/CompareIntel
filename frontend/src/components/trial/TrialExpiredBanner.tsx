/**
 * Trial Expired Banner Component
 * Displays a dismissible banner when the user's 7-day premium trial has ended
 */

import React, { useCallback, useEffect, useState } from 'react'
import './TrialExpiredBanner.css'

interface TrialExpiredBannerProps {
  trialEndsAt?: string
  onDismiss: () => void
}

export const TrialExpiredBanner: React.FC<TrialExpiredBannerProps> = ({
  trialEndsAt,
  onDismiss,
}) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if banner was already dismissed for this trial end date
    if (!trialEndsAt) {
      setIsVisible(false)
      return
    }

    const dismissedKey = `trial-expired-dismissed-${trialEndsAt}`
    const wasDismissed = localStorage.getItem(dismissedKey) === 'true'
    setIsVisible(!wasDismissed)
  }, [trialEndsAt])

  const handleDismiss = useCallback(() => {
    if (trialEndsAt) {
      // Store dismissal in localStorage keyed by trial end date
      localStorage.setItem(`trial-expired-dismissed-${trialEndsAt}`, 'true')
    }
    setIsVisible(false)
    onDismiss()
  }, [trialEndsAt, onDismiss])

  if (!isVisible) return null

  return (
    <div className="trial-expired-banner" role="alert">
      <div className="trial-expired-content">
        <span className="trial-expired-icon">⏰</span>
        <div className="trial-expired-text">
          <strong>Your 7-day premium trial has ended.</strong>
          <span>
            {' '}
            You now have access to free-tier models. Paid subscriptions are coming soon — stay tuned
            to unlock all premium AI models!
          </span>
        </div>
        <div className="trial-expired-actions">
          <button
            className="trial-expired-dismiss-btn"
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            type="button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
