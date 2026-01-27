/**
 * Verification Success Modal Component
 * Displays a success message after email verification is complete
 */

import React, { useCallback, useEffect, useRef } from 'react'
import './VerificationSuccessModal.css'

interface VerificationSuccessModalProps {
  isOpen: boolean
  onClose: () => void
}

export const VerificationSuccessModal: React.FC<VerificationSuccessModalProps> = ({
  isOpen,
  onClose,
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Focus button when modal opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      setTimeout(() => buttonRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
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

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div
      className="verification-success-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-success-title"
    >
      <div className="verification-success-modal" onClick={e => e.stopPropagation()} ref={modalRef}>
        <div className="verification-success-header">
          <div className="verification-success-icon">
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="checkmark-svg"
            >
              <circle
                cx="32"
                cy="32"
                r="30"
                stroke="white"
                strokeWidth="4"
                fill="rgba(255,255,255,0.2)"
              />
              <path
                d="M20 32L28 40L44 24"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="checkmark-path"
              />
            </svg>
          </div>
          <h2 id="verification-success-title">Email Verified!</h2>
        </div>

        <div className="verification-success-content">
          <p className="verification-success-message">
            Your email has been successfully verified. Your account is now fully activated!
          </p>

          <div className="verification-success-features">
            <h3>You can now:</h3>
            <ul>
              <li>
                <span className="feature-icon">🎯</span>
                <span>Access additional free-tier models</span>
              </li>
              <li>
                <span className="feature-icon">📝</span>
                <span>Save an additional comparison history</span>
              </li>
              <li>
                <span className="feature-icon">⭐</span>
                <span>Save an additional model selection</span>
              </li>
              <li>
                <span className="feature-icon">⚙️</span>
                <span>Use the settings feature</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="verification-success-footer">
          <button
            ref={buttonRef}
            className="verification-success-button"
            onClick={handleClose}
            type="button"
          >
            Start Comparing AI Models
          </button>
        </div>
      </div>
    </div>
  )
}
