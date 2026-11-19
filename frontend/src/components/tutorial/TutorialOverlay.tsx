import React from 'react'
import { createPortal } from 'react-dom'

import type { StarterModelEntry } from '../../data/tutorialStepPlan'
import type { TutorialStep } from '../../hooks/useTutorial'

import { TutorialBackdrop } from './TutorialBackdrop'
import { TutorialTooltip } from './TutorialTooltip'
import { useTutorialOverlay } from './useTutorialOverlay'
import './TutorialOverlay.css'

interface TutorialOverlayProps {
  step: TutorialStep | null
  tutorialProviderNames: readonly string[]
  tutorialVisibleStepOrder: readonly TutorialStep[]
  tutorialStarterEntries: readonly StarterModelEntry[]
  tutorialSplitModelSteps: boolean
  onComplete: () => void
  onSkip: () => void
  isStepCompleted?: boolean
  isLoading?: boolean
  /** When any model has started streaming an answer; used to switch loading cutout to results. */
  streamAnswerStarted?: boolean
  /** Set once the user has submitted a follow-up on step 5. */
  followUpSubmitStarted?: boolean
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  step,
  tutorialProviderNames,
  tutorialVisibleStepOrder,
  tutorialStarterEntries,
  tutorialSplitModelSteps,
  onComplete,
  onSkip,
  isStepCompleted = false,
  isLoading = false,
  streamAnswerStarted = false,
  followUpSubmitStarted = false,
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
    spotlightSettling,
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
    shouldHideTooltip,
  } = useTutorialOverlay(
    step,
    isLoading ?? false,
    streamAnswerStarted,
    tutorialProviderNames,
    tutorialVisibleStepOrder,
    tutorialStarterEntries,
    tutorialSplitModelSteps
  )

  if (!step) {
    return null
  }

  const shouldHideTooltipDuringFollowUpStream =
    step === 'follow-up' && followUpSubmitStarted && (isLoading || streamAnswerStarted)

  const overlayUi = (
    <>
      <TutorialBackdrop
        step={step}
        suppressCutout={spotlightSettling}
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

      {!isLoadingStreamingPhase &&
        !shouldHideTooltipDuringFollowUpStream &&
        !shouldHideTooltip &&
        isVisible &&
        config && (
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
            settling={spotlightSettling}
          />
        )}
    </>
  )

  return portalRoot ? createPortal(overlayUi, portalRoot) : overlayUi
}

export default TutorialOverlay
