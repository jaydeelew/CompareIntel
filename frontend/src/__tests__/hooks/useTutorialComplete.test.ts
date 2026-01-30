/**
 * Tests for useTutorialComplete hook
 *
 * Tests the combined tutorial hook that merges useTutorial and useTutorialEffects.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useTutorialComplete, type TutorialStep } from '../../hooks/useTutorialComplete'
import type { ModelConversation } from '../../types/conversation'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('useTutorialComplete', () => {
  const defaultConfig = {
    currentView: 'main' as const,
    locationPathname: '/',
    conversations: [],
    isLoading: false,
    isFollowUpMode: false,
    isAuthenticated: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  describe('initialization', () => {
    it('should initialize with tutorial inactive', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      expect(result.current.tutorialState.isActive).toBe(false)
      expect(result.current.tutorialState.currentStep).toBe(null)
      expect(result.current.tutorialState.completedSteps.size).toBe(0)
    })

    it('should initialize tutorial tracking flags as false', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      expect(result.current.tutorialHasCompletedComparison).toBe(false)
      expect(result.current.tutorialHasBreakout).toBe(false)
      expect(result.current.tutorialHasSavedSelection).toBe(false)
    })
  })

  describe('startTutorial', () => {
    it('should activate tutorial and set first step', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.startTutorial()
      })

      expect(result.current.tutorialState.isActive).toBe(true)
      expect(result.current.tutorialState.currentStep).toBe('expand-provider')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('compareintel_tutorial_completed')
    })
  })

  describe('completeStep', () => {
    it('should advance to next step when completing current step', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.startTutorial()
      })

      expect(result.current.tutorialState.currentStep).toBe('expand-provider')

      act(() => {
        result.current.completeStep('expand-provider')
      })

      expect(result.current.tutorialState.currentStep).toBe('select-models')
      expect(result.current.tutorialState.completedSteps.has('expand-provider')).toBe(true)
    })

    it('should not advance when completing wrong step', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.startTutorial()
      })

      act(() => {
        result.current.completeStep('select-models') // Wrong step
      })

      expect(result.current.tutorialState.currentStep).toBe('expand-provider')
    })

    it('should complete tutorial when all steps done', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      const steps: TutorialStep[] = [
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

      act(() => {
        result.current.startTutorial()
      })

      steps.forEach(step => {
        act(() => {
          result.current.completeStep(step)
        })
      })

      expect(result.current.tutorialState.isActive).toBe(false)
      expect(result.current.tutorialState.currentStep).toBe(null)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'compareintel_tutorial_completed',
        'true'
      )
    })
  })

  describe('skipTutorial', () => {
    it('should deactivate tutorial and mark as completed', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.startTutorial()
      })

      act(() => {
        result.current.skipTutorial()
      })

      expect(result.current.tutorialState.isActive).toBe(false)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'compareintel_tutorial_completed',
        'true'
      )
    })
  })

  describe('resetTutorial', () => {
    it('should reset tutorial state and clear storage', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.startTutorial()
        result.current.completeStep('expand-provider')
      })

      act(() => {
        result.current.resetTutorial()
      })

      expect(result.current.tutorialState.isActive).toBe(false)
      expect(result.current.tutorialState.completedSteps.size).toBe(0)
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('compareintel_tutorial_completed')
    })
  })

  describe('goToStep', () => {
    it('should directly set the current step', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.startTutorial()
      })

      act(() => {
        result.current.goToStep('enter-prompt')
      })

      expect(result.current.tutorialState.currentStep).toBe('enter-prompt')
    })
  })

  describe('welcome modal', () => {
    it('should show welcome modal for unauthenticated users on main view when not dismissed', () => {
      // The welcome modal is shown via an effect based on localStorage
      // When "don't show again" is not set, the modal should appear
      const { result } = renderHook(() =>
        useTutorialComplete({
          ...defaultConfig,
          isAuthenticated: false,
          currentView: 'main',
        })
      )

      // The effect runs and sets showWelcomeModal based on localStorage
      // Since localStorage doesn't have 'compareintel_welcome_dont_show_again' = 'true',
      // the modal should be shown
      expect(result.current.showWelcomeModal).toBe(true)
    })

    it('should not show welcome modal when dismissed via localStorage', () => {
      // Set the "don't show again" flag
      localStorageMock.setItem('compareintel_welcome_dont_show_again', 'true')

      const { result } = renderHook(() =>
        useTutorialComplete({
          ...defaultConfig,
          isAuthenticated: false,
          currentView: 'main',
        })
      )

      // Modal should not be shown because user dismissed it
      expect(result.current.showWelcomeModal).toBe(false)
    })

    it('should not show welcome modal for authenticated users', () => {
      const { result } = renderHook(() =>
        useTutorialComplete({
          ...defaultConfig,
          isAuthenticated: true,
        })
      )

      expect(result.current.showWelcomeModal).toBe(false)
    })

    it('should allow setting welcome modal visibility', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.setShowWelcomeModal(true)
      })

      expect(result.current.showWelcomeModal).toBe(true)

      act(() => {
        result.current.setShowWelcomeModal(false)
      })

      expect(result.current.showWelcomeModal).toBe(false)
    })
  })

  describe('tutorial tracking flags', () => {
    it('should allow setting tutorialHasCompletedComparison', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.setTutorialHasCompletedComparison(true)
      })

      expect(result.current.tutorialHasCompletedComparison).toBe(true)
    })

    it('should allow setting tutorialHasBreakout', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.setTutorialHasBreakout(true)
      })

      expect(result.current.tutorialHasBreakout).toBe(true)
    })

    it('should allow setting tutorialHasSavedSelection', () => {
      const { result } = renderHook(() => useTutorialComplete(defaultConfig))

      act(() => {
        result.current.setTutorialHasSavedSelection(true)
      })

      expect(result.current.tutorialHasSavedSelection).toBe(true)
    })
  })

  describe('comparison completion tracking effect', () => {
    it('should set tutorialHasCompletedComparison when submit-comparison step completes', () => {
      const { result, rerender } = renderHook(props => useTutorialComplete(props), {
        initialProps: defaultConfig,
      })

      // Start tutorial and go to submit step
      act(() => {
        result.current.startTutorial()
        result.current.goToStep('submit-comparison')
      })

      // Rerender with conversations (simulating comparison done)
      rerender({
        ...defaultConfig,
        conversations: [{ modelId: 'test', messages: [] }] as ModelConversation[],
        isLoading: false,
      })

      expect(result.current.tutorialHasCompletedComparison).toBe(true)
    })
  })
})
