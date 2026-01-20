import React, { useEffect, useRef, useState } from 'react'

import type { TutorialStep, TutorialState } from '../../hooks/useTutorial'

import { MobileTutorialOverlay } from './MobileTutorialOverlay'

interface MobileTutorialControllerProps {
  // Tutorial state and functions (passed from parent to share state)
  tutorialState: TutorialState
  completeStep: (step: TutorialStep) => void
  skipTutorial: () => void
  // State to watch for completion detection
  googleProviderExpanded?: boolean
  googleModelsSelected?: boolean
  hasPromptText?: boolean
  hasCompletedComparison?: boolean
  isFollowUpMode?: boolean
  hasBreakoutConversation?: boolean
  showHistoryDropdown?: boolean
  hasSavedSelection?: boolean
  // Loading state for submit-comparison steps
  isLoading?: boolean
  // Callbacks for when user performs actions
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
  googleProviderExpanded,
  googleModelsSelected,
  hasPromptText,
  hasCompletedComparison,
  isFollowUpMode,
  showHistoryDropdown,
  isLoading,
  onProviderExpanded,
  onModelsSelected,
  onComparisonComplete,
  onFollowUpActivated,
}) => {
  // Track tutorial session to force remount when tutorial restarts
  const [tutorialSessionKey, setTutorialSessionKey] = useState(0)
  const previousStepRef = useRef<TutorialStep | null>(null)

  // Increment session key when tutorial restarts
  useEffect(() => {
    const currentStep = tutorialState.currentStep
    const previousStep = previousStepRef.current

    if (currentStep === 'expand-provider' && previousStep !== 'expand-provider') {
      setTutorialSessionKey(prev => prev + 1)
    }

    previousStepRef.current = currentStep
  }, [tutorialState.currentStep])

  const previousStateRef = useRef({
    googleProviderExpanded: false,
    googleModelsSelected: false,
    hasPromptText: false,
    hasCompletedComparison: false,
    isFollowUpMode: false,
    hasBreakoutConversation: false,
    showHistoryDropdown: false,
    hasSavedSelection: false,
  })

  // Detect completion of each step
  useEffect(() => {
    if (!tutorialState.isActive || !tutorialState.currentStep) return

    const currentStep = tutorialState.currentStep

    // Expand provider completion (Google provider)
    if (
      currentStep === 'expand-provider' &&
      googleProviderExpanded &&
      !previousStateRef.current.googleProviderExpanded
    ) {
      completeStep('expand-provider')
      onProviderExpanded?.()
    }

    // Select models completion (both Google models selected)
    if (
      currentStep === 'select-models' &&
      googleModelsSelected &&
      !previousStateRef.current.googleModelsSelected
    ) {
      completeStep('select-models')
      onModelsSelected?.()
    }

    // Submit comparison completion
    if (
      currentStep === 'submit-comparison' &&
      hasCompletedComparison &&
      !previousStateRef.current.hasCompletedComparison
    ) {
      completeStep('submit-comparison')
      onComparisonComplete?.()
    }

    // Follow-up completion
    if (currentStep === 'follow-up' && isFollowUpMode && !previousStateRef.current.isFollowUpMode) {
      completeStep('follow-up')
      onFollowUpActivated?.()
    }

    // Submit comparison 2 completion (step 7)
    if (
      currentStep === 'submit-comparison-2' &&
      hasCompletedComparison &&
      !previousStateRef.current.hasCompletedComparison
    ) {
      completeStep('submit-comparison-2')
      onComparisonComplete?.()
    }

    // Update previous state
    previousStateRef.current = {
      googleProviderExpanded: googleProviderExpanded || false,
      googleModelsSelected: googleModelsSelected || false,
      hasPromptText: hasPromptText || false,
      hasCompletedComparison: hasCompletedComparison || false,
      isFollowUpMode: isFollowUpMode || false,
      hasBreakoutConversation: false,
      showHistoryDropdown: showHistoryDropdown || false,
      hasSavedSelection: false,
    }
  }, [
    tutorialState.isActive,
    tutorialState.currentStep,
    googleProviderExpanded,
    googleModelsSelected,
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

  // Check if current step is completed
  const isCurrentStepCompleted = (): boolean => {
    if (!tutorialState.currentStep) return false

    const currentStep = tutorialState.currentStep

    switch (currentStep) {
      case 'expand-provider':
        return googleProviderExpanded || false
      case 'select-models':
        return googleModelsSelected || false
      case 'enter-prompt':
        return hasPromptText || false
      case 'submit-comparison':
        return hasCompletedComparison || false
      case 'follow-up':
        return isFollowUpMode || false
      case 'enter-prompt-2':
        return hasPromptText || false
      case 'submit-comparison-2':
        return hasCompletedComparison || false
      case 'view-follow-up-results':
        return true // Always allow completion
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

  // Handle manual completion via button click
  const handleComplete = () => {
    if (!tutorialState.currentStep) return

    const currentStep = tutorialState.currentStep

    // For view-follow-up-results step, allow immediate completion
    if (currentStep === 'view-follow-up-results') {
      completeStep(currentStep)
    } else if (currentStep === 'history-dropdown' || currentStep === 'save-selection') {
      // For dropdown steps, complete immediately when "Done" is clicked
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
      onComplete={handleComplete}
      onSkip={skipTutorial}
      isStepCompleted={isCurrentStepCompleted()}
      isLoading={isLoading}
    />
  )
}
