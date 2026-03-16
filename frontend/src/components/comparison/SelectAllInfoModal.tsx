/**
 * Modal showing tooltip content for the provider "Select all" button on mobile.
 * Includes "Do not show again" checkbox. Reuses DisabledButtonInfoModal styling.
 */

import { useEffect, useRef, useState } from 'react'

import './DisabledButtonInfoModal.css'
import { setTooltipModalSuppressed } from './tooltipModalStorage'

const SELECT_ALL_MODAL_STORAGE_KEY = 'select-all'

interface SelectAllInfoModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called when user clicks "Got it" - performs the select/deselect action when not disabled */
  onConfirm: () => void
  title: string
  message: string
  /** When true, "Got it" only closes; when false, it also calls onConfirm */
  isDisabled: boolean
}

export function SelectAllInfoModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isDisabled,
}: SelectAllInfoModalProps) {
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

  if (!isOpen) return null

  const handleGotIt = () => {
    if (dontShowAgain) {
      setTooltipModalSuppressed(SELECT_ALL_MODAL_STORAGE_KEY, true)
    }
    if (!isDisabled) {
      onConfirm()
    }
    onClose()
  }

  return (
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-all-info-title"
      aria-describedby="select-all-info-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="select-all-info-title">{title}</h3>
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
          <p id="select-all-info-message">{message}</p>
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
            onClick={handleGotIt}
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
