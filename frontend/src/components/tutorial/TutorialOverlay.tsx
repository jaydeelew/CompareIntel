import React from 'react'
import { createPortal } from 'react-dom'

import type { TutorialStep } from '../../hooks/useTutorial'

import { TutorialBackdrop } from './TutorialBackdrop'
import { TutorialTooltip } from './TutorialTooltip'
import { useTutorialOverlay } from './useTutorialOverlay'
import './TutorialOverlay.css'

interface TutorialOverlayProps {
  step: TutorialStep | null
  onComplete: () => void
  onSkip: () => void
  isStepCompleted?: boolean
  isLoading?: boolean
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  step,
  onComplete,
  onSkip,
  isStepCompleted = false,
  isLoading = false,
}) => {
  const {
    overlayRef,
    dropdownWasOpenedRef,
    saveSelectionDropdownOpened,
    overlayPosition,
    isVisible,
    portalRoot,
    effectivePosition,
    positionStabilized,
    dropdownCutout,
    buttonCutout,
    loadingStreamingCutout,
    targetCutout,
    isLoadingStreamingPhase,
    config,
    stepIndex,
    totalSteps,
    shouldExcludeTextarea,
    shouldExcludeDropdown,
    useRoundedCutout,
    textareaCutoutToUse,
    shouldBlock,
  } = useTutorialOverlay(step, isLoading ?? false)

  if (!step) {
    return null
  }

  if (!isLoadingStreamingPhase && shouldBlock) {
    return null
  }

  const overlayUi = (
    <>
      <TutorialBackdrop
        isLoadingStreamingPhase={isLoadingStreamingPhase}
        loadingStreamingCutout={loadingStreamingCutout}
        useRoundedCutout={useRoundedCutout}
        textareaCutoutToUse={textareaCutoutToUse}
        shouldExcludeTextarea={shouldExcludeTextarea}
        shouldExcludeDropdown={shouldExcludeDropdown}
        dropdownCutout={dropdownCutout}
        targetCutout={targetCutout}
        buttonCutout={buttonCutout}
      />

      {!isLoadingStreamingPhase && isVisible && config && (
        <TutorialTooltip
          step={step}
          config={config}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          onComplete={onComplete}
          onSkip={onSkip}
          isStepCompleted={isStepCompleted}
          saveSelectionDropdownOpened={saveSelectionDropdownOpened}
          isHistoryDropdownOpened={dropdownWasOpenedRef.current}
          overlayRef={overlayRef}
          overlayPosition={overlayPosition}
          effectivePosition={effectivePosition}
          positionStabilized={positionStabilized}
        />
      )}
    </>
  )

  return portalRoot ? createPortal(overlayUi, portalRoot) : overlayUi
}

export default TutorialOverlay
