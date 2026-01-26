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
  }, [
    conversations,
    isLoading,
    tutorialState.currentStep,
    isFollowUpMode,
    setTutorialHasCompletedComparison,
  ])

  // Reset completion flag when entering follow-up prompt step
  useEffect(() => {
    if (tutorialState.currentStep === 'enter-prompt-2') {
      setTutorialHasCompletedComparison(false)
    }
  }, [tutorialState.currentStep, setTutorialHasCompletedComparison])
}
