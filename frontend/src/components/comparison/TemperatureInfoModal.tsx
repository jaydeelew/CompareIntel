/**
 * Modal to explain the temperature setting on mobile.
 * Reuses DisabledButtonInfoModal styling for consistency.
 */

import { useEffect, useRef } from 'react'
import './DisabledButtonInfoModal.css'

interface TemperatureInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

const TEMPERATURE_MESSAGE =
  "Temperature controls how random or creative the AI's responses are. Lower values (e.g., 0) make responses more focused and deterministic—best for code, math, and factual questions. Higher values (e.g., 1–2) produce more varied and creative outputs—useful for brainstorming or creative writing."

export function TemperatureInfoModal({ isOpen, onClose }: TemperatureInfoModalProps) {
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
      aria-labelledby="temperature-info-title"
      aria-describedby="temperature-info-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="temperature-info-title">Temperature</h3>
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
          <p id="temperature-info-message">{TEMPERATURE_MESSAGE}</p>
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
