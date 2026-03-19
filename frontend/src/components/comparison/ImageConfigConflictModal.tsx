/**
 * Modal shown when aspect ratio or image size is incompatible with selected model(s).
 * Blocks the change until user fixes the conflict.
 */

import React, { useEffect, useRef } from 'react'

import type { ModelsByProvider } from '../../types'
import { getModelNames } from '../../utils/visionModels'
import './DisabledModelInfoModal.css'

export type ImageConfigConflictType =
  | 'advanced-setting-change'
  | 'model-add'
  | 'no-common-config'
  | 'auto-adjusted'

export type ImageConfigSettingKind = 'aspect_ratio' | 'image_size'

interface ImageConfigConflictModalProps {
  isOpen: boolean
  conflictType: ImageConfigConflictType | null
  /** For advanced-setting-change: which setting caused the conflict */
  settingKind?: ImageConfigSettingKind
  incompatibleModelIds: string[]
  aspectRatio: string
  imageSize: string
  /** After auto-adjusted: values before resolution/clamp */
  previousAspectRatio?: string
  previousImageSize?: string
  /** Full image-model selection (e.g. for auto-adjusted overview) */
  allImageModelIds?: string[]
  modelsByProvider: ModelsByProvider
  onClose: () => void
}

function getModalContent(
  conflictType: ImageConfigConflictType,
  settingKind: ImageConfigSettingKind | undefined,
  incompatibleModelIds: string[],
  modelNames: string[],
  aspectRatio: string,
  imageSize: string,
  previousAspectRatio?: string,
  previousImageSize?: string,
  fullSelectionNamesJoined?: string,
  /** When exactly 1, auto-adjusted copy uses singular phrasing */
  selectedImageModelCount?: number
): { title: string; message: string } {
  const names = modelNames.join(', ')
  if (conflictType === 'no-common-config') {
    const body =
      names.length > 0
        ? `There is no aspect ratio and image size combination that all of these models can use at the same time: ${names}. Try removing one model from the comparison, or swap in models whose supported shapes and resolutions overlap.`
        : 'There is no aspect ratio and image size that all of your selected image models can use at the same time. Try removing or replacing models until their supported options overlap.'
    return {
      title: 'No shared image options',
      message: `${body} Aspect ratio and image size in Advanced stay disabled until every selected model shares at least one valid combination.`,
    }
  }
  if (conflictType === 'auto-adjusted') {
    const prev =
      previousAspectRatio !== undefined && previousImageSize !== undefined
        ? `${previousAspectRatio} @ ${previousImageSize}`
        : 'your previous settings'
    const single = selectedImageModelCount === 1
    const selectionSummary =
      fullSelectionNamesJoined && fullSelectionNamesJoined.length > 0
        ? fullSelectionNamesJoined
        : names
    const intro =
      selectionSummary.length > 0
        ? single
          ? `Your image model: ${selectionSummary}. `
          : `Your image models: ${selectionSummary}. `
        : ''
    const message = single
      ? `${intro}We updated Advanced settings from ${prev} to ${aspectRatio} @ ${imageSize}—this model cannot use the previous combination. If you want other aspect ratios or resolutions, switch to a different model, or keep this configuration.`
      : `${intro}We updated Advanced settings from ${prev} to ${aspectRatio} @ ${imageSize} so every selected model can generate together. These models did not support the previous combination: ${names}. You can deselect a model to widen the available options for the rest, or keep this configuration.`
    return {
      title: 'Image settings updated for your selection',
      message,
    }
  }
  if (conflictType === 'advanced-setting-change') {
    const setting =
      settingKind === 'image_size' ? `resolution (${imageSize})` : `aspect ratio (${aspectRatio})`
    return {
      title: 'Incompatible image settings',
      message: `The selected ${setting} is not supported by: ${names}. Either change the Advanced settings or deselect these models.`,
    }
  }
  return {
    title: 'Model incompatible with settings',
    message: `${names} ${incompatibleModelIds.length === 1 ? 'does not' : 'do not'} support the current aspect ratio (${aspectRatio}) or resolution (${imageSize}). Either change the Advanced settings or choose a different model.`,
  }
}

export const ImageConfigConflictModal: React.FC<ImageConfigConflictModalProps> = ({
  isOpen,
  conflictType,
  settingKind,
  incompatibleModelIds,
  aspectRatio,
  imageSize,
  previousAspectRatio,
  previousImageSize,
  allImageModelIds,
  modelsByProvider,
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
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen || !conflictType) return null

  const modelNames = getModelNames(incompatibleModelIds, modelsByProvider)
  const fullSelectionNamesJoined =
    allImageModelIds && allImageModelIds.length > 0
      ? getModelNames(allImageModelIds, modelsByProvider).join(', ')
      : ''
  const { title, message } = getModalContent(
    conflictType,
    settingKind,
    incompatibleModelIds,
    modelNames,
    aspectRatio,
    imageSize,
    previousAspectRatio,
    previousImageSize,
    fullSelectionNamesJoined,
    allImageModelIds?.length
  )

  return (
    <div
      className="disabled-model-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-config-conflict-title"
    >
      <div
        className="disabled-model-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-model-info-header">
          <h3 id="image-config-conflict-title">{title}</h3>
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
          <p>{message}</p>
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
