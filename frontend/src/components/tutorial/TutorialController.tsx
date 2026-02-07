import React, { useEffect, useRef, useState, Suspense, lazy } from 'react'

import type { TutorialStep, TutorialState } from '../../hooks/useTutorial'

// Lazy load TutorialOverlay to prevent blocking React mount
// This fixes the module export error that was preventing React from initializing
// Try default export first, fallback to named export
const TutorialOverlayLazy = lazy(() =>
  import('./TutorialOverlay').then(module => {
    // Try default export first, then named export
    const component = module.default || module.TutorialOverlay
    if (!component) {
      throw new Error('TutorialOverlay component not found in module')
    }
    return { default: component }
  })
)

interface TutorialControllerProps {
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

export const TutorialController: React.FC<TutorialControllerProps> = ({
  tutorialState,
  completeStep,
  skipTutorial,
  googleProviderExpanded,
  googleModelsSelected,
  hasPromptText,
  hasCompletedComparison,
  isFollowUpMode,
  hasBreakoutConversation,
  showHistoryDropdown,
  hasSavedSelection,
  isLoading,
  onProviderExpanded,
  onModelsSelected,
  onPromptEntered,
  onComparisonComplete,
  onFollowUpActivated,
  onBreakoutCreated,
  onHistoryOpened,
  onSelectionSaved,
}) => {
  // Track tutorial session to force remount of TutorialOverlay when tutorial restarts
  const [tutorialSessionKey, setTutorialSessionKey] = useState(0)
  const previousStepRef = useRef<TutorialStep | null>(null)

  // Increment session key when tutorial restarts (step goes to first step from any other state)
  // This handles both:
  // 1. Starting fresh (inactive -> active with first step)
  // 2. Restarting mid-tutorial (some step -> first step while still active)
  useEffect(() => {
    const currentStep = tutorialState.currentStep
    const previousStep = previousStepRef.current

    // Detect restart: step is now 'expand-provider' AND it wasn't 'expand-provider' before
    // (or was null before, meaning tutorial just started)
    if (currentStep === 'expand-provider' && previousStep !== 'expand-provider') {
      // Tutorial just started or restarted - increment key to force TutorialOverlay remount
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

    // Enter prompt completion - removed auto-advancement, user must click "Done with input"
    // This step now requires manual completion via button click

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

    // Enter prompt 2 completion (step 6) - removed auto-advancement, user must click "Done with input"
    // This step now requires manual completion via button click

    // Submit comparison 2 completion (step 7)
    if (
      currentStep === 'submit-comparison-2' &&
      hasCompletedComparison &&
      !previousStateRef.current.hasCompletedComparison
    ) {
      completeStep('submit-comparison-2')
      onComparisonComplete?.()
    }

    // History dropdown completion - removed auto-advancement, user must click "Done" button
    // This step now requires manual completion via button click so user can see the dropdown
    // without it being dimmed before moving to the next step

    // Save selection completion - removed auto-advancement, user must click "Done" button
    // This step now requires manual completion via button click so user can see the dropdown
    // without it being dimmed before completing the tutorial

    // Update previous state
    previousStateRef.current = {
      googleProviderExpanded: googleProviderExpanded || false,
      googleModelsSelected: googleModelsSelected || false,
      hasPromptText: hasPromptText || false,
      hasCompletedComparison: hasCompletedComparison || false,
      isFollowUpMode: isFollowUpMode || false,
      hasBreakoutConversation: hasBreakoutConversation || false,
      showHistoryDropdown: showHistoryDropdown || false,
      hasSavedSelection: hasSavedSelection || false,
    }
  }, [
    tutorialState.isActive,
    tutorialState.currentStep,
    googleProviderExpanded,
    googleModelsSelected,
    hasPromptText,
    hasCompletedComparison,
    isFollowUpMode,
    hasBreakoutConversation,
    showHistoryDropdown,
    hasSavedSelection,
    completeStep,
    onProviderExpanded,
    onModelsSelected,
    onPromptEntered,
    onComparisonComplete,
    onFollowUpActivated,
    onBreakoutCreated,
    onHistoryOpened,
    onSelectionSaved,
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
        // Step 8 - always show as completed (user just needs to click Done)
        return true
      case 'history-dropdown':
        // Step 9 requires history dropdown to be open
        return showHistoryDropdown || false
      case 'save-selection': {
        // Step 10 requires saved selections dropdown to be open
        // Check if saved selections dropdown exists in DOM
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

    // For view-follow-up-results step (8), allow immediate completion via Done button
    if (currentStep === 'view-follow-up-results') {
      completeStep(currentStep)
      // For dropdown steps (9 and 10), allow completion if dropdown was opened at some point
      // This prevents issues where clicking "Done" might close the dropdown before completion check
    } else if (currentStep === 'history-dropdown' || currentStep === 'save-selection') {
      // For dropdown steps, complete immediately when "Done" is clicked
      // The button is only enabled when dropdown is open, so we can safely complete
      completeStep(currentStep)
    } else if (isCurrentStepCompleted()) {
      // For other steps, check if step is completed
      completeStep(currentStep)
    }
  }

  if (!tutorialState.isActive) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <TutorialOverlayLazy
        key={tutorialSessionKey}
        step={tutorialState.currentStep}
        onComplete={handleComplete}
        onSkip={skipTutorial}
        isStepCompleted={isCurrentStepCompleted()}
        isLoading={isLoading}
      />
    </Suspense>
  )
}
