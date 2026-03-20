/**
 * Modal shown when user tries to mix text-only and image-generation models.
 * Text and image generation models cannot be selected together.
 */

import React, { useEffect, useRef } from 'react'

import { ImageGenerationPageLink } from './ImageGenerationPageLink'
import './DisabledModelInfoModal.css'

export type ModelTypeConflictType = 'text-to-image' | 'image-to-text'

interface ModelTypeConflictModalProps {
  isOpen: boolean
  conflictType: ModelTypeConflictType | null
  onClose: () => void
}

function getModalContent(conflictType: ModelTypeConflictType): {
  title: string
  message: string
} {
  if (conflictType === 'text-to-image') {
    return {
      title: 'Switch to Image Generation Models',
      message:
        'You have text-only models selected. To select image generation models, first deselect all text models. Then use the "Image generation models" toggle or choose from "Best for image generation" in Help me choose.',
    }
  }
  return {
    title: 'Switch to Text Models',
    message:
      'You have image generation models selected. To select text-only models, first deselect all image generation models. Then use the "Text models" toggle.',
  }
}

export const ModelTypeConflictModal: React.FC<ModelTypeConflictModalProps> = ({
  isOpen,
  conflictType,
  onClose,
}) => {
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

  if (!isOpen || !conflictType) return null

  const { title, message } = getModalContent(conflictType)

  return (
    <div
      className="disabled-model-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-type-conflict-title"
      aria-describedby="model-type-conflict-message"
    >
      <div
        className="disabled-model-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-model-info-header">
          <h3 id="model-type-conflict-title">{title}</h3>
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
          <p id="model-type-conflict-message">{message}</p>
          <ImageGenerationPageLink onNavigate={onClose} />
        </div>
        <div className="disabled-model-info-footer">
          <button
            className="disabled-model-info-button primary"
            onClick={onClose}
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
