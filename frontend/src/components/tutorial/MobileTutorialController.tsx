import React, { useEffect, useRef, useState } from 'react'

import type { StarterModelEntry } from '../../data/tutorialStepPlan'
import type { TutorialStep, TutorialState } from '../../hooks/useTutorial'

import MobileTutorialOverlay from './MobileTutorialOverlay'

interface MobileTutorialControllerProps {
  tutorialState: TutorialState
  completeStep: (step: TutorialStep) => void
  skipTutorial: () => void
  firstStarterProviderExpanded?: boolean
  secondStarterProviderExpanded?: boolean
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
  firstStarterProviderExpanded,
  secondStarterProviderExpanded,
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
  // Entering the first select step clears a preselected starter set in the parent effect.
  // That clear is not visible until the next render, so the selection still looks chosen
  // on entry. Completing here would skip the step before the user picks a model.
  const selectionClearedOnStepRef = useRef(false)

  useEffect(() => {
    const currentStep = tutorialState.currentStep
    const previousStep = previousStepRef.current

    if (currentStep === 'expand-provider' && previousStep !== 'expand-provider') {
      setTutorialSessionKey(prev => prev + 1)
    }

    previousStepRef.current = currentStep
  }, [tutorialState.currentStep])

  const previousStateRef = useRef({
    firstStarterProviderExpanded: false,
    secondStarterProviderExpanded: false,
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
      firstStarterProviderExpanded &&
      !previousStateRef.current.firstStarterProviderExpanded
    ) {
      completeStep('expand-provider')
      onProviderExpanded?.()
    }

    if (
      currentStep === 'expand-starter-provider-2' &&
      secondStarterProviderExpanded &&
      !previousStateRef.current.secondStarterProviderExpanded
    ) {
      completeStep('expand-starter-provider-2')
      onProviderExpanded?.()
    }

    // Use completedSteps (not only rising-edge refs) so a fast second model select
    // on touch/WebKit cannot mark secondModelSelected in previousState before we enter step 2.
    const completed = tutorialState.completedSteps

    if (currentStep !== 'select-starter-model-1' && currentStep !== 'select-models') {
      selectionClearedOnStepRef.current = false
    } else if (
      (currentStep === 'select-starter-model-1' && !firstModelSelected) ||
      (currentStep === 'select-models' && !bothModelsSelected)
    ) {
      selectionClearedOnStepRef.current = true
    }

    if (
      currentStep === 'select-starter-model-1' &&
      firstModelSelected &&
      selectionClearedOnStepRef.current &&
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

    if (
      currentStep === 'select-models' &&
      bothModelsSelected &&
      selectionClearedOnStepRef.current &&
      !completed.has('select-models')
    ) {
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
      firstStarterProviderExpanded: firstStarterProviderExpanded || false,
      secondStarterProviderExpanded: secondStarterProviderExpanded || false,
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
    firstStarterProviderExpanded,
    secondStarterProviderExpanded,
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
        return firstStarterProviderExpanded || false
      case 'expand-starter-provider-2':
        return secondStarterProviderExpanded || false
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

  // The result card is on screen before Safari clears isLoading. Advance then,
  // so the next tooltip fades in during the transition instead of after it.
  useEffect(() => {
    if (tutorialState.currentStep !== 'submit-comparison') return
    if (tutorialState.completedSteps.has('submit-comparison')) return
    const replyIsVisible = () => {
      const card = document.querySelector(
        '.result-card.conversation-card, .results-section [data-testid^="result-card-"]'
      )
      if (!card) return false
      const rect = card.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
    if (replyIsVisible()) {
      completeStep('submit-comparison')
      return
    }
    const id = window.setInterval(() => {
      if (!replyIsVisible()) return
      window.clearInterval(id)
      completeStep('submit-comparison')
    }, 100)
    return () => window.clearInterval(id)
  }, [tutorialState.currentStep, tutorialState.completedSteps, completeStep])

  // The follow-up reply is on screen before Safari clears isLoading. The review
  // card has to fade in during that tail, not after the stream flag drops.
  useEffect(() => {
    if (tutorialState.currentStep !== 'follow-up') return
    if (tutorialState.completedSteps.has('follow-up')) return
    const secondRoundIsVisible = () =>
      Array.from(document.querySelectorAll('.result-card.conversation-card')).some(
        card => card.querySelectorAll('.conversation-message.user').length >= 2
      )
    if (secondRoundIsVisible()) {
      completeStep('follow-up')
      return
    }
    const id = window.setInterval(() => {
      if (!secondRoundIsVisible()) return
      window.clearInterval(id)
      completeStep('follow-up')
    }, 100)
    return () => window.clearInterval(id)
  }, [tutorialState.currentStep, tutorialState.completedSteps, completeStep])

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
