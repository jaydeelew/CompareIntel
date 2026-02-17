/**
 * useMainPageEffects - Scroll, focus, history sync, and error effects for MainPage
 *
 * Extracts ~25 useEffects from MainPage into a single hook to reduce component size
 * and improve maintainability. Covers: error handling, focus management, history
 * sync, scroll-to behavior, and misc UI coordination.
 */

import { useEffect, useRef } from 'react'

import type { CompareResponse, ConversationSummary, ModelConversation } from '../types'
import { RESULT_TAB, createModelId } from '../types'
import { getSafeId } from '../utils'

import type { TutorialState } from './useTutorialComplete'

export interface UseMainPageEffectsConfig {
  // Error
  error: string | null
  setError: (err: string | null) => void
  errorMessageRef: React.RefObject<HTMLDivElement | null>
  scrollToCenterElement: (el: HTMLElement | null) => void

  // Tab index
  activeTabIndex: number
  visibleConversationsLength: number
  setActiveTabIndex: (index: number) => void

  // Focus
  isTouchDevice: boolean
  currentView: string
  showWelcomeModal: boolean
  tutorialState: TutorialState
  attemptFocusTextarea: () => boolean

  // History
  showHistoryDropdown: boolean
  setShowHistoryDropdown: (show: boolean) => void

  // History sync
  conversations: ModelConversation[]
  currentVisibleComparisonId: string | null
  isAuthenticated: boolean
  conversationHistory: ConversationSummary[]
  selectedModels: string[]
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>

  // Scroll - loading
  isLoading: boolean

  // Scroll - verification
  userVerified: boolean

  // Scroll - cards top
  isFollowUpMode: boolean
  activeResultTabs: Record<string, string>
  scrolledToTopRef: React.MutableRefObject<Set<string>>
  conversationsForScroll: ModelConversation[]

  // Scroll - results
  response: CompareResponse | null
  hasScrolledToResultsRef: React.MutableRefObject<boolean>
  followUpJustActivatedRef: React.MutableRefObject<boolean>
  shouldScrollToTopAfterFormattingRef: React.MutableRefObject<boolean>
  selectedModelsForScroll: string[]

  // Clear textarea errors
  input: string
}

export function useMainPageEffects(config: UseMainPageEffectsConfig) {
  const prevErrorRef = useRef<string | null>(null)

  const {
    error,
    setError,
    errorMessageRef,
    scrollToCenterElement,
    activeTabIndex,
    visibleConversationsLength,
    setActiveTabIndex,
    isTouchDevice,
    currentView,
    showWelcomeModal,
    tutorialState,
    attemptFocusTextarea,
    showHistoryDropdown,
    setShowHistoryDropdown,
    conversations,
    currentVisibleComparisonId,
    isAuthenticated,
    conversationHistory,
    selectedModels,
    setCurrentVisibleComparisonId,
    isLoading,
    userVerified,
    isFollowUpMode,
    activeResultTabs,
    scrolledToTopRef,
    conversationsForScroll,
    response,
    hasScrolledToResultsRef,
    followUpJustActivatedRef,
    shouldScrollToTopAfterFormattingRef,
    selectedModelsForScroll,
    input,
  } = config

  // Error scroll
  useEffect(() => {
    if (error && !prevErrorRef.current) {
      scrollToCenterElement(errorMessageRef.current)
    }
    prevErrorRef.current = error
  }, [error, scrollToCenterElement, errorMessageRef])

  // Error timeout (token too long)
  useEffect(() => {
    if (error?.includes('Your input is too long for one or more of the selected models')) {
      const timeoutId = setTimeout(() => setError(null), 20000)
      return () => clearTimeout(timeoutId)
    }
  }, [error, setError])

  // Active tab index reset
  useEffect(() => {
    if (activeTabIndex >= visibleConversationsLength && visibleConversationsLength > 0) {
      setActiveTabIndex(0)
    }
  }, [activeTabIndex, visibleConversationsLength, setActiveTabIndex])

  // Focus (RAF + staggered timeouts)
  useEffect(() => {
    if (isTouchDevice || currentView !== 'main' || showWelcomeModal || tutorialState.isActive) {
      return
    }
    let t1: ReturnType<typeof setTimeout> | null = null
    let t2: ReturnType<typeof setTimeout> | null = null
    let t3: ReturnType<typeof setTimeout> | null = null

    requestAnimationFrame(() => {
      if (attemptFocusTextarea()) return
      t1 = setTimeout(() => {
        if (attemptFocusTextarea()) return
        t2 = setTimeout(() => {
          if (attemptFocusTextarea()) return
          t3 = setTimeout(() => attemptFocusTextarea(), 500)
        }, 300)
      }, 100)
    })

    return () => {
      if (t1) clearTimeout(t1)
      if (t2) clearTimeout(t2)
      if (t3) clearTimeout(t3)
    }
  }, [isTouchDevice, currentView, showWelcomeModal, tutorialState.isActive, attemptFocusTextarea])

  // Focus (delayed retry on modal/tutorial close)
  useEffect(() => {
    if (!isTouchDevice && currentView === 'main' && !showWelcomeModal && !tutorialState.isActive) {
      const t = setTimeout(() => attemptFocusTextarea(), 200)
      return () => clearTimeout(t)
    }
  }, [showWelcomeModal, isTouchDevice, currentView, tutorialState.isActive, attemptFocusTextarea])

  // History dropdown close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        showHistoryDropdown &&
        !target.closest('.history-toggle-button') &&
        !target.closest('.history-inline-list')
      ) {
        setShowHistoryDropdown(false)
      }
    }
    if (showHistoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showHistoryDropdown, setShowHistoryDropdown])

  // Track visible comparison ID (history sync)
  useEffect(() => {
    if (conversations.length === 0 && !currentVisibleComparisonId) return

    if (isAuthenticated && conversationHistory.length > 0 && conversations.length > 0) {
      const firstUserMessage = conversations
        .flatMap(c => c.messages)
        .filter(m => m.type === 'user')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]

      if (!firstUserMessage?.content) return

      if (currentVisibleComparisonId) {
        const current = conversationHistory.find(s => String(s.id) === currentVisibleComparisonId)
        if (current) {
          const modelsMatch =
            JSON.stringify([...current.models_used].sort()) ===
            JSON.stringify([...selectedModels].sort())
          const inputMatch = current.input_data === firstUserMessage.content
          if (modelsMatch && inputMatch) return
        }
      }

      const matching = conversationHistory.find(s => {
        const modelsMatch =
          JSON.stringify([...s.models_used].sort()) === JSON.stringify([...selectedModels].sort())
        const inputMatch = s.input_data === firstUserMessage.content
        return modelsMatch && inputMatch
      })

      if (matching) {
        const id = String(matching.id)
        if (currentVisibleComparisonId !== id) setCurrentVisibleComparisonId(id)
      }
    }
  }, [
    isAuthenticated,
    conversationHistory,
    conversations,
    selectedModels,
    currentVisibleComparisonId,
    setCurrentVisibleComparisonId,
  ])

  // Scroll to loading section
  useEffect(() => {
    if (isLoading) {
      const t = setTimeout(() => {
        document.querySelector('.loading-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
      return () => clearTimeout(t)
    }
  }, [isLoading])

  // Clear verification errors
  useEffect(() => {
    if (userVerified && error?.includes('verify your email')) setError(null)
  }, [userVerified, error, setError])

  // Scroll cards to top on formatting
  useEffect(() => {
    if (isFollowUpMode) return

    Object.entries(activeResultTabs).forEach(([modelId, tab]) => {
      if (
        tab === RESULT_TAB.FORMATTED &&
        !scrolledToTopRef.current.has(modelId) &&
        conversationsForScroll.some(c => c.modelId === modelId)
      ) {
        scrolledToTopRef.current.add(modelId)
        setTimeout(() => {
          const el = document.querySelector(
            `#conversation-content-${getSafeId(modelId)}`
          ) as HTMLElement
          if (el) el.scrollTop = 0
        }, 200)
      }
    })
  }, [activeResultTabs, isFollowUpMode, conversationsForScroll, scrolledToTopRef])

  // Scroll to results
  useEffect(() => {
    const tutorialBlocking =
      tutorialState.isActive &&
      (tutorialState.currentStep === 'submit-comparison' ||
        tutorialState.currentStep === 'follow-up')

    if (
      response &&
      !isFollowUpMode &&
      !hasScrolledToResultsRef.current &&
      !error &&
      !tutorialBlocking
    ) {
      if (response.metadata?.models_successful === 0) return
      hasScrolledToResultsRef.current = true
      setTimeout(() => {
        document.querySelector('.results-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }, 300)
    }
  }, [
    response,
    isFollowUpMode,
    error,
    tutorialState.currentStep,
    tutorialState.isActive,
    hasScrolledToResultsRef,
  ])

  // Scroll all cards to top after formatting
  useEffect(() => {
    if (isFollowUpMode || !shouldScrollToTopAfterFormattingRef.current) return

    const allFormatted = selectedModelsForScroll.every(id => {
      const formattedId = createModelId(id)
      return activeResultTabs[formattedId] === RESULT_TAB.FORMATTED
    })
    const allExist = selectedModelsForScroll.every(id =>
      conversationsForScroll.some(c => c.modelId === createModelId(id))
    )

    if (allFormatted && allExist) {
      shouldScrollToTopAfterFormattingRef.current = false
      setTimeout(() => {
        selectedModelsForScroll.forEach(id => {
          const safeId = createModelId(id).replace(/[^a-zA-Z0-9_-]/g, '-')
          const el = document.querySelector(`#conversation-content-${safeId}`) as HTMLElement
          if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
        })
      }, 300)
    }
  }, [
    activeResultTabs,
    isFollowUpMode,
    conversationsForScroll,
    selectedModelsForScroll,
    shouldScrollToTopAfterFormattingRef,
  ])

  // Scroll after follow-up
  useEffect(() => {
    const tutorialLate =
      tutorialState.isActive &&
      (tutorialState.currentStep === 'submit-comparison-2' ||
        tutorialState.currentStep === 'view-follow-up-results' ||
        tutorialState.currentStep === 'history-dropdown' ||
        tutorialState.currentStep === 'save-selection')

    if (
      conversations.length > 0 &&
      isFollowUpMode &&
      !followUpJustActivatedRef.current &&
      !tutorialLate
    ) {
      setTimeout(() => {
        document.querySelector('.results-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }, 400)
    }
  }, [
    conversations.length,
    isFollowUpMode,
    tutorialState.currentStep,
    tutorialState.isActive,
    followUpJustActivatedRef,
  ])

  // Clear textarea errors
  useEffect(() => {
    if (input.trim().length > 0 && error === 'Please enter some text to compare') {
      setError(null)
    }
  }, [input, error, setError])
}
