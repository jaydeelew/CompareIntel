/**
 * Modal component to display information about why a button is disabled
 * Used on touch devices where tooltips are not available
 */

import React, { useEffect, useRef } from 'react'
import './DisabledButtonInfoModal.css'

interface DisabledButtonInfoModalProps {
  isOpen: boolean
  onClose: () => void
  buttonType: 'websearch' | 'submit' | 'collapse-all' | 'clear-all' | null
  message: string
}

export const DisabledButtonInfoModal: React.FC<DisabledButtonInfoModalProps> = ({
  isOpen,
  onClose,
  buttonType,
  message,
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    // Focus the close button when modal opens for accessibility
    closeButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

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

  if (!isOpen || !buttonType) return null

  const buttonTitle =
    buttonType === 'websearch'
      ? 'Web Search'
      : buttonType === 'submit'
        ? 'Submit'
        : buttonType === 'collapse-all'
          ? 'Collapse All Model Providers'
          : 'Clear All Selections'

  return (
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disabled-button-info-title"
      aria-describedby="disabled-button-info-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        ref={modalRef}
        onKeyDown={e => {
          // Close on Escape key (handled in useEffect, but also here for safety)
          if (e.key === 'Escape') {
            onClose()
          }
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="disabled-button-info-title">{buttonTitle}</h3>
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
          <p id="disabled-button-info-message">{message}</p>
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
