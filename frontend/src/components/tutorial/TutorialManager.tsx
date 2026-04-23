import type { TutorialState, TutorialStep } from '../../hooks/useTutorial'
import type { User } from '../../types'
import type { ModelsByProvider } from '../../types/models'
import { countSelectableGoogleModelsInSelection } from '../../utils/modelTierAccess'

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
  /** True when any model has started streaming an answer (loading cutout switches to results). */
  streamAnswerStarted: boolean
  /** After user submits a follow-up on step 5 (mobile loading/streaming cutout gating). */
  followUpSubmitStarted: boolean
  setTutorialHasCompletedComparison: (value: boolean) => void
  setTutorialHasBreakout: (value: boolean) => void
  setTutorialHasSavedSelection: (value: boolean) => void
  /** Called when the user dismisses the welcome modal via “Skip for Now” (navbar fold timing). */
  onTutorialWelcomeSkipped?: () => void
}

export function TutorialManager({
  showWelcomeModal,
  setShowWelcomeModal,
  isAuthenticated,
  user,
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
  streamAnswerStarted,
  followUpSubmitStarted,
  setTutorialHasCompletedComparison,
  setTutorialHasBreakout,
  setTutorialHasSavedSelection,
  onTutorialWelcomeSkipped,
}: TutorialManagerProps) {
  const googleProviderExpanded = 'Google' in modelsByProvider && openDropdowns.has('Google')
  const selectableGoogleSelectedCount = countSelectableGoogleModelsInSelection(
    selectedModels,
    modelsByProvider,
    isAuthenticated,
    user
  )
  const googleModelsSelected = selectableGoogleSelectedCount >= 2

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
          streamAnswerStarted={streamAnswerStarted}
          onProviderExpanded={() => {}}
          onModelsSelected={() => {}}
          onPromptEntered={() => {}}
          onComparisonComplete={() => {
            setTutorialHasCompletedComparison(false)
          }}
          onFollowUpActivated={() => {
            setTutorialHasCompletedComparison(false)
          }}
          onBreakoutCreated={() => {
            setTutorialHasBreakout(false)
          }}
          onHistoryOpened={() => {}}
          onSelectionSaved={() => {
            setTutorialHasSavedSelection(false)
          }}
        />
      )}

      {currentView === 'main' && isMobileLayout && (
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
          streamAnswerStarted={streamAnswerStarted}
          followUpSubmitStarted={followUpSubmitStarted}
          onProviderExpanded={() => {}}
          onModelsSelected={() => {}}
          onPromptEntered={() => {}}
          onComparisonComplete={() => {
            setTutorialHasCompletedComparison(false)
          }}
          onFollowUpActivated={() => {
            setTutorialHasCompletedComparison(false)
          }}
          onBreakoutCreated={() => {
            setTutorialHasBreakout(false)
          }}
          onHistoryOpened={() => {}}
          onSelectionSaved={() => {
            setTutorialHasSavedSelection(false)
          }}
        />
      )}
    </>
  )
}
