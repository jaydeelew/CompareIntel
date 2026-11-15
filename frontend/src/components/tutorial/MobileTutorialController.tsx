import React, { useEffect, useRef, useState } from 'react'

import type { StarterModelEntry } from '../../data/tutorialStepPlan'
import type { TutorialStep, TutorialState } from '../../hooks/useTutorial'

import MobileTutorialOverlay from './MobileTutorialOverlay'

interface MobileTutorialControllerProps {
  tutorialState: TutorialState
  completeStep: (step: TutorialStep) => void
  skipTutorial: () => void
  tutorialProviderExpanded?: boolean
  firstModelSelected?: boolean
  secondModelSelected?: boolean
  bothModelsSelected?: boolean
  hasPromptText?: boolean
  hasCompletedComparison?: boolean
  isFollowUpMode?: boolean
  hasBreakoutConversation?: boolean
  showHistoryDropdown?: boolean
  hasSavedSelection?: boolean
  isLoading?: boolean
  streamAnswerStarted?: boolean
  followUpSubmitStarted?: boolean
  tutorialProviderNames?: readonly string[]
  tutorialVisibleStepOrder?: readonly TutorialStep[]
  tutorialStarterEntries?: readonly StarterModelEntry[]
  tutorialSplitModelSteps?: boolean
  onProviderExpanded?: () => void
  onModelsSelected?: () => void
  onPromptEntered?: () => void
  onComparisonComplete?: () => void
  onFollowUpActivated?: () => void
  onBreakoutCreated?: () => void
  onHistoryOpened?: () => void
  onSelectionSaved?: () => void
}

export const MobileTutorialController: React.FC<MobileTutorialControllerProps> = ({
  tutorialState,
  completeStep,
  skipTutorial,
  tutorialProviderExpanded,
  firstModelSelected,
  secondModelSelected,
  bothModelsSelected,
  hasPromptText,
  hasCompletedComparison,
  isFollowUpMode,
  showHistoryDropdown,
  isLoading,
  streamAnswerStarted,
  followUpSubmitStarted = false,
  tutorialProviderNames = [],
  tutorialVisibleStepOrder = [],
  tutorialStarterEntries = [],
  tutorialSplitModelSteps = false,
  onProviderExpanded,
  onModelsSelected,
  onComparisonComplete,
  onFollowUpActivated,
}) => {
  const [tutorialSessionKey, setTutorialSessionKey] = useState(0)
  const previousStepRef = useRef<TutorialStep | null>(null)

  useEffect(() => {
    const currentStep = tutorialState.currentStep
    const previousStep = previousStepRef.current

    if (currentStep === 'expand-provider' && previousStep !== 'expand-provider') {
      setTutorialSessionKey(prev => prev + 1)
    }

    previousStepRef.current = currentStep
  }, [tutorialState.currentStep])

  const previousStateRef = useRef({
    tutorialProviderExpanded: false,
    firstModelSelected: false,
    secondModelSelected: false,
    bothModelsSelected: false,
    hasPromptText: false,
    hasCompletedComparison: false,
    isFollowUpMode: false,
    showHistoryDropdown: false,
  })

  useEffect(() => {
    if (!tutorialState.isActive || !tutorialState.currentStep) return

    const currentStep = tutorialState.currentStep

    if (
      currentStep === 'expand-provider' &&
      tutorialProviderExpanded &&
      !previousStateRef.current.tutorialProviderExpanded
    ) {
      completeStep('expand-provider')
      onProviderExpanded?.()
    }

    // Use completedSteps (not only rising-edge refs) so a fast second model select
    // on touch/WebKit cannot mark secondModelSelected in previousState before we enter step 2.
    const completed = tutorialState.completedSteps

    if (
      currentStep === 'select-starter-model-1' &&
      firstModelSelected &&
      !completed.has('select-starter-model-1')
    ) {
      completeStep('select-starter-model-1')
      onModelsSelected?.()
    }

    if (
      currentStep === 'select-starter-model-2' &&
      secondModelSelected &&
      firstModelSelected &&
      !completed.has('select-starter-model-2')
    ) {
      completeStep('select-starter-model-2')
      onModelsSelected?.()
    }

    if (currentStep === 'select-models' && bothModelsSelected && !completed.has('select-models')) {
      completeStep('select-models')
      onModelsSelected?.()
    }

    if (
      currentStep === 'submit-comparison' &&
      hasCompletedComparison &&
      !previousStateRef.current.hasCompletedComparison
    ) {
      completeStep('submit-comparison')
      onComparisonComplete?.()
    }

    if (
      currentStep === 'follow-up' &&
      hasCompletedComparison &&
      !previousStateRef.current.hasCompletedComparison
    ) {
      completeStep('follow-up')
      onFollowUpActivated?.()
    }

    if (
      currentStep === 'submit-comparison-2' &&
      hasCompletedComparison &&
      !previousStateRef.current.hasCompletedComparison
    ) {
      completeStep('submit-comparison-2')
      onComparisonComplete?.()
    }

    previousStateRef.current = {
      tutorialProviderExpanded: tutorialProviderExpanded || false,
      firstModelSelected: firstModelSelected || false,
      secondModelSelected: secondModelSelected || false,
      bothModelsSelected: bothModelsSelected || false,
      hasPromptText: hasPromptText || false,
      hasCompletedComparison: hasCompletedComparison || false,
      isFollowUpMode: isFollowUpMode || false,
      showHistoryDropdown: showHistoryDropdown || false,
    }
  }, [
    tutorialState.isActive,
    tutorialState.currentStep,
    tutorialState.completedSteps,
    tutorialProviderExpanded,
    firstModelSelected,
    secondModelSelected,
    bothModelsSelected,
    hasPromptText,
    hasCompletedComparison,
    isFollowUpMode,
    showHistoryDropdown,
    completeStep,
    onProviderExpanded,
    onModelsSelected,
    onComparisonComplete,
    onFollowUpActivated,
  ])

  const isCurrentStepCompleted = (): boolean => {
    if (!tutorialState.currentStep) return false

    const currentStep = tutorialState.currentStep

    switch (currentStep) {
      case 'expand-provider':
        return tutorialProviderExpanded || false
      case 'select-starter-model-1':
        return firstModelSelected || false
      case 'select-starter-model-2':
        return (secondModelSelected && firstModelSelected) || false
      case 'select-models':
        return bothModelsSelected || false
      case 'enter-prompt':
        return hasPromptText || false
      case 'submit-comparison':
        return hasCompletedComparison || false
      case 'follow-up':
        return hasCompletedComparison || false
      case 'enter-prompt-2':
        return hasPromptText || false
      case 'submit-comparison-2':
        return hasCompletedComparison || false
      case 'view-follow-up-results':
        return true
      case 'history-dropdown':
        return showHistoryDropdown || false
      case 'save-selection': {
        const savedSelectionsDropdown = document.querySelector('.saved-selections-dropdown')
        return savedSelectionsDropdown !== null
      }
      default:
        return false
    }
  }

  const handleComplete = () => {
    if (!tutorialState.currentStep) return

    const currentStep = tutorialState.currentStep

    if (currentStep === 'view-follow-up-results') {
      completeStep(currentStep)
    } else if (currentStep === 'history-dropdown' || currentStep === 'save-selection') {
      completeStep(currentStep)
    } else if (isCurrentStepCompleted()) {
      completeStep(currentStep)
    }
  }

  if (!tutorialState.isActive) {
    return null
  }

  return (
    <MobileTutorialOverlay
      key={tutorialSessionKey}
      step={tutorialState.currentStep}
      tutorialProviderNames={tutorialProviderNames}
      tutorialVisibleStepOrder={tutorialVisibleStepOrder}
      tutorialStarterEntries={tutorialStarterEntries}
      tutorialSplitModelSteps={tutorialSplitModelSteps}
      onComplete={handleComplete}
      onSkip={skipTutorial}
      isStepCompleted={isCurrentStepCompleted()}
      isLoading={isLoading}
      streamAnswerStarted={streamAnswerStarted}
      followUpSubmitStarted={followUpSubmitStarted}
    />
  )
}
