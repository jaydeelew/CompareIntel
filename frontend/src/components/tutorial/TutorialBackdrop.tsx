import React from 'react'

import type { TutorialStep } from '../../hooks/useTutorial'

export interface RectCutout {
  top: number
  left: number
  width: number
  height: number
  borderRadius?: number
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
          borderRadius: `${loadingStreamingCutout.borderRadius ?? 16}px`,
          boxShadow: 'inset 0 0 0 8px var(--accent-color), 0 0 0 9999px rgba(0, 0, 0, 0.6)',
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
    const isDropdownTutorialStep = step === 'history-dropdown' || step === 'save-selection'
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
          boxShadow: isDropdownTutorialStep
            ? 'inset 0 0 0 8px var(--accent-color), 0 0 0 9999px rgba(0, 0, 0, 0.6)'
            : '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
      />
    )
  }

  // Step 5: two inset blue frames (results + follow-up composer) and dim elsewhere; same accent as other steps
  if (
    step === 'follow-up' &&
    targetCutout &&
    textareaCutoutToUse &&
    !shouldExcludeTextarea &&
    !shouldExcludeDropdown &&
    !useRoundedCutout
  ) {
    const docWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      window.innerWidth
    )
    const docHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight
    )
    const results = {
      top: targetCutout.top,
      left: targetCutout.left,
      width: targetCutout.width,
      height: targetCutout.height,
    }
    const composer = {
      top: textareaCutoutToUse.top,
      left: textareaCutoutToUse.left,
      width: textareaCutoutToUse.width,
      height: textareaCutoutToUse.height,
    }
    const brResults = targetCutout.borderRadius
    const brComposer = 32
    const maskId = 'tutorial-follow-up-dim-mask'
    return (
      <>
        <svg
          className="tutorial-backdrop-follow-up-dim"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${docWidth}px`,
            height: `${docHeight}px`,
            zIndex: 9998,
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <defs>
            <mask id={maskId}>
              <rect width={docWidth} height={docHeight} fill="white" />
              <rect
                x={results.left}
                y={results.top}
                width={results.width}
                height={results.height}
                rx={brResults}
                ry={brResults}
                fill="black"
              />
              <rect
                x={composer.left}
                y={composer.top}
                width={composer.width}
                height={composer.height}
                rx={brComposer}
                ry={brComposer}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width={docWidth}
            height={docHeight}
            fill="rgba(0, 0, 0, 0.6)"
            mask={`url(#${maskId})`}
          />
        </svg>
        <div
          className="tutorial-backdrop-cutout tutorial-backdrop-follow-up-results-ring"
          style={{
            position: 'absolute',
            top: `${results.top}px`,
            left: `${results.left}px`,
            width: `${results.width}px`,
            height: `${results.height}px`,
            borderRadius: `${brResults}px`,
            boxShadow: 'inset 0 0 0 8px var(--accent-color)',
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'transparent',
          }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
        />
        <div
          className="tutorial-backdrop-cutout tutorial-backdrop-follow-up-composer-ring"
          style={{
            position: 'absolute',
            top: `${composer.top}px`,
            left: `${composer.left}px`,
            width: `${composer.width}px`,
            height: `${composer.height}px`,
            borderRadius: `${brComposer}px`,
            boxShadow: 'inset 0 0 0 8px var(--accent-color)',
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'transparent',
          }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
        />
      </>
    )
  }

  if (targetCutout && !shouldExcludeTextarea && !shouldExcludeDropdown && !useRoundedCutout) {
    const usesInsetBlueRing =
      step === 'expand-provider' || step === 'select-models' || step === 'view-follow-up-results'
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
