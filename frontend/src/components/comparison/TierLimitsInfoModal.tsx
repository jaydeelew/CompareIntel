/**
 * Modal shown when clicking the tier limits info icon in the models section header,
 * or the "X of Y selected" count. Lists tier model comparison limits, with a link to the FAQ.
 * When opened from the selection count, offers "Do not show again" (localStorage) for that entry point only.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import { MODEL_LIMITS } from '../../config/constants'

import { TIER_LABELS } from './tierLimitsListContent'

import './DisabledButtonInfoModal.css'

/** Suppress opening this modal from the models header "X of Y selected" control only; the (i) icon still opens. */
export const MODELS_COUNT_TIER_LIMITS_MODAL_STORAGE_KEY =
  'compareintel_models_count_tier_limits_dismissed'

interface TierLimitsInfoModalProps {
  isOpen: boolean
  onClose: () => void
  /** Opened from the selection counter — show explainer + optional "do not show again" for that click target */
  fromSelectionCount?: boolean
  selectedCount?: number
  maxModelsLimit?: number
}

export function TierLimitsInfoModal({
  isOpen,
  onClose,
  fromSelectionCount = false,
  selectedCount = 0,
  maxModelsLimit = 0,
}: TierLimitsInfoModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setDontShowAgain(false)
    }
  }, [isOpen, fromSelectionCount])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    closeButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
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
    if (fromSelectionCount && dontShowAgain) {
      localStorage.setItem(MODELS_COUNT_TIER_LIMITS_MODAL_STORAGE_KEY, 'true')
    }
    onClose()
  }

  if (!isOpen) return null

  const titleId = 'tier-limits-info-title'
  const contentId = 'tier-limits-info-content'

  return createPortal(
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={contentId}
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id={titleId}>
            {fromSelectionCount ? 'Your plan limits comparisons' : 'Models per Comparison by Tier'}
          </h3>
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
        <div id={contentId} className="disabled-button-info-content">
          {fromSelectionCount && maxModelsLimit > 0 ? (
            <p style={{ margin: '0 0 1rem 0' }}>
              Your account tier caps how many models you can include in one comparison. You are
              using <strong>{selectedCount}</strong> of <strong>{maxModelsLimit}</strong> allowed
              for your current plan. Upgrading unlocks higher limits so you can compare more models
              in a single run.
            </p>
          ) : null}
          <ul style={{ margin: '0 0 1rem 0', paddingLeft: '1.25rem' }}>
            {Object.entries(MODEL_LIMITS).map(([tier, limit]) => (
              <li key={tier} style={{ marginBottom: '0.25rem' }}>
                <strong>{TIER_LABELS[tier as keyof typeof TIER_LABELS]}:</strong> up to {limit}{' '}
                models per comparison
              </li>
            ))}
          </ul>
          <p className="param-info-methodology-link" style={{ marginBottom: 0 }}>
            <Link to="/faq#models-per-comparison" onClick={onClose}>
              Learn more about tier benefits
            </Link>
          </p>
          {fromSelectionCount ? (
            <label className="action-tooltip-dont-show-again">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={e => setDontShowAgain(e.target.checked)}
              />
              <span>Do not show again</span>
            </label>
          ) : null}
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
