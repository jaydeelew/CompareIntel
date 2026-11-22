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

import { dispatchOnboardingTutorialActive } from '../constants/onboardingTutorialEvents'
import { buildTutorialRuntimeStepSequenceSameProvider } from '../data/tutorialStepPlan'
import type { ModelConversation } from '../types'

// Tutorial step types
export type TutorialStep =
  | 'expand-provider'
  | 'expand-starter-provider-2'
  | 'select-models'
  | 'select-starter-model-1'
  | 'select-starter-model-2'
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

/** Playwright injects these in e2e; welcome modal would otherwise race after auth and block the whole suite. */
export function shouldSuppressWelcomeModalForAutomation(): boolean {
  if (typeof window === 'undefined') return false
  return window.__PLAYWRIGHT__ === true || window.__TEST_ENV__ === true
}

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
  startTutorial: (stepSequence?: TutorialStep[]) => void
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
  const runtimeStepSequenceRef = useRef<TutorialStep[]>(
    buildTutorialRuntimeStepSequenceSameProvider()
  )
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
      completedSteps: completed
        ? new Set(buildTutorialRuntimeStepSequenceSameProvider())
        : new Set<TutorialStep>(),
    }
  })

  // Welcome modal state
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)

  // Tutorial progress tracking
  const [tutorialHasCompletedComparison, setTutorialHasCompletedComparison] = useState(false)
  const [tutorialHasBreakout, setTutorialHasBreakout] = useState(false)
  const [tutorialHasSavedSelection, setTutorialHasSavedSelection] = useState(false)

  /** Prevents re-showing the welcome modal within a single page load (effect re-runs). */
  const hasShownWelcomeModalRef = useRef(false)
  /** True once the user has started a follow-up request (loading) on tutorial step 5. Prevents
   *  treating the first comparison's 2+ assistant messages as "round 2" before they submit. */
  const followUpSubmitInitiatedRef = useRef(false)

  const [followUpSubmitStarted, setFollowUpSubmitStarted] = useState(false)
  /** True after follow-up has been seen while idle, so the first comparison's loading tail is not a new submit. */
  const followUpSawIdleRef = useRef(false)
  /** User prompts already on screen while follow-up is idle. A later round has to add one. */
  const followUpUserBaselineRef = useRef<number | null>(null)
  useEffect(() => {
    if (tutorialState.currentStep !== 'follow-up') {
      setFollowUpSubmitStarted(false)
      followUpSawIdleRef.current = false
      followUpUserBaselineRef.current = null
      return
    }
    if (!isLoading) {
      followUpSawIdleRef.current = true
      if (!followUpSubmitStarted) {
        const counts = conversations.map(
          conv => conv.messages.filter(msg => msg.type === 'user').length
        )
        const measured = counts.filter(count => count > 0)
        // An empty card is not a baseline. Treating 0 as "no prompts yet" made the
        // first comparison's own prompt look like a new follow-up round.
        if (measured.length > 0) followUpUserBaselineRef.current = Math.max(...measured)
      }
      return
    }
    // Don't arm a submit until the first round's prompt has actually been counted.
    // Mobile Safari reaches follow-up while the first stream is still finishing.
    if (followUpSawIdleRef.current && followUpUserBaselineRef.current != null) {
      setFollowUpSubmitStarted(true)
    }
  }, [tutorialState.currentStep, isLoading, followUpSubmitStarted, conversations])

  // Tutorial Actions

  const startTutorial = useCallback((stepSequence?: TutorialStep[]) => {
    const sequence = stepSequence ?? buildTutorialRuntimeStepSequenceSameProvider()
    runtimeStepSequenceRef.current = sequence
    localStorage.removeItem(TUTORIAL_STORAGE_KEY)
    setTutorialState({
      isActive: true,
      currentStep: sequence[0] ?? null,
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

      const sequence = runtimeStepSequenceRef.current
      const currentIndex = sequence.indexOf(step)
      const nextIndex = currentIndex + 1

      if (nextIndex >= sequence.length) {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
        return {
          isActive: false,
          currentStep: null,
          completedSteps: newCompleted,
        }
      }

      return {
        isActive: true,
        currentStep: sequence[nextIndex],
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

  // Keep PWA install prompt deferred while welcome modal or guided tutorial is active.
  useEffect(() => {
    const welcomeVisible = showWelcomeModal && !isAuthenticated
    const active = welcomeVisible || tutorialState.isActive
    dispatchOnboardingTutorialActive(active)
  }, [showWelcomeModal, isAuthenticated, tutorialState.isActive])

  useEffect(() => {
    return () => {
      dispatchOnboardingTutorialActive(false)
    }
  }, [])

  // Welcome modal logic - show for unregistered users after auth has loaded
  // Must wait for authLoading to be false to avoid flashing for logged-in users in production
  // (when auth resolves quickly, isAuthenticated can transition from false to true very fast)
  useEffect(() => {
    // Don't show until auth has finished loading - prevents modal flash for logged-in users
    if (authLoading) {
      return
    }

    if (shouldSuppressWelcomeModalForAutomation()) {
      return
    }

    // Don't show more than once per page load (e.g. after skip/close or tutorial end)
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
    } else if (isLoading && followUpSawIdleRef.current && followUpUserBaselineRef.current != null) {
      followUpSubmitInitiatedRef.current = true
    }
  }, [tutorialState.currentStep, isLoading])

  // Track comparison completion for tutorial (initial compare, optional 2nd-round step, or step 5 follow-up)
  useEffect(() => {
    const submitReplyIsVisible =
      tutorialState.currentStep === 'submit-comparison' &&
      conversations.some(conv =>
        conv.messages.some(
          msg => msg.type === 'assistant' && !!msg.content && msg.content.trim().length > 0
        )
      )
    // Safari can keep isLoading true after the result card is already on screen.
    // Waiting for the flag kept the next tooltip hidden for the whole sample.
    if (isLoading && !submitReplyIsVisible) return

    const hasSecondRoundAssistantContent =
      conversations.length > 0 &&
      conversations.some(conv => {
        const userMessages = conv.messages.filter(msg => msg.type === 'user')
        const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
        const last = assistantMessages[assistantMessages.length - 1]
        // A second assistant node without a second prompt is still the first
        // comparison. Mobile Safari has painted that shape and skipped follow-up.
        return (
          userMessages.length >= 2 &&
          assistantMessages.length >= 2 &&
          !!last?.content &&
          last.content.trim().length > 0
        )
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
      const baseline = followUpUserBaselineRef.current
      const hasNewFollowUpRound =
        baseline != null &&
        conversations.some(conv => {
          const userMessages = conv.messages.filter(msg => msg.type === 'user')
          const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
          const last = assistantMessages[assistantMessages.length - 1]
          return (
            userMessages.length > baseline &&
            assistantMessages.length >= 2 &&
            !!last?.content &&
            last.content.trim().length > 0
          )
        })
      if (hasNewFollowUpRound && followUpSubmitInitiatedRef.current) {
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
