/**
 * Modal explaining the remaining / allocated credits fraction in account UI.
 * Shown from the user menu on mobile (see Advanced Settings info pattern — no hover tooltip).
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import { CREDITS_FRACTION_TOOLTIP } from '../credits/creditsTooltipCopy'

import './DisabledButtonInfoModal.css'

interface CreditsFractionInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreditsFractionInfoModal({ isOpen, onClose }: CreditsFractionInfoModalProps) {
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

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-fraction-info-title"
      aria-describedby="credits-fraction-info-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="credits-fraction-info-title">Credit balance</h3>
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
          <p id="credits-fraction-info-message">{CREDITS_FRACTION_TOOLTIP}</p>
          <p className="param-info-methodology-link" style={{ marginBottom: 0 }}>
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
    </div>,
    document.body
  )
}
