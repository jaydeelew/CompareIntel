/**
 * Modal component to display usage indicator information
 * Used on touch devices where tooltips are not available
 */

import React, { useEffect, useRef } from 'react'
import './UsageIndicatorInfoModal.css'

interface UsageIndicatorInfoModalProps {
  isOpen: boolean
  onClose: () => void
  percentage: number
  totalInputTokens: number
  limitingModel: { name: string; capacityChars: string } | null
  hasSelectedModels: boolean
}

export const UsageIndicatorInfoModal: React.FC<UsageIndicatorInfoModalProps> = ({
  isOpen,
  onClose,
  percentage,
  totalInputTokens: _totalInputTokens,
  limitingModel,
  hasSelectedModels,
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

  if (!isOpen) return null

  // Build message text
  let messageText: string
  if (!hasSelectedModels) {
    messageText =
      'Please choose one or more models from the model selection area before the usage percentage can be calculated.'
  } else {
    // Show "<1%" for sub-1% usage
    if (percentage < 1 && percentage > 0) {
      messageText = '<1% of input capacity used'
    } else {
      messageText = `${Math.round(percentage)}% of input capacity used`
    }

    // Append "Limited by..." message only when usage >= 50% and there's a limiting model
    if (limitingModel && percentage >= 50) {
      messageText += ` (Limited by ${limitingModel.name} at ${limitingModel.capacityChars})`
    }
  }

  return (
    <div
      className="usage-indicator-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-indicator-info-title"
      aria-describedby="usage-indicator-info-message"
    >
      <div
        className="usage-indicator-info-modal"
        onClick={e => e.stopPropagation()}
        ref={modalRef}
        onKeyDown={e => {
          // Close on Escape key (handled in useEffect, but also here for safety)
          if (e.key === 'Escape') {
            onClose()
          }
        }}
      >
        <div className="usage-indicator-info-header">
          <h3 id="usage-indicator-info-title">Input Capacity Usage</h3>
          <button
            ref={closeButtonRef}
            className="usage-indicator-info-close"
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
        <div className="usage-indicator-info-content">
          <p id="usage-indicator-info-message">{messageText}</p>
        </div>
        <div className="usage-indicator-info-footer">
          <button className="usage-indicator-info-button" onClick={onClose} type="button" autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
