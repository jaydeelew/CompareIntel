import { useEffect, useRef } from 'react'

import type { ModelConversation } from '../types'

interface UseTutorialEffectsConfig {
  tutorialState: {
    isActive: boolean
    currentStep: string | null
  }
  currentView: 'admin' | 'main'
  isTouchDevice: boolean
  locationPathname: string
  conversations: ModelConversation[]
  isLoading: boolean
  isFollowUpMode: boolean
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
    isTouchDevice,
    locationPathname,
    conversations,
    isLoading,
    isFollowUpMode,
  } = config

  const { setShowWelcomeModal, setTutorialHasCompletedComparison } = callbacks

  const lastWelcomeModalPathnameRef = useRef<string | null>(null)

  // Welcome modal logic
  useEffect(() => {
    if (tutorialState.isActive || currentView !== 'main') {
      if (currentView !== 'main') {
        lastWelcomeModalPathnameRef.current = null
      }
      return
    }

    const isNavigatingToMain = lastWelcomeModalPathnameRef.current !== locationPathname

    if (!isNavigatingToMain) {
      return
    }

    if (isTouchDevice) {
      const dontShowAgain = localStorage.getItem('compareintel_mobile_welcome_dont_show_again')
      if (dontShowAgain !== 'true') {
        setShowWelcomeModal(true)
        lastWelcomeModalPathnameRef.current = locationPathname
      }
    } else {
      const hasSeenWelcome = localStorage.getItem('compareintel_tutorial_welcome_seen')
      if (!hasSeenWelcome) {
        setShowWelcomeModal(true)
        localStorage.setItem('compareintel_tutorial_welcome_seen', 'true')
        lastWelcomeModalPathnameRef.current = locationPathname
      }
    }
  }, [tutorialState.isActive, currentView, isTouchDevice, locationPathname, setShowWelcomeModal])

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
