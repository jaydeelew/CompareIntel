import { useEffect, useRef } from 'react'

import type { ModelConversation } from '../types'

interface UseTutorialEffectsConfig {
  tutorialState: {
    isActive: boolean
    currentStep: string | null
  }
  currentView: 'admin' | 'main'
  locationPathname: string
  conversations: ModelConversation[]
  isLoading: boolean
  isFollowUpMode: boolean
  isAuthenticated: boolean
}

interface UseTutorialEffectsCallbacks {
  setShowWelcomeModal: (show: boolean) => void
  setTutorialHasCompletedComparison: (completed: boolean) => void
}

export function useTutorialEffects(
  config: UseTutorialEffectsConfig,
  callbacks: UseTutorialEffectsCallbacks
) {
  const {
    tutorialState,
    currentView,
    locationPathname,
    conversations,
    isLoading,
    isFollowUpMode,
    isAuthenticated,
  } = config

  const { setShowWelcomeModal, setTutorialHasCompletedComparison } = callbacks

  const lastWelcomeModalPathnameRef = useRef<string | null>(null)
  const followUpSubmitInitiatedRef = useRef(false)

  // Welcome modal logic - show every time for unregistered users unless "Don't show again" is checked
  useEffect(() => {
    // Don't show for authenticated users or when tutorial is active
    if (isAuthenticated || tutorialState.isActive || currentView !== 'main') {
      if (currentView !== 'main') {
        lastWelcomeModalPathnameRef.current = null
      }
      return
    }

    const isNavigatingToMain = lastWelcomeModalPathnameRef.current !== locationPathname

    if (!isNavigatingToMain) {
      return
    }

    // Unified behavior for both mobile and non-mobile: show every time unless "Don't show again" is checked
    const dontShowAgain = localStorage.getItem('compareintel_welcome_dont_show_again')
    if (dontShowAgain !== 'true') {
      setShowWelcomeModal(true)
      lastWelcomeModalPathnameRef.current = locationPathname
    }
  }, [tutorialState.isActive, currentView, locationPathname, setShowWelcomeModal, isAuthenticated])

  useEffect(() => {
    if (
      tutorialState.currentStep === 'enter-prompt-2' ||
      tutorialState.currentStep === 'follow-up' ||
      tutorialState.currentStep === 'view-follow-up-results'
    ) {
      setTutorialHasCompletedComparison(false)
    }
  }, [tutorialState.currentStep, setTutorialHasCompletedComparison])

  useEffect(() => {
    if (tutorialState.currentStep !== 'follow-up') {
      followUpSubmitInitiatedRef.current = false
    } else if (isLoading) {
      followUpSubmitInitiatedRef.current = true
    }
  }, [tutorialState.currentStep, isLoading])

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
  }, [
    conversations,
    isLoading,
    tutorialState.currentStep,
    isFollowUpMode,
    setTutorialHasCompletedComparison,
  ])
}
