/**
 * Modal component to display information about the Hide/Show premium models toggle button
 * Used on mobile layout to explain the feature to users
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import './PremiumModelsToggleInfoModal.css'

interface PremiumModelsToggleInfoModalProps {
  isOpen: boolean
  onClose: () => void
  onDontShowAgain: (checked: boolean) => void
}

export const PremiumModelsToggleInfoModal: React.FC<PremiumModelsToggleInfoModalProps> = ({
  isOpen,
  onClose,
  onDontShowAgain,
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false)

  const handleClose = useCallback(() => {
    onDontShowAgain(dontShowAgainChecked)
    onClose()
  }, [dontShowAgainChecked, onClose, onDontShowAgain])

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

  // Reset checkbox when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDontShowAgainChecked(false)
    }
  }, [isOpen])

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDontShowAgainChecked(e.target.checked)
  }

  if (!isOpen) return null

  return (
    <div
      className="premium-models-toggle-info-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-models-toggle-info-title"
      aria-describedby="premium-models-toggle-info-message"
    >
      <div
        className="premium-models-toggle-info-modal"
        onClick={e => e.stopPropagation()}
        ref={modalRef}
        onKeyDown={e => {
          // Close on Escape key (handled in useEffect, but also here for safety)
          if (e.key === 'Escape') {
            handleClose()
          }
        }}
      >
        <div className="premium-models-toggle-info-header">
          <h3 id="premium-models-toggle-info-title">
            <span className="premium-models-toggle-info-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="1"
                  y1="1"
                  x2="23"
                  y2="23"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Hide/Show Premium Models
          </h3>
          <button
            ref={closeButtonRef}
            className="premium-models-toggle-info-close"
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
        <div className="premium-models-toggle-info-content">
          <p id="premium-models-toggle-info-message">
            This button allows you to hide or show premium AI models in the selection area. When
            hidden, only free models will be displayed, making it easier to find models available to
            your tier. You can toggle this setting anytime to switch between viewing all models or
            just the free ones.
          </p>
        </div>
        <div className="premium-models-toggle-info-footer">
          <label className="premium-models-toggle-info-checkbox-label">
            <input
              type="checkbox"
              checked={dontShowAgainChecked}
              onChange={handleCheckboxChange}
              className="premium-models-toggle-info-checkbox"
            />
            <span>Do not show again</span>
          </label>
          <button
            className="premium-models-toggle-info-button"
            onClick={handleClose}
            type="button"
            autoFocus
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
