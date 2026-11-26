import React from 'react'

import type { StepConfig } from '../../data/tutorialSteps'
import type { TutorialStep } from '../../hooks/useTutorial'
import { scrollContentOffset } from '../../utils/tutorialPositioning'

const STEPS_WITH_DYNAMIC_POSITION: TutorialStep[] = [
  'expand-provider',
  'expand-starter-provider-2',
  'select-models',
  'select-starter-model-1',
  'select-starter-model-2',
  'enter-prompt',
  'follow-up',
  'enter-prompt-2',
  'view-follow-up-results',
  'history-dropdown',
  'save-selection',
]

export interface TutorialTooltipProps {
  step: TutorialStep
  config: StepConfig
  stepIndex: number
  totalSteps: number
  onComplete: () => void
  onSkip: () => void
  isStepCompleted: boolean
  saveSelectionDropdownOpened: boolean
  isHistoryDropdownOpened: boolean
  overlayRef: React.Ref<HTMLDivElement>
  overlayPosition: { top: number; left: number; anchorX?: number; anchorY?: number }
  effectivePosition: 'top' | 'bottom' | null
  /** The arrow would land on the processing panel, so the card floats. */
  hideArrow?: boolean
  positionStabilized: boolean
  /** True while the step scroll/viewport settle is in progress. The card fades in on opacity. */
  settling?: boolean
}

export const TutorialTooltip: React.FC<TutorialTooltipProps> = ({
  step,
  config,
  stepIndex,
  totalSteps,
  onComplete,
  onSkip,
  isStepCompleted,
  saveSelectionDropdownOpened,
  isHistoryDropdownOpened,
  overlayRef,
  overlayPosition,
  effectivePosition,
  hideArrow = false,
  positionStabilized,
  settling = false,
}) => {
  const positionClass =
    STEPS_WITH_DYNAMIC_POSITION.includes(step) && effectivePosition
      ? effectivePosition
      : config.position
  const placed = scrollContentOffset(overlayPosition)

  return (
    <div
      ref={overlayRef}
      className={`tutorial-tooltip tutorial-tooltip-${positionClass}${hideArrow ? ' tutorial-tooltip--unanchored' : ''}${settling ? ' tutorial-tooltip--settling' : ''}`}
      data-position-stabilized={positionStabilized ? 'true' : 'false'}
      data-scroll-anchor-y={overlayPosition.anchorY ?? 0}
      style={{
        position: 'absolute',
        top: `${placed.top}px`,
        left: `${placed.left}px`,
        zIndex: 10000,
      }}
    >
      <div className="tutorial-tooltip-content">
        <div className="tutorial-tooltip-header">
          <span className="tutorial-step-indicator">
            Step {stepIndex} of {totalSteps}
          </span>
          <button className="tutorial-close-button" onClick={onSkip} aria-label="Skip tutorial">
            ×
          </button>
        </div>
        <h3 className="tutorial-tooltip-title">{config.title}</h3>
        <p className="tutorial-tooltip-description">{config.description}</p>
        <div className="tutorial-tooltip-actions">
          {(step === 'enter-prompt' || step === 'enter-prompt-2') && (
            <button
              className="tutorial-button tutorial-button-primary"
              onClick={onComplete}
              disabled={!isStepCompleted}
              title={!isStepCompleted ? 'Enter at least 1 character to continue' : undefined}
            >
              Done with input
            </button>
          )}
          {step === 'view-follow-up-results' && (
            <button
              className="tutorial-button tutorial-button-primary tutorial-button-highlight"
              onClick={e => {
                e.stopPropagation()
                e.preventDefault()
                onComplete()
              }}
            >
              Done
            </button>
          )}
          {step === 'history-dropdown' && (
            <button
              className="tutorial-button tutorial-button-primary tutorial-button-highlight"
              onClick={e => {
                e.stopPropagation()
                e.preventDefault()
                onComplete()
              }}
              disabled={!isHistoryDropdownOpened}
              title={
                !isHistoryDropdownOpened
                  ? 'Open the history dropdown to continue'
                  : 'Continue to next step'
              }
            >
              Done
            </button>
          )}
          {step === 'save-selection' && (
            <button
              className="tutorial-button tutorial-button-primary tutorial-button-highlight"
              onClick={e => {
                e.stopPropagation()
                e.preventDefault()
                if (saveSelectionDropdownOpened) {
                  onComplete()
                }
              }}
              disabled={!saveSelectionDropdownOpened}
              title={
                !saveSelectionDropdownOpened
                  ? 'Click "Save or load model selections" to expand the dropdown first'
                  : 'Complete the tutorial'
              }
            >
              Done
            </button>
          )}
        </div>
      </div>
      {!hideArrow && <div className={`tutorial-arrow tutorial-arrow-${positionClass}`} />}
    </div>
  )
}
