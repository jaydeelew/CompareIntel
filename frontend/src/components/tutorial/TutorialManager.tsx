import { useEffect } from 'react'

import type { StarterModelEntry } from '../../data/tutorialStepPlan'
import type { TutorialStep, TutorialState } from '../../hooks/useTutorial'
import type { User } from '../../types'
import type { ModelsByProvider } from '../../types/models'

import { MobileTutorialController } from './MobileTutorialController'
import { TutorialController } from './TutorialController'
import { TutorialWelcomeModal } from './TutorialWelcomeModal'

interface TutorialManagerProps {
  showWelcomeModal: boolean
  setShowWelcomeModal: (value: boolean) => void
  isAuthenticated: boolean
  user: User | null
  resetAppStateForTutorial: () => void
  startTutorial: () => void
  skipTutorial: () => void
  isTouchDevice: boolean
  currentView: 'main' | 'admin'
  isMobileLayout: boolean
  modelsByProvider: ModelsByProvider
  tutorialModelIds: string[]
  tutorialSplitModelSteps: boolean
  tutorialStarterEntries: StarterModelEntry[]
  tutorialVisibleStepOrder: TutorialStep[]
  tutorialProviderNamesForStep: string[]
  openDropdowns: Set<string>
  selectedModels: string[]
  input: string
  tutorialState: TutorialState
  completeStep: (step: TutorialStep) => void
  isFollowUpMode: boolean
  tutorialHasCompletedComparison: boolean
  tutorialHasBreakout: boolean
  tutorialHasSavedSelection: boolean
  showHistoryDropdown: boolean
  isLoading: boolean
  streamAnswerStarted: boolean
  followUpSubmitStarted: boolean
  setTutorialHasCompletedComparison: (value: boolean) => void
  setTutorialHasBreakout: (value: boolean) => void
  setTutorialHasSavedSelection: (value: boolean) => void
  onTutorialWelcomeSkipped?: () => void
}

export function TutorialManager({
  showWelcomeModal,
  setShowWelcomeModal,
  isAuthenticated,
  user: _user,
  resetAppStateForTutorial,
  startTutorial,
  skipTutorial,
  isTouchDevice: _isTouchDevice,
  currentView,
  isMobileLayout,
  modelsByProvider: _modelsByProvider,
  tutorialModelIds,
  tutorialSplitModelSteps,
  tutorialStarterEntries,
  tutorialVisibleStepOrder,
  tutorialProviderNamesForStep,
  openDropdowns,
  selectedModels,
  input,
  tutorialState,
  completeStep,
  isFollowUpMode,
  tutorialHasCompletedComparison,
  tutorialHasBreakout,
  tutorialHasSavedSelection,
  showHistoryDropdown,
  isLoading,
  streamAnswerStarted,
  followUpSubmitStarted,
  setTutorialHasCompletedComparison,
  setTutorialHasBreakout,
  setTutorialHasSavedSelection,
  onTutorialWelcomeSkipped,
}: TutorialManagerProps) {
  const firstStarterProvider = tutorialStarterEntries[0]?.provider ?? ''
  const secondStarterProvider = tutorialStarterEntries[1]?.provider ?? ''
  const firstStarterProviderExpanded = Boolean(
    firstStarterProvider && openDropdowns.has(firstStarterProvider)
  )
  const secondStarterProviderExpanded = Boolean(
    secondStarterProvider && openDropdowns.has(secondStarterProvider)
  )

  const firstModelSelected =
    tutorialModelIds.length > 0 && selectedModels.includes(tutorialModelIds[0])
  const secondModelSelected =
    tutorialModelIds.length > 1 && selectedModels.includes(tutorialModelIds[1])
  const bothModelsSelected = firstModelSelected && secondModelSelected

  const activeTutorialStep = tutorialState.isActive ? tutorialState.currentStep : null
  if (typeof window !== 'undefined') {
    const w = window as Window & { __TUTORIAL_CURRENT_STEP__?: TutorialStep | null }
    w.__TUTORIAL_CURRENT_STEP__ = activeTutorialStep
    if (activeTutorialStep)
      document.documentElement.setAttribute('data-tutorial-step', activeTutorialStep)
    else document.documentElement.removeAttribute('data-tutorial-step')
  }

  useEffect(() => {
    const w = window as Window & { __TUTORIAL_CURRENT_STEP__?: TutorialStep | null }
    w.__TUTORIAL_CURRENT_STEP__ = activeTutorialStep
  }, [activeTutorialStep])

  const sharedControllerProps = {
    tutorialState,
    completeStep,
    skipTutorial,
    firstStarterProviderExpanded,
    secondStarterProviderExpanded,
    tutorialModelIds,
    tutorialSplitModelSteps,
    tutorialStarterEntries,
    tutorialVisibleStepOrder,
    tutorialProviderNames: tutorialProviderNamesForStep,
    firstModelSelected,
    secondModelSelected,
    bothModelsSelected,
    hasPromptText: input.trim().length > 0,
    hasCompletedComparison: tutorialHasCompletedComparison,
    isFollowUpMode,
    hasBreakoutConversation: tutorialHasBreakout,
    showHistoryDropdown,
    hasSavedSelection: tutorialHasSavedSelection,
    isLoading,
    streamAnswerStarted,
    followUpSubmitStarted,
    onProviderExpanded: () => {},
    onModelsSelected: () => {},
    onPromptEntered: () => {},
    onComparisonComplete: () => {
      setTutorialHasCompletedComparison(false)
    },
    onFollowUpActivated: () => {
      setTutorialHasCompletedComparison(false)
    },
    onBreakoutCreated: () => {
      setTutorialHasBreakout(false)
    },
    onHistoryOpened: () => {},
    onSelectionSaved: () => {
      setTutorialHasSavedSelection(false)
    },
  }

  return (
    <>
      {showWelcomeModal && !isAuthenticated && (
        <TutorialWelcomeModal
          onStart={() => {
            setShowWelcomeModal(false)
            resetAppStateForTutorial()
            startTutorial()
          }}
          onSkip={() => {
            setShowWelcomeModal(false)
            skipTutorial()
            onTutorialWelcomeSkipped?.()
          }}
          onDontShowAgain={() => {
            localStorage.setItem('compareintel_welcome_dont_show_again', 'true')
          }}
          showDontShowAgain={true}
        />
      )}

      {currentView === 'main' && !isMobileLayout && (
        <TutorialController {...sharedControllerProps} />
      )}

      {currentView === 'main' && isMobileLayout && (
        <MobileTutorialController {...sharedControllerProps} />
      )}
    </>
  )
}
