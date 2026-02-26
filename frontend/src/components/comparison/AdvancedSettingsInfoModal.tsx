/**
 * Modal showing current advanced settings with brief explanations.
 * Shown when user taps the advanced-settings indicator icon on a model row (mobile).
 */

import { useEffect, useRef } from 'react'
import './DisabledButtonInfoModal.css'

interface AdvancedSettingsInfoModalProps {
  isOpen: boolean
  onClose: () => void
  temperature: number
  topP: number
  maxTokens: number | null
}

export function AdvancedSettingsInfoModal({
  isOpen,
  onClose,
  temperature,
  topP,
  maxTokens,
}: AdvancedSettingsInfoModalProps) {
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
      aria-labelledby="advanced-settings-info-title"
      aria-describedby="advanced-settings-info-content"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="advanced-settings-info-title">Advanced Settings</h3>
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
        <div id="advanced-settings-info-content" className="disabled-button-info-content">
          <p className="advanced-settings-info-intro">
            These settings apply to every model that supports them. Models that don't (e.g.
            reasoning models) will ignore them.
          </p>
          <dl className="advanced-settings-info-list">
            <div className="advanced-settings-info-row">
              <dt>Temperature</dt>
              <dd>{temperature.toFixed(1)}</dd>
            </div>
            <p className="advanced-settings-info-desc">
              Controls randomness. Lower values give focused, reproducible output. Higher values
              produce more varied, creative responses.
            </p>

            <div className="advanced-settings-info-row">
              <dt>Top P</dt>
              <dd>{topP.toFixed(2)}</dd>
            </div>
            <p className="advanced-settings-info-desc">
              Nucleus sampling. Limits token selection to the smallest set whose cumulative
              probability exceeds this value. 1.0 means no limit.
            </p>

            <div className="advanced-settings-info-row">
              <dt>Max output tokens</dt>
              <dd>{maxTokens ?? 'Auto'}</dd>
            </div>
            <p className="advanced-settings-info-desc">
              Maximum response length. "Auto" uses each model's built-in limit. Lower values produce
              shorter, more concise responses.
            </p>
          </dl>
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
