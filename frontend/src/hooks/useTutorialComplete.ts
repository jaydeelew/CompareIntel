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
  /** Whether auth state is still loading - do not show welcome modal until this is false */
  authLoading: boolean
}

export interface UseTutorialCompleteReturn {
  // State
  tutorialState: TutorialState
  showWelcomeModal: boolean
  tutorialHasCompletedComparison: boolean
  tutorialHasBreakout: boolean
  tutorialHasSavedSelection: boolean
  /** True after the user submits a follow-up (loading starts) on step 5; reset when leaving that step. */
  followUpSubmitStarted: boolean

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
    authLoading,
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

  // Welcome modal state
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)

  // Tutorial progress tracking
  const [tutorialHasCompletedComparison, setTutorialHasCompletedComparison] = useState(false)
  const [tutorialHasBreakout, setTutorialHasBreakout] = useState(false)
  const [tutorialHasSavedSelection, setTutorialHasSavedSelection] = useState(false)

  const hasShownWelcomeModalRef = useRef(false)
  /** True once the user has started a follow-up request (loading) on tutorial step 5. Prevents
   *  treating the first comparison's 2+ assistant messages as "round 2" before they submit. */
  const followUpSubmitInitiatedRef = useRef(false)

  const [followUpSubmitStarted, setFollowUpSubmitStarted] = useState(false)
  useEffect(() => {
    if (tutorialState.currentStep !== 'follow-up') {
      setFollowUpSubmitStarted(false)
    } else if (isLoading) {
      setFollowUpSubmitStarted(true)
    }
  }, [tutorialState.currentStep, isLoading])

  // Tutorial Actions

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

      if (step === 'follow-up') {
        // Redundant prompt/submit steps (old 6–7); step 6 is view-follow-up-results (review), then 7–8
        newCompleted.add('enter-prompt-2')
        newCompleted.add('submit-comparison-2')
        return {
          isActive: true,
          currentStep: 'view-follow-up-results',
          completedSteps: newCompleted,
        }
      }

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

  // Effects (previously in useTutorialEffects)

  // Welcome modal logic - show for unregistered users after auth has loaded
  // Must wait for authLoading to be false to avoid flashing for logged-in users in production
  // (when auth resolves quickly, isAuthenticated can transition from false to true very fast)
  useEffect(() => {
    // Don't show until auth has finished loading - prevents modal flash for logged-in users
    if (authLoading) {
      return
    }

    // Don't show if already shown this session
    if (hasShownWelcomeModalRef.current) {
      return
    }

    // Don't show for authenticated users, active tutorial, or non-main views
    if (isAuthenticated || tutorialState.isActive || currentView !== 'main') {
      return
    }

    // Check "don't show again" preference
    const dontShowAgain = localStorage.getItem(WELCOME_DONT_SHOW_KEY)
    if (dontShowAgain !== 'true') {
      setShowWelcomeModal(true)
      hasShownWelcomeModalRef.current = true
    }
  }, [authLoading, isAuthenticated, tutorialState.isActive, currentView])

  // Reset completion flag when entering steps that use the comparison-complete signal again.
  // Must run before the comparison-tracking effect so a follow-up that is already loaded
  // still sets the flag true in the same commit (reset first, then detect completion).
  useEffect(() => {
    if (
      tutorialState.currentStep === 'enter-prompt-2' ||
      tutorialState.currentStep === 'follow-up' ||
      tutorialState.currentStep === 'view-follow-up-results'
    ) {
      setTutorialHasCompletedComparison(false)
    }
  }, [tutorialState.currentStep])

  // Step 5: only count "second round" after the user has actually submitted a follow-up (loading).
  useEffect(() => {
    if (tutorialState.currentStep !== 'follow-up') {
      followUpSubmitInitiatedRef.current = false
    } else if (isLoading) {
      followUpSubmitInitiatedRef.current = true
    }
  }, [tutorialState.currentStep, isLoading])

  // Track comparison completion for tutorial (initial compare, optional 2nd-round step, or step 5 follow-up)
  useEffect(() => {
    if (isLoading) return

    const hasSecondRoundAssistantContent =
      conversations.length > 0 &&
      conversations.some(conv => {
        const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
        const last = assistantMessages[assistantMessages.length - 1]
        return assistantMessages.length >= 2 && !!last?.content && last.content.trim().length > 0
      })

    const step = tutorialState.currentStep
    if (step === 'submit-comparison-2' && isFollowUpMode) {
      if (hasSecondRoundAssistantContent) {
        setTutorialHasCompletedComparison(true)
      }
    } else if (step === 'submit-comparison') {
      if (conversations.length > 0) {
        setTutorialHasCompletedComparison(true)
      }
    } else if (step === 'follow-up' && isFollowUpMode) {
      if (hasSecondRoundAssistantContent && followUpSubmitInitiatedRef.current) {
        setTutorialHasCompletedComparison(true)
      }
    }
  }, [conversations, isLoading, tutorialState.currentStep, isFollowUpMode])

  return {
    // State
    tutorialState,
    showWelcomeModal,
    tutorialHasCompletedComparison,
    tutorialHasBreakout,
    tutorialHasSavedSelection,
    followUpSubmitStarted,

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
