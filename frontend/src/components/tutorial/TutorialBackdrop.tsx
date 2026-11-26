import React from 'react'

import { isProviderPickerTutorialStep } from '../../data/tutorialStepPlan'
import type { TutorialStep } from '../../hooks/useTutorial'
import { scrollContentOffset } from '../../utils/tutorialPositioning'

export interface RectCutout {
  top: number
  left: number
  width: number
  height: number
  borderRadius?: number
  anchorX?: number
  anchorY?: number
}

export interface RectCutoutWithRadius extends RectCutout {
  borderRadius: number
}

export interface ButtonCutout {
  top: number
  left: number
  radius: number
  anchorX?: number
  anchorY?: number
}

export interface TutorialBackdropProps {
  step: TutorialStep | null
  /** Full dim only — the framed hole is measured after scroll settles, then faded in. */
  suppressCutout?: boolean
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

const TUTORIAL_FRAME_SHADOW =
  'inset 0 0 0 3px var(--accent-color), inset 0 0 0 7px rgba(14, 165, 233, 0.22), 0 0 24px rgba(14, 165, 233, 0.45)'
const TUTORIAL_DIM_SHADOW = '0 0 0 9999px rgba(0, 0, 0, 0.6)'
const TUTORIAL_FRAMED_DIM_SHADOW = `${TUTORIAL_FRAME_SHADOW}, ${TUTORIAL_DIM_SHADOW}`

/** Content coordinates inside the `.app` scroll layer. Fixed would trail the scroll. */
const CUTOUT_POSITION: React.CSSProperties['position'] = 'absolute'

function placeCutout(box: { top: number; left: number; anchorX?: number; anchorY?: number }): {
  top: string
  left: string
} {
  const pos = scrollContentOffset(box)
  return { top: `${pos.top}px`, left: `${pos.left}px` }
}

export function TutorialFollowUpDim({
  maskId,
  holes,
  color,
}: {
  maskId: string
  holes: Array<{ top: number; left: number; width: number; height: number; rx: number }>
  color: string
}) {
  // A 0×0 SVG with overflow visible paints in user units without growing
  // scrollHeight. The holes are in scroll-content coordinates, so they move
  // with the page.
  return (
    <svg
      className="tutorial-scroll-dim"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        overflow: 'visible',
        zIndex: 9998,
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      <defs>
        <mask id={maskId}>
          <rect x={0} y={0} width={8000} height={20000} fill="white" />
          {holes.map(hole => (
            <rect
              key={`${hole.left}:${hole.top}`}
              x={hole.left}
              y={hole.top}
              width={hole.width}
              height={hole.height}
              rx={hole.rx}
              ry={hole.rx}
              fill="black"
            />
          ))}
        </mask>
      </defs>
      <rect x={0} y={0} width={8000} height={20000} fill={color} mask={`url(#${maskId})`} />
    </svg>
  )
}

function handleBackdropClick(e: React.MouseEvent, className: string) {
  const target = e.target as HTMLElement
  if (target.classList.contains(className)) {
    e.stopPropagation()
  }
}

export const TutorialBackdrop: React.FC<TutorialBackdropProps> = ({
  step,
  suppressCutout = false,
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
  if (suppressCutout) {
    return <div className="tutorial-backdrop" />
  }

  if (isLoadingStreamingPhase && loadingStreamingCutout) {
    return (
      <div
        className="tutorial-backdrop-cutout tutorial-backdrop-cutout--enter"
        data-scroll-anchor-y={loadingStreamingCutout.anchorY ?? 0}
        style={{
          position: CUTOUT_POSITION,
          ...placeCutout(loadingStreamingCutout),
          width: `${loadingStreamingCutout.width}px`,
          height: `${loadingStreamingCutout.height}px`,
          borderRadius: `${loadingStreamingCutout.borderRadius ?? 16}px`,
          boxShadow: TUTORIAL_FRAMED_DIM_SHADOW,
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
        className="tutorial-backdrop-cutout tutorial-backdrop-cutout--enter"
        data-scroll-anchor-y={textareaCutoutToUse.anchorY ?? 0}
        style={{
          position: CUTOUT_POSITION,
          ...placeCutout(textareaCutoutToUse),
          width: `${textareaCutoutToUse.width}px`,
          height: `${textareaCutoutToUse.height}px`,
          borderRadius: '32px',
          boxShadow: TUTORIAL_FRAMED_DIM_SHADOW,
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
      />
    )
  }

  if (shouldExcludeTextarea && textareaCutoutToUse) {
    const vTop = textareaCutoutToUse.top
    const vLeft = textareaCutoutToUse.left
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
        className="tutorial-backdrop-cutout tutorial-backdrop-cutout--enter"
        data-scroll-anchor-y={dropdownCutout.anchorY ?? 0}
        style={{
          position: CUTOUT_POSITION,
          ...placeCutout(dropdownCutout),
          width: `${dropdownCutout.width}px`,
          height: `${dropdownCutout.height}px`,
          borderRadius: '32px',
          boxShadow: isDropdownTutorialStep ? TUTORIAL_FRAMED_DIM_SHADOW : TUTORIAL_DIM_SHADOW,
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
      />
    )
  }

  // Steps 7 and 8: two inset blue frames (results + composer) and dim elsewhere.
  // The card anchors on the composer, so that composer has to be a real hole.
  const composerAnchoredStep = step === 'follow-up' || step === 'view-follow-up-results'
  if (
    composerAnchoredStep &&
    targetCutout &&
    textareaCutoutToUse &&
    !shouldExcludeTextarea &&
    !shouldExcludeDropdown &&
    !useRoundedCutout
  ) {
    const resultsPos = scrollContentOffset(targetCutout)
    const composerPos = scrollContentOffset(textareaCutoutToUse)
    const results = {
      top: resultsPos.top,
      left: resultsPos.left,
      width: targetCutout.width,
      height: targetCutout.height,
    }
    const composer = {
      top: composerPos.top,
      left: composerPos.left,
      width: textareaCutoutToUse.width,
      height: textareaCutoutToUse.height,
    }
    const brResults = targetCutout.borderRadius
    const brComposer = 32
    return (
      <>
        <TutorialFollowUpDim
          maskId="tutorial-follow-up-dim-mask"
          color="rgba(0, 0, 0, 0.6)"
          holes={[
            { ...results, rx: brResults },
            { ...composer, rx: brComposer },
          ]}
        />
        <div
          className="tutorial-backdrop-cutout tutorial-backdrop-cutout--enter tutorial-backdrop-follow-up-results-ring"
          data-scroll-anchor-y={targetCutout.anchorY ?? 0}
          style={{
            position: CUTOUT_POSITION,
            top: `${results.top}px`,
            left: `${results.left}px`,
            width: `${results.width}px`,
            height: `${results.height}px`,
            borderRadius: `${brResults}px`,
            boxShadow: TUTORIAL_FRAME_SHADOW,
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'transparent',
          }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
        />
        <div
          className="tutorial-backdrop-cutout tutorial-backdrop-cutout--enter tutorial-backdrop-follow-up-composer-ring"
          data-scroll-anchor-y={textareaCutoutToUse.anchorY ?? 0}
          style={{
            position: CUTOUT_POSITION,
            top: `${composer.top}px`,
            left: `${composer.left}px`,
            width: `${composer.width}px`,
            height: `${composer.height}px`,
            borderRadius: `${brComposer}px`,
            boxShadow: TUTORIAL_FRAME_SHADOW,
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'transparent',
          }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
        />
      </>
    )
  }

  if (
    targetCutout &&
    !shouldExcludeTextarea &&
    !shouldExcludeDropdown &&
    !useRoundedCutout &&
    step !== 'follow-up' &&
    step !== 'view-follow-up-results'
  ) {
    const usesInsetBlueRing = isProviderPickerTutorialStep(step)
    return (
      <div
        className="tutorial-backdrop-cutout tutorial-backdrop-cutout--enter"
        data-scroll-anchor-y={targetCutout.anchorY ?? 0}
        style={{
          position: CUTOUT_POSITION,
          ...placeCutout(targetCutout),
          width: `${targetCutout.width}px`,
          height: `${targetCutout.height}px`,
          borderRadius: `${targetCutout.borderRadius}px`,
          /* Solid blue in the padded gap — matches provider steps (hero) on results-section steps. */
          boxShadow: usesInsetBlueRing ? TUTORIAL_FRAMED_DIM_SHADOW : TUTORIAL_DIM_SHADOW,
          zIndex: 9998,
          pointerEvents: 'none',
        }}
        onClick={e => handleBackdropClick(e, 'tutorial-backdrop-cutout')}
      />
    )
  }

  // Steps 7 and 8 require the dual-hole SVG backdrop (results + composer). While
  // those cutouts are being computed, render nothing rather than a results-only
  // hole that leaves the composer under the dim.
  if (step === 'follow-up' || step === 'view-follow-up-results') {
    return null
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
