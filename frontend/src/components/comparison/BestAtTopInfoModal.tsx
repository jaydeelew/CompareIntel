/**
 * Modal to explain the "Best at top" ordering in Help Me Choose.
 * Shown when user taps the info icon on mobile (tooltips don't work on touch).
 * Reuses DisabledButtonInfoModal styling for consistency with other mobile modals.
 */

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import './DisabledButtonInfoModal.css'

interface BestAtTopInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

const BEST_AT_TOP_MESSAGE =
  'Models are ordered from best (top) to least recommended (bottom) based on published benchmarks. Tap the info icon next to a model to see its evidence.'

export function BestAtTopInfoModal({ isOpen, onClose }: BestAtTopInfoModalProps) {
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
      aria-labelledby="best-at-top-info-title"
      aria-describedby="best-at-top-info-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="best-at-top-info-title">Best at top</h3>
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
          <p id="best-at-top-info-message">{BEST_AT_TOP_MESSAGE}</p>
          <p className="best-at-top-methodology-link">
            <Link to="/help-me-choose-methodology" onClick={onClose}>
              Help Me Choose Methodology
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
