import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  isProviderPickerTutorialStep,
  tutorialStepFollowsComposer,
  type StarterModelEntry,
} from '../../data/tutorialStepPlan'
import type { TutorialStep } from '../../hooks/useTutorial'
import { isFollowUpComposerReady } from '../../utils/followUpComposerReady'
import {
  getTutorialScrollRoot,
  readTutorialSpotlightRect,
  scrollBackDirectionForTarget,
  scrollTutorialRectToCenter,
  type ScrollBackDirection,
} from '../../utils/tutorialPositioning'
import { trackTutorialMotion } from '../../utils/tutorialSettle'

import { TutorialBackdrop } from './TutorialBackdrop'
import { useTutorialInteractionLock } from './tutorialInteractionLock'
import { TutorialTooltip } from './TutorialTooltip'
import { useTutorialOverlay } from './useTutorialOverlay'
import './TutorialOverlay.css'
import './MobileTutorialOverlay.css'

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
    tutorialSplitModelSteps,
    followUpSubmitStarted
  )
  useTutorialInteractionLock(step != null)
  const [scrollBack, setScrollBack] = useState<ScrollBackDirection | null>(null)
  const scrollBackRef = useRef(scrollBack)
  scrollBackRef.current = scrollBack
  const providerKey = tutorialProviderNames.join('\0')
  // Last scroll offset while the spotlight still intersected the layout viewport.
  // Captured during settle too, so a scroll that finishes before the fade does
  // not become the baseline.
  const seatedScrollRef = useRef<{ step: TutorialStep; top: number } | null>(null)

  useEffect(() => {
    if (!step) {
      setScrollBack(null)
      return
    }
    const measure = () => {
      // Prompt, follow-up, and the provider steps (1–4). History and save keep
      // their Done button; replacing that card hid the control the tour clicks.
      const showsScrollBack =
        tutorialStepFollowsComposer(step) || isProviderPickerTutorialStep(step)
      if (!showsScrollBack) {
        if (scrollBackRef.current != null) setScrollBack(null)
        return
      }
      const scrollTop = getTutorialScrollRoot().getScrollTop()
      const target = readTutorialSpotlightRect(step, tutorialProviderNames)
      const targetOff = scrollBackDirectionForTarget(target, null, true)
      if (target && !targetOff) {
        seatedScrollRef.current = { step, top: scrollTop }
        if (scrollBackRef.current != null) setScrollBack(null)
        return
      }
      if (spotlightSettling || isLoadingStreamingPhase) {
        if (scrollBackRef.current != null) setScrollBack(null)
        return
      }
      const seated = seatedScrollRef.current
      const scrolledAway = seated?.step === step && Math.abs(scrollTop - seated.top) > 24
      // The fixed tooltip can stay on screen after the spotlight has left.
      // The hint is for that spotlight once a real scroll took it fully outside.
      const next = scrolledAway ? targetOff : null
      setScrollBack(prev => (prev === next ? prev : next))
    }
    measure()
    const stopMotion = trackTutorialMotion(measure)
    const interval = window.setInterval(measure, 150)
    return () => {
      stopMotion()
      window.clearInterval(interval)
    }
    // providerKey tracks the names without retriggering on a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, providerKey, spotlightSettling, isLoadingStreamingPhase])

  if (!step) {
    return null
  }

  const shouldHideTooltipDuringFollowUpStream =
    step === 'follow-up' && followUpSubmitStarted && streamAnswerStarted
  const followUpComposerPending = step === 'follow-up' && !isFollowUpComposerReady()
  // The processing panel keeps its own tooltip. The review step must too:
  // hiding on any streaming cutout left that card with a ring and no popover.
  const hideTooltipForStreamingCutout =
    isLoadingStreamingPhase &&
    !(isLoading && !streamAnswerStarted) &&
    step !== 'view-follow-up-results'

  const overlayUi = (
    <>
      <TutorialBackdrop
        step={step}
        suppressCutout={spotlightSettling && !isLoadingStreamingPhase}
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

      {scrollBack && !spotlightSettling && !isLoadingStreamingPhase && (
        <div
          className={`mobile-tutorial-scroll-indicator scroll-${scrollBack}`}
          onClick={() => {
            const target = readTutorialSpotlightRect(step, tutorialProviderNames)
            if (target) scrollTutorialRectToCenter(target)
          }}
        >
          <span className="mobile-tutorial-scroll-icon">{scrollBack === 'up' ? '↑' : '↓'}</span>
          <span>Scroll back to continue</span>
        </div>
      )}

      {!scrollBack &&
        !hideTooltipForStreamingCutout &&
        !shouldHideTooltipDuringFollowUpStream &&
        !followUpComposerPending &&
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
