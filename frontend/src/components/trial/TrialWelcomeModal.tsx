/**
 * Trial Welcome Modal Component
 * Displays a welcome message to new users explaining the 7-day premium trial
 */

import React, { useCallback, useEffect, useRef } from 'react'
import './TrialWelcomeModal.css'

interface TrialWelcomeModalProps {
  isOpen: boolean
  onClose: () => void
  trialEndsAt?: string
  userEmail?: string
}

export const TrialWelcomeModal: React.FC<TrialWelcomeModalProps> = ({
  isOpen,
  onClose,
  trialEndsAt,
  userEmail,
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Format the trial end date
  const formatTrialEndDate = (dateString?: string): string => {
    if (!dateString) return '7 days'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handleClose = useCallback(() => {
    // Mark trial welcome as seen in localStorage using user-specific key
    const trialSeenKey = userEmail ? `trial-welcome-seen-${userEmail}` : 'trial-welcome-seen'
    localStorage.setItem(trialSeenKey, 'true')
    onClose()
  }, [onClose, userEmail])

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    // Focus the close button when modal opens for accessibility
    closeButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="trial-welcome-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-welcome-title"
      aria-describedby="trial-welcome-description"
    >
      <div
        className="trial-welcome-modal"
        onClick={e => e.stopPropagation()}
        ref={modalRef}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            handleClose()
          }
        }}
      >
        <div className="trial-welcome-header">
          <div className="trial-welcome-icon">🎉</div>
          <h2 id="trial-welcome-title">Welcome to CompareIntel!</h2>
          <button
            ref={closeButtonRef}
            className="trial-welcome-close"
            onClick={handleClose}
            aria-label="Close"
            type="button"
          >
            <svg
              width="20"
              height="20"
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

        <div className="trial-welcome-content" id="trial-welcome-description">
          <div className="trial-welcome-badge">
            <span className="badge-star">⭐</span>
            <span className="badge-text">7-Day Premium Trial</span>
            <span className="badge-star">⭐</span>
          </div>

          <p className="trial-welcome-intro">
            As a thank you for joining, you have <strong>7 days of FREE access</strong> to all
            premium AI models!
          </p>

          <div className="trial-welcome-features">
            <h3>During your trial, you can:</h3>
            <ul>
              <li>
                <span className="feature-icon">🤖</span>
                <span>Compare ALL premium models side-by-side</span>
              </li>
              <li>
                <span className="feature-icon">🧠</span>
                <span>Access Claude Opus, GPT-5, Gemini Ultra, and more</span>
              </li>
              <li>
                <span className="feature-icon">⚡</span>
                <span>Experience the full power of AI comparison</span>
              </li>
              <li>
                <span className="feature-icon">💳</span>
                <span>No credit card required</span>
              </li>
            </ul>
          </div>

          <div className="trial-welcome-note">
            <p>
              <strong>Note:</strong> You still have your daily limit of 100 credits per day during
              the trial. After {formatTrialEndDate(trialEndsAt)}, you'll return to free-tier model
              access. Paid subscriptions are coming soon — stay tuned to keep using premium models!
            </p>
          </div>
        </div>

        <div className="trial-welcome-footer">
          <button className="trial-welcome-button" onClick={handleClose} type="button" autoFocus>
            Start Exploring Premium Models
          </button>
        </div>
      </div>
    </div>
  )
}
