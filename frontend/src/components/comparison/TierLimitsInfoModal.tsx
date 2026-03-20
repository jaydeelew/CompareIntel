/**
 * Modal shown when clicking the tier limits info icon in the models section header.
 * Lists all subscription tiers and their model comparison limits, with a link to the FAQ.
 */

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

import { MODEL_LIMITS } from '../../config/constants'

import './DisabledButtonInfoModal.css'

const TIER_LABELS: Record<keyof typeof MODEL_LIMITS, string> = {
  unregistered: 'Unregistered',
  free: 'Free',
  starter: 'Starter',
  starter_plus: 'Starter+',
  pro: 'Pro',
  pro_plus: 'Pro+',
}

function getTierListContent(): string {
  return Object.entries(MODEL_LIMITS)
    .map(([tier, limit]) => `${TIER_LABELS[tier as keyof typeof TIER_LABELS]}: ${limit} models`)
    .join('\n')
}

interface TierLimitsInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

export function TierLimitsInfoModal({ isOpen, onClose }: TierLimitsInfoModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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

  if (!isOpen) return null

  return (
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tier-limits-info-title"
      aria-describedby="tier-limits-info-content"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="tier-limits-info-title">Models per Comparison by Tier</h3>
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
        <div id="tier-limits-info-content" className="disabled-button-info-content">
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

export { getTierListContent }
