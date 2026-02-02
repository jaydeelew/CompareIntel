/**
 * useTutorialComplete - Combined tutorial hook
 *
 * This hook combines useTutorial and useTutorialEffects into a single
 * cohesive hook following 2025 React best practices:
 * - Single responsibility: manages all tutorial-related state and effects
 * - Reduced prop drilling by co-locating related logic
 * - Cleaner component API
 */

import { useState, useCallback, useEffect, useRef } from 'react'

import type { ModelConversation } from '../types'

// Tutorial step types
export type TutorialStep =
  | 'expand-provider'
  | 'select-models'
  | 'enter-prompt'
  | 'submit-comparison'
  | 'follow-up'
  | 'enter-prompt-2'
  | 'submit-comparison-2'
  | 'view-follow-up-results'
  | 'history-dropdown'
  | 'save-selection'

export interface TutorialState {
  isActive: boolean
  currentStep: TutorialStep | null
  completedSteps: Set<TutorialStep>
}

const TUTORIAL_STORAGE_KEY = 'compareintel_tutorial_completed'
const WELCOME_DONT_SHOW_KEY = 'compareintel_welcome_dont_show_again'

const TUTORIAL_STEPS: TutorialStep[] = [
  'expand-provider',
  'select-models',
  'enter-prompt',
  'submit-comparison',
  'follow-up',
  'enter-prompt-2',
  'submit-comparison-2',
  'view-follow-up-results',
  'history-dropdown',
  'save-selection',
]

export interface UseTutorialCompleteConfig {
  /** Current view ('main' or 'admin') */
  currentView: 'admin' | 'main'
  /** Current location pathname */
  locationPathname: string
  /** Active conversations */
  conversations: ModelConversation[]
  /** Whether comparison is loading */
  isLoading: boolean
  /** Whether in follow-up mode */
  isFollowUpMode: boolean
  /** Whether user is authenticated */
  isAuthenticated: boolean
}

export interface UseTutorialCompleteReturn {
  // State
  tutorialState: TutorialState
  showWelcomeModal: boolean
  tutorialHasCompletedComparison: boolean
  tutorialHasBreakout: boolean
  tutorialHasSavedSelection: boolean

  // Actions
  startTutorial: () => void
  completeStep: (step: TutorialStep) => void
  skipTutorial: () => void
  resetTutorial: () => void
  goToStep: (step: TutorialStep) => void
  setShowWelcomeModal: (show: boolean) => void
  setTutorialHasCompletedComparison: (completed: boolean) => void
  setTutorialHasBreakout: (hasBreakout: boolean) => void
  setTutorialHasSavedSelection: (hasSaved: boolean) => void
}

export function useTutorialComplete(config: UseTutorialCompleteConfig): UseTutorialCompleteReturn {
  const {
    currentView,
    locationPathname: _locationPathname,
    conversations,
    isLoading,
    isFollowUpMode,
    isAuthenticated,
  } = config

  // Core tutorial state
  const [tutorialState, setTutorialState] = useState<TutorialState>(() => {
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'
    return {
      isActive: false,
      currentStep: null,
      completedSteps: completed ? new Set(TUTORIAL_STEPS) : new Set<TutorialStep>(),
    }
  })

  // Welcome modal state - initialize based on localStorage
  // Show modal for unauthenticated users unless they've dismissed it
  const [showWelcomeModal, setShowWelcomeModal] = useState(() => {
    // Check if user has permanently dismissed the modal
    const dontShowAgain = localStorage.getItem(WELCOME_DONT_SHOW_KEY) === 'true'
    const tutorialSkipped = localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'
    // Only show if neither dismissal flag is set
    return !dontShowAgain && !tutorialSkipped
  })

  // Tutorial progress tracking
  const [tutorialHasCompletedComparison, setTutorialHasCompletedComparison] = useState(false)
  const [tutorialHasBreakout, setTutorialHasBreakout] = useState(false)
  const [tutorialHasSavedSelection, setTutorialHasSavedSelection] = useState(false)

  // Track if we've already shown the modal this session (to prevent re-showing on dependency changes)
  const hasShownModalRef = useRef(false)

  // ============================================
  // Tutorial Actions
  // ============================================

  const startTutorial = useCallback(() => {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY)
    setTutorialState({
      isActive: true,
      currentStep: TUTORIAL_STEPS[0],
      completedSteps: new Set(),
    })
  }, [])

  const completeStep = useCallback((step: TutorialStep) => {
    setTutorialState(prev => {
      if (!prev.isActive || prev.currentStep !== step) {
        return prev
      }

      const newCompleted = new Set(prev.completedSteps)
      newCompleted.add(step)

      const currentIndex = TUTORIAL_STEPS.indexOf(step)
      const nextIndex = currentIndex + 1

      if (nextIndex >= TUTORIAL_STEPS.length) {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
        return {
          isActive: false,
          currentStep: null,
          completedSteps: newCompleted,
        }
      }

      return {
        isActive: true,
        currentStep: TUTORIAL_STEPS[nextIndex],
        completedSteps: newCompleted,
      }
    })
  }, [])

  const skipTutorial = useCallback(() => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
    setTutorialState({
      isActive: false,
      currentStep: null,
      completedSteps: new Set(),
    })
  }, [])

  const resetTutorial = useCallback(() => {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY)
    setTutorialState({
      isActive: false,
      currentStep: null,
      completedSteps: new Set(),
    })
  }, [])

  const goToStep = useCallback((step: TutorialStep) => {
    setTutorialState(prev => ({
      ...prev,
      currentStep: step,
    }))
  }, [])

  // ============================================
  // Effects (previously in useTutorialEffects)
  // ============================================

  // Welcome modal logic - show for unauthenticated users on main view
  // unless they've clicked "Don't show again" or "Skip for Now"
  useEffect(() => {
    // Hide modal for authenticated users, when tutorial is active, or not on main view
    if (isAuthenticated || tutorialState.isActive || currentView !== 'main') {
      if (showWelcomeModal) {
        setShowWelcomeModal(false)
      }
      return
    }

    // Check localStorage flags (in case they changed)
    const dontShowAgain = localStorage.getItem(WELCOME_DONT_SHOW_KEY) === 'true'
    const tutorialSkipped = localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'

    // If user has dismissed the modal, ensure it stays hidden
    if (dontShowAgain || tutorialSkipped) {
      if (showWelcomeModal) {
        setShowWelcomeModal(false)
      }
      return
    }

    // Show modal if conditions are met and we haven't shown it yet this session
    if (!showWelcomeModal && !hasShownModalRef.current) {
      setShowWelcomeModal(true)
      hasShownModalRef.current = true
    }
  }, [isAuthenticated, tutorialState.isActive, currentView, showWelcomeModal])

  // Track comparison completion for tutorial
  useEffect(() => {
    const isSubmitStep =
      tutorialState.currentStep === 'submit-comparison' ||
      tutorialState.currentStep === 'submit-comparison-2'

    if (isSubmitStep && !isLoading) {
      if (tutorialState.currentStep === 'submit-comparison-2' && isFollowUpMode) {
        const hasFollowUpResponses =
          conversations.length > 0 &&
          conversations.some(conv => {
            const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
            return (
              assistantMessages.length >= 2 &&
              assistantMessages[assistantMessages.length - 1].content.trim().length > 0
            )
          })
        if (hasFollowUpResponses) {
          setTutorialHasCompletedComparison(true)
        }
      } else if (tutorialState.currentStep === 'submit-comparison') {
        if (conversations.length > 0) {
          setTutorialHasCompletedComparison(true)
        }
      }
    }
  }, [conversations, isLoading, tutorialState.currentStep, isFollowUpMode])

  // Reset completion flag when entering follow-up prompt step
  useEffect(() => {
    if (tutorialState.currentStep === 'enter-prompt-2') {
      setTutorialHasCompletedComparison(false)
    }
  }, [tutorialState.currentStep])

  return {
    // State
    tutorialState,
    showWelcomeModal,
    tutorialHasCompletedComparison,
    tutorialHasBreakout,
    tutorialHasSavedSelection,

    // Actions
    startTutorial,
    completeStep,
    skipTutorial,
    resetTutorial,
    goToStep,
    setShowWelcomeModal,
    setTutorialHasCompletedComparison,
    setTutorialHasBreakout,
    setTutorialHasSavedSelection,
  }
}
