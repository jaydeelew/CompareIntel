/**
 * Mobile sheet for model context / knowledge cutoff details (touch devices).
 * Reuses DisabledButtonInfoModal styling; portaled to document.body for correct fixed positioning.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import type { Model, ModelsByProvider } from '../../types'

import { ModelInfoPanelContent } from './ModelInfoPanelContent'
import './DisabledButtonInfoModal.css'

interface ModelDetailsInfoModalProps {
  isOpen: boolean
  onClose: () => void
  model: Model | null
  modelsByProvider: ModelsByProvider
}

export function ModelDetailsInfoModal({
  isOpen,
  onClose,
  model,
  modelsByProvider,
}: ModelDetailsInfoModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const isImageGen = !!model?.supports_image_generation

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

  if (!isOpen || !model || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-details-info-title"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="model-details-info-title">{model.name}</h3>
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
          <div
            className={`model-info-tooltip model-info-tooltip--static-panel ${isImageGen ? 'model-info-tooltip--image' : ''}`}
          >
            <ModelInfoPanelContent model={model} modelsByProvider={modelsByProvider} />
          </div>
        </div>
        <div className="disabled-button-info-learn-more">
          <Link to="/how-it-works#model-selection-indicators" onClick={() => onClose()}>
            Learn more about model name indicators
          </Link>
        </div>
        <div className="disabled-button-info-footer">
          <button className="disabled-button-info-button" onClick={onClose} type="button" autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
