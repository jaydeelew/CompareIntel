/**
 * Modal explaining the scope of Help me choose recommendations.
 * Shown when user taps the info icon next to the "Help me choose" button.
 * Matches the pattern used by BestAtTopInfoModal and CreditsInfoModal.
 */

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import './DisabledButtonInfoModal.css'

interface HelpMeChooseScopeInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

const HELP_ME_CHOOSE_SCOPE_MESSAGE =
  'The models in this dropdown only include those with a trustworthy benchmarking source or other reliable means to determine their status. Newer releases may not appear here until they have sufficient benchmark data. For the full catalog—including the latest models—use the Select Models to Compare section below.'

export function HelpMeChooseScopeInfoModal({ isOpen, onClose }: HelpMeChooseScopeInfoModalProps) {
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
      aria-labelledby="hmc-scope-info-title"
      aria-describedby="hmc-scope-info-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="hmc-scope-info-title">Help me choose</h3>
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
          <p id="hmc-scope-info-message">{HELP_ME_CHOOSE_SCOPE_MESSAGE}</p>
          <p className="best-at-top-methodology-link">
            <Link to="/help-me-choose-methodology" onClick={onClose}>
              Help me choose methodology
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
