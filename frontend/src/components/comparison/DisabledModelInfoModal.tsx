/**
 * Modal shown when a user clicks on a disabled/restricted AI model in the model selection area.
 * Explains options based on user tier (unregistered vs free) and model tier access.
 */

import React, { useCallback, useEffect, useRef } from 'react'
import './DisabledModelInfoModal.css'

export type DisabledModelModalInfo = {
  userTier: 'unregistered' | 'free'
  modelTierAccess: 'free' | 'paid'
  modelName?: string
}

interface DisabledModelInfoModalProps {
  isOpen: boolean
  info: DisabledModelModalInfo | null
  onClose: () => void
  onToggleHidePremiumModels: () => void
  onOpenSignUp: () => void
}

function getModalContent(
  userTier: 'unregistered' | 'free',
  modelTierAccess: 'free' | 'paid',
  modelName?: string
): { title: string; message: string; showSignUp: boolean; showUpgrade: boolean } {
  const modelLabel = modelName ? `"${modelName}"` : 'This model'

  if (userTier === 'unregistered') {
    if (modelTierAccess === 'free') {
      return {
        title: 'Model Requires Registration',
        message: `${modelLabel} is available with a free account. You can sign up to access it and other free-tier models, or use the "Hide premium models" button below to focus on models available without registration.`,
        showSignUp: true,
        showUpgrade: false,
      }
    }
    // modelTierAccess === 'paid'
    return {
      title: 'Premium Model',
      message: `${modelLabel} is a premium model. Sign up for a free account to unlock more models and get a 7-day trial of all premium models, or use the "Hide premium models" button below to focus on models available without registration.`,
      showSignUp: true,
      showUpgrade: false,
    }
  }

  // userTier === 'free'
  return {
    title: 'Premium Model',
    message: `${modelLabel} requires a paid subscription. You can use the "Hide premium models" button below to hide premium models from the list, or upgrade to a paid tier once paid tiers become available to access all models.`,
    showSignUp: false,
    showUpgrade: true,
  }
}

export const DisabledModelInfoModal: React.FC<
  Omit<DisabledModelInfoModalProps, 'info'> & { info: DisabledModelModalInfo | null }
> = ({ isOpen, info, onClose, onToggleHidePremiumModels, onOpenSignUp }) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const handleToggleAndClose = useCallback(() => {
    onToggleHidePremiumModels()
    onClose()
  }, [onToggleHidePremiumModels, onClose])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
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

  if (!isOpen || !info) return null

  const { title, message, showSignUp, showUpgrade } = getModalContent(
    info.userTier,
    info.modelTierAccess,
    info.modelName
  )

  return (
    <div
      className="disabled-model-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disabled-model-info-title"
      aria-describedby="disabled-model-info-message"
    >
      <div
        className="disabled-model-info-modal"
        onClick={e => e.stopPropagation()}
        ref={modalRef}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            onClose()
          }
        }}
      >
        <div className="disabled-model-info-header">
          <h3 id="disabled-model-info-title">{title}</h3>
          <button
            ref={closeButtonRef}
            className="disabled-model-info-close"
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
        <div className="disabled-model-info-content">
          <p id="disabled-model-info-message">{message}</p>
          <div className="disabled-model-info-button-demo">
            <div className="disabled-model-info-button-label-row">
              <p className="disabled-model-info-button-label">The "Hide premium models" button:</p>
              <button
                type="button"
                className="hide-premium-button-preview"
                aria-hidden="true"
                tabIndex={-1}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <path
                    d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <span className="disabled-model-info-button-hint">
              Located in the "Select Models to Compare" header
            </span>
          </div>
        </div>
        <div className="disabled-model-info-footer">
          <button
            className="disabled-model-info-button primary"
            onClick={handleToggleAndClose}
            type="button"
            autoFocus
          >
            Hide premium models
          </button>
          {showSignUp && (
            <button
              className="disabled-model-info-button secondary"
              onClick={() => {
                onOpenSignUp()
                onClose()
              }}
              type="button"
            >
              Sign up
            </button>
          )}
          {showUpgrade && (
            <button
              className="disabled-model-info-button secondary"
              onClick={onClose}
              type="button"
              title="Paid tiers are coming soon"
            >
              Upgrade (coming soon)
            </button>
          )}
          <button className="disabled-model-info-button tertiary" onClick={onClose} type="button">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
