import { useEffect, useMemo } from 'react'

import type { StarterModelEntry } from '../../data/tutorialStepPlan'
import type { TutorialStep, TutorialState } from '../../hooks/useTutorial'
import { shouldSuppressWelcomeModalForAutomation } from '../../hooks/useTutorialComplete'
import type { User } from '../../types'
import type { ModelsByProvider } from '../../types/models'
import { isAnyProviderExpanded } from '../../utils/starterSelectionModels'

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
  const providersForExpandCheck = useMemo(
    () => tutorialStarterEntries.map(e => e.provider).filter(Boolean),
    [tutorialStarterEntries]
  )
  const tutorialProviderExpanded = isAnyProviderExpanded(openDropdowns, providersForExpandCheck)

  const firstModelSelected =
    tutorialModelIds.length > 0 && selectedModels.includes(tutorialModelIds[0])
  const secondModelSelected =
    tutorialModelIds.length > 1 && selectedModels.includes(tutorialModelIds[1])
  const bothModelsSelected = firstModelSelected && secondModelSelected

  useEffect(() => {
    if (!shouldSuppressWelcomeModalForAutomation()) return
    const w = window as Window & { __TUTORIAL_CURRENT_STEP__?: TutorialStep | null }
    w.__TUTORIAL_CURRENT_STEP__ = tutorialState.isActive ? tutorialState.currentStep : null
  }, [tutorialState.isActive, tutorialState.currentStep])

  const sharedControllerProps = {
    tutorialState,
    completeStep,
    skipTutorial,
    tutorialProviderExpanded,
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
