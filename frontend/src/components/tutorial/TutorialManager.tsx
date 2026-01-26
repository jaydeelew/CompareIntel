import { Suspense, lazy } from 'react'

import type { TutorialState, TutorialStep } from '../../hooks/useTutorial'
import type { ModelsByProvider } from '../../types/models'
import { LoadingSpinner } from '../shared'

const TutorialController = lazy(() =>
  import('./TutorialController').then(module => ({ default: module.TutorialController }))
)
const MobileTutorialController = lazy(() =>
  import('./MobileTutorialController').then(module => ({
    default: module.MobileTutorialController,
  }))
)
const TutorialWelcomeModal = lazy(() =>
  import('./TutorialWelcomeModal').then(module => ({ default: module.TutorialWelcomeModal }))
)

interface TutorialManagerProps {
  showWelcomeModal: boolean
  setShowWelcomeModal: (value: boolean) => void
  resetAppStateForTutorial: () => void
  startTutorial: () => void
  skipTutorial: () => void
  isTouchDevice: boolean
  currentView: 'main' | 'admin'
  isMobileLayout: boolean
  modelsByProvider: ModelsByProvider
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
  setTutorialHasCompletedComparison: (value: boolean) => void
  setTutorialHasBreakout: (value: boolean) => void
  setTutorialHasSavedSelection: (value: boolean) => void
}

export function TutorialManager({
  showWelcomeModal,
  setShowWelcomeModal,
  resetAppStateForTutorial,
  startTutorial,
  skipTutorial,
  isTouchDevice: _isTouchDevice,
  currentView,
  isMobileLayout,
  modelsByProvider,
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
  setTutorialHasCompletedComparison,
  setTutorialHasBreakout,
  setTutorialHasSavedSelection,
}: TutorialManagerProps) {
  const googleProviderExpanded = 'Google' in modelsByProvider && openDropdowns.has('Google')
  const googleModelIds = ['google/gemini-2.0-flash-001', 'google/gemini-2.5-flash']
  const googleModelsSelected = googleModelIds.every(modelId => selectedModels.includes(modelId))

  return (
    <>
      {showWelcomeModal && (
        <Suspense fallback={<LoadingSpinner />}>
          <TutorialWelcomeModal
            onStart={() => {
              setShowWelcomeModal(false)
              resetAppStateForTutorial()
              startTutorial()
            }}
            onSkip={() => {
              setShowWelcomeModal(false)
              skipTutorial()
            }}
            onDontShowAgain={() => {
              localStorage.setItem('compareintel_welcome_dont_show_again', 'true')
            }}
            showDontShowAgain={true}
          />
        </Suspense>
      )}

      {currentView === 'main' && !isMobileLayout && (
        <Suspense fallback={<LoadingSpinner />}>
          <TutorialController
            tutorialState={tutorialState}
            completeStep={completeStep}
            skipTutorial={skipTutorial}
            googleProviderExpanded={googleProviderExpanded}
            googleModelsSelected={googleModelsSelected}
            hasPromptText={input.trim().length > 0}
            hasCompletedComparison={tutorialHasCompletedComparison}
            isFollowUpMode={isFollowUpMode}
            hasBreakoutConversation={tutorialHasBreakout}
            showHistoryDropdown={showHistoryDropdown}
            hasSavedSelection={tutorialHasSavedSelection}
            isLoading={isLoading}
            onProviderExpanded={() => {}}
            onModelsSelected={() => {}}
            onPromptEntered={() => {}}
            onComparisonComplete={() => {
              setTutorialHasCompletedComparison(false)
            }}
            onFollowUpActivated={() => {}}
            onBreakoutCreated={() => {
              setTutorialHasBreakout(false)
            }}
            onHistoryOpened={() => {}}
            onSelectionSaved={() => {
              setTutorialHasSavedSelection(false)
            }}
          />
        </Suspense>
      )}

      {currentView === 'main' && isMobileLayout && (
        <Suspense fallback={<LoadingSpinner />}>
          <MobileTutorialController
            tutorialState={tutorialState}
            completeStep={completeStep}
            skipTutorial={skipTutorial}
            googleProviderExpanded={googleProviderExpanded}
            googleModelsSelected={googleModelsSelected}
            hasPromptText={input.trim().length > 0}
            hasCompletedComparison={tutorialHasCompletedComparison}
            isFollowUpMode={isFollowUpMode}
            hasBreakoutConversation={tutorialHasBreakout}
            showHistoryDropdown={showHistoryDropdown}
            hasSavedSelection={tutorialHasSavedSelection}
            isLoading={isLoading}
            onProviderExpanded={() => {}}
            onModelsSelected={() => {}}
            onPromptEntered={() => {}}
            onComparisonComplete={() => {
              setTutorialHasCompletedComparison(false)
            }}
            onFollowUpActivated={() => {}}
            onBreakoutCreated={() => {
              setTutorialHasBreakout(false)
            }}
            onHistoryOpened={() => {}}
            onSelectionSaved={() => {
              setTutorialHasSavedSelection(false)
            }}
          />
        </Suspense>
      )}
    </>
  )
}
