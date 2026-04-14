/**
 * Modal explaining the thinking-model indicator on mobile (tooltips are unreliable on touch).
 * Reuses disabled-button-info modal styling like WebSearchInfoModal.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import './DisabledButtonInfoModal.css'
import { setTooltipModalSuppressed } from './tooltipModalStorage'

interface ThinkingModelInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

const THINKING_MODEL_MESSAGE =
  'This is a thinking model: the provider may expose separable reasoning in a Reasoning section while the answer streams. That reasoning is not saved with your history. Responses may take longer and can use more credits than comparable chat models. Some models reason internally without exposing that text here.'
const THINKING_MODEL_MODAL_STORAGE_KEY = 'thinking-model'

export function ThinkingModelInfoModal({ isOpen, onClose }: ThinkingModelInfoModalProps) {
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

  const handleGotIt = () => {
    if (dontShowAgain) {
      setTooltipModalSuppressed(THINKING_MODEL_MODAL_STORAGE_KEY, true)
    }
    onClose()
  }

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="thinking-model-info-title"
      aria-describedby="thinking-model-info-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="thinking-model-info-title">Thinking model</h3>
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
          <p id="thinking-model-info-message">{THINKING_MODEL_MESSAGE}</p>
          <label className="action-tooltip-dont-show-again">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => setDontShowAgain(e.target.checked)}
            />
            <span>Do not show again</span>
          </label>
        </div>
        <div className="disabled-button-info-learn-more">
          <Link to="/how-it-works#model-selection-indicators" onClick={() => onClose()}>
            Learn more about model name indicators
          </Link>
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
    </div>,
    document.body
  )
}
