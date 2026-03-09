/**
 * Modal explaining the credits system.
 * Shown when user taps the info icon next to "credits remaining".
 * Matches the pattern used by Help me choose (ranking info) and Advanced settings.
 */

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import './DisabledButtonInfoModal.css'

interface CreditsInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

export const CREDITS_MESSAGE =
  'Credits are used for each comparison based on token usage. One credit equals 1,000 effective tokens (input tokens + output tokens × 2.5). Your balance resets daily for free tiers or monthly for paid tiers. Credits are only charged when a comparison completes successfully.'

export function CreditsInfoModal({ isOpen, onClose }: CreditsInfoModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    closeButtonRef.current?.focus()

    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

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
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-info-title"
      aria-describedby="credits-info-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="credits-info-title">Credits</h3>
          <button
            ref={closeButtonRef}
            className="disabled-button-info-close"
            onClick={onClose}
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
        <div className="disabled-button-info-content">
          <p id="credits-info-message">{CREDITS_MESSAGE}</p>
          <p className="param-info-methodology-link">
            <Link to="/faq#credits-system" onClick={onClose}>
              How does the credits system work?
            </Link>
          </p>
        </div>
        <div className="disabled-button-info-footer">
          <button className="disabled-button-info-button" onClick={onClose} type="button" autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
