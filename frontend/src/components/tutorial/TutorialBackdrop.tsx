import React from 'react'

import type { TutorialStep } from '../../hooks/useTutorial'

export interface RectCutout {
  top: number
  left: number
  width: number
  height: number
}

export interface RectCutoutWithRadius extends RectCutout {
  borderRadius: number
}

export interface ButtonCutout {
  top: number
  left: number
  radius: number
}

export interface TutorialBackdropProps {
  step: TutorialStep | null
  isLoadingStreamingPhase: boolean
  loadingStreamingCutout: RectCutout | null
  useRoundedCutout: boolean
  textareaCutoutToUse: RectCutout | null
  shouldExcludeTextarea: boolean
  shouldExcludeDropdown: boolean
  dropdownCutout: RectCutout | null
  targetCutout: RectCutoutWithRadius | null
  buttonCutout: ButtonCutout | null
}

function handleBackdropClick(e: React.MouseEvent, className: string) {
  const target = e.target as HTMLElement
  if (target.classList.contains(className)) {
    e.stopPropagation()
  }
}

export const TutorialBackdrop: React.FC<TutorialBackdropProps> = ({
  step,
  isLoadingStreamingPhase,
  loadingStreamingCutout,
  useRoundedCutout,
  textareaCutoutToUse,
  shouldExcludeTextarea,
  shouldExcludeDropdown,
  dropdownCutout,
  targetCutout,
  buttonCutout,
}) => {
  if (isLoadingStreamingPhase && loadingStreamingCutout) {
    return (
      <div
        className="tutorial-backdrop-cutout"
        style={{
          position: 'absolute',
          top: `${loadingStreamingCutout.top}px`,
          left: `${loadingStreamingCutout.left}px`,
          width: `${loadingStreamingCutout.width}px`,
          height: `${loadingStreamingCutout.height}px`,
          borderRadius: '16px',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
      />
    )
  }

  if (useRoundedCutout && textareaCutoutToUse) {
    return (
      <div
        className="tutorial-backdrop-cutout"
        style={{
          position: 'absolute',
          top: `${textareaCutoutToUse.top}px`,
          left: `${textareaCutoutToUse.left}px`,
          width: `${textareaCutoutToUse.width}px`,
          height: `${textareaCutoutToUse.height}px`,
          borderRadius: '32px',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
      />
    )
  }

  if (shouldExcludeTextarea && textareaCutoutToUse) {
    // Convert document-relative cutout back to viewport-relative for fixed-position split backdrop
    const vTop = textareaCutoutToUse.top - window.scrollY
    const vLeft = textareaCutoutToUse.left - window.scrollX
    return (
      <>
        <div
          className="tutorial-backdrop tutorial-backdrop-top"
          style={{ height: `${vTop}px` }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop')}
        />
        <div
          className="tutorial-backdrop tutorial-backdrop-bottom"
          style={{ top: `${vTop + textareaCutoutToUse.height}px` }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop')}
        />
        <div
          className="tutorial-backdrop tutorial-backdrop-left"
          style={{
            top: `${vTop}px`,
            left: '0',
            width: `${vLeft}px`,
            height: `${textareaCutoutToUse.height}px`,
          }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop')}
        />
        <div
          className="tutorial-backdrop tutorial-backdrop-right"
          style={{
            top: `${vTop}px`,
            left: `${vLeft + textareaCutoutToUse.width}px`,
            height: `${textareaCutoutToUse.height}px`,
          }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop')}
        />
      </>
    )
  }

  if (shouldExcludeDropdown && dropdownCutout) {
    return (
      <div
        className="tutorial-backdrop-cutout"
        style={{
          position: 'absolute',
          top: `${dropdownCutout.top}px`,
          left: `${dropdownCutout.left}px`,
          width: `${dropdownCutout.width}px`,
          height: `${dropdownCutout.height}px`,
          borderRadius: '32px',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
      />
    )
  }

  if (targetCutout && !shouldExcludeTextarea && !shouldExcludeDropdown && !useRoundedCutout) {
    const usesInsetBlueRing =
      step === 'expand-provider' ||
      step === 'select-models' ||
      step === 'follow-up' ||
      step === 'view-follow-up-results'
    return (
      <div
        className="tutorial-backdrop-cutout"
        style={{
          position: 'absolute',
          top: `${targetCutout.top}px`,
          left: `${targetCutout.left}px`,
          width: `${targetCutout.width}px`,
          height: `${targetCutout.height}px`,
          borderRadius: `${targetCutout.borderRadius}px`,
          /* Solid blue in the padded gap — matches provider steps (hero) on results-section steps. */
          boxShadow: usesInsetBlueRing
            ? 'inset 0 0 0 8px var(--accent-color), 0 0 0 9999px rgba(0, 0, 0, 0.6)'
            : '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
      />
    )
  }

  return (
    <div
      className="tutorial-backdrop"
      style={
        buttonCutout
          ? {
              maskImage: `radial-gradient(circle ${buttonCutout.radius + 1}px at ${buttonCutout.left}px ${buttonCutout.top}px, transparent ${buttonCutout.radius}px, black ${buttonCutout.radius + 1}px)`,
              WebkitMaskImage: `radial-gradient(circle ${buttonCutout.radius + 1}px at ${buttonCutout.left}px ${buttonCutout.top}px, transparent ${buttonCutout.radius}px, black ${buttonCutout.radius + 1}px)`,
            }
          : undefined
      }
      onClick={e => handleBackdropClick(e, 'tutorial-backdrop')}
    />
  )
}
