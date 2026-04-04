/**
 * Modal showing tooltip content for composer action buttons on mobile.
 * Includes "Do not show again" checkbox. Reuses DisabledButtonInfoModal styling.
 */

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import './DisabledButtonInfoModal.css'
import { setTooltipModalSuppressed } from './tooltipModalStorage'

export type ComposerTooltipButtonId = 'add-file' | 'voice' | 'web-search' | 'submit'

interface ActionButtonTooltipModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called when user clicks "Got it" - perform the button's action */
  onConfirm: () => void
  buttonId: ComposerTooltipButtonId
  title: string
  message: string
}

export const ActionButtonTooltipModal: React.FC<ActionButtonTooltipModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  buttonId,
  title,
  message,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)

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

  const handleConfirm = () => {
    if (dontShowAgain) {
      setTooltipModalSuppressed(buttonId, true)
    }
    onConfirm()
    onClose()
  }

  if (!isOpen) return null

  // Portal to body: hero-input-section uses transform (slideUpOnly), which traps position:fixed
  // to that subtree so bottom-sheet CSS would align to the hero, not the viewport.
  return createPortal(
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-tooltip-modal-title"
      aria-describedby="action-tooltip-modal-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="action-tooltip-modal-title">{title}</h3>
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
          <p id="action-tooltip-modal-message">{message}</p>
          <label className="action-tooltip-dont-show-again">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => setDontShowAgain(e.target.checked)}
            />
            <span>Do not show again</span>
          </label>
        </div>
        <div className="disabled-button-info-footer">
          <button
            className="disabled-button-info-button"
            data-testid="action-tooltip-modal-confirm"
            onClick={handleConfirm}
            type="button"
            autoFocus
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
