import { useState, useCallback, useRef } from 'react'

import { buildTutorialRuntimeStepSequenceSameProvider } from '../data/tutorialStepPlan'

export type TutorialStep =
  | 'expand-provider'
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
export function useTutorial() {
  const runtimeStepSequenceRef = useRef<TutorialStep[]>(
    buildTutorialRuntimeStepSequenceSameProvider()
  )
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

  return {
    tutorialState,
    startTutorial,
    completeStep,
    skipTutorial,
    resetTutorial,
    goToStep,
  }
}
