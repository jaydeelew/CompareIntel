import { useState, useCallback } from 'react'

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

export function useTutorial() {
  const [tutorialState, setTutorialState] = useState<TutorialState>(() => {
    // Check if user has completed tutorial
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY)
    if (completed === 'true') {
      return {
        isActive: false,
        currentStep: null,
        completedSteps: new Set<TutorialStep>(),
      }
    }

    return {
      isActive: false,
      currentStep: null,
      completedSteps: new Set<TutorialStep>(),
    }
  })

  const startTutorial = useCallback(() => {
    // Always remove the completion flag when starting tutorial
    // This ensures the tutorial can be restarted cleanly
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
        // Tutorial complete
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

  return {
    tutorialState,
    startTutorial,
    completeStep,
    skipTutorial,
    resetTutorial,
    goToStep,
  }
}
