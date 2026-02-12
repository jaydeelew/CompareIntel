import React from 'react'

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
          position: 'fixed',
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
          position: 'fixed',
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
    return (
      <>
        <div
          className="tutorial-backdrop tutorial-backdrop-top"
          style={{ height: `${textareaCutoutToUse.top}px` }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop')}
        />
        <div
          className="tutorial-backdrop tutorial-backdrop-bottom"
          style={{ top: `${textareaCutoutToUse.top + textareaCutoutToUse.height}px` }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop')}
        />
        <div
          className="tutorial-backdrop tutorial-backdrop-left"
          style={{
            top: `${textareaCutoutToUse.top}px`,
            left: '0',
            width: `${textareaCutoutToUse.left}px`,
            height: `${textareaCutoutToUse.height}px`,
          }}
          onClick={e => handleBackdropClick(e, 'tutorial-backdrop')}
        />
        <div
          className="tutorial-backdrop tutorial-backdrop-right"
          style={{
            top: `${textareaCutoutToUse.top}px`,
            left: `${textareaCutoutToUse.left + textareaCutoutToUse.width}px`,
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
          position: 'fixed',
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

  if (targetCutout) {
    return (
      <div
        className="tutorial-backdrop-cutout"
        style={{
          position: 'fixed',
          top: `${targetCutout.top}px`,
          left: `${targetCutout.left}px`,
          width: `${targetCutout.width}px`,
          height: `${targetCutout.height}px`,
          borderRadius: `${targetCutout.borderRadius}px`,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
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
