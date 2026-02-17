import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const AdminPanel = lazy(() => import('../components/admin/AdminPanel'))
import {
  ComparisonForm,
  ComparisonView,
  LoadingSection,
  type AttachedFile,
  type StoredAttachedFile,
} from '../components/comparison'
import { Navigation, Hero, MockModeBanner, InstallPrompt } from '../components/layout'
import { ModelsArea, ModalManager, ResultsArea } from '../components/main-page'
import {
  CreditWarningBanner,
  DoneSelectingCard,
  ErrorBoundary,
  LoadingSpinner,
} from '../components/shared'
import { TrialExpiredBanner } from '../components/trial'
import { TutorialManager } from '../components/tutorial'
import { getCreditAllocation, getDailyCreditLimit } from '../config/constants'
import { useAuth } from '../contexts/AuthContext'
import {
  useConversationHistory,
  useBrowserFingerprint,
  useRateLimitStatus,
  useModelSelection,
  useModelComparison,
  useResponsive,
  useFileHandling,
  useConversationManager,
  useCreditWarningManager,
  useComparisonStreaming,
  useScrollManagement,
  useExport,
  useModelManagement,
  useScreenshotCopy,
  useDoneSelectingCard,
  useCreditsRemaining,
  useTokenReload,
  useAuthStateEffects,
  useAuthModals,
  useBreakoutConversation,
  useGeolocation,
  useTutorialComplete,
  useSavedSelectionsComplete,
  useTooltipManager,
  useMainPageEffects,
} from '../hooks'
import { ApiError } from '../services/api/errors'
import { getRateLimitStatus, resetRateLimit } from '../services/compareService'
import { getCreditBalance } from '../services/creditService'
import type { CreditBalance } from '../services/creditService'
import { getAvailableModels } from '../services/modelsService'
import type { ModelsByProvider, ResultTab, ActiveResultTabs } from '../types'
import { createModelId } from '../types'
import { generateBrowserFingerprint } from '../utils'
import { isErrorMessage } from '../utils/error'
import logger from '../utils/logger'
import { saveSessionState, onSaveStateEvent } from '../utils/sessionState'

export function MainPage() {
  const { isAuthenticated, user, refreshUser, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const currentView = location.pathname === '/admin' ? 'admin' : 'main'

  // Admin route guard
  useEffect(() => {
    if (location.pathname === '/admin' && !authLoading) {
      if (isAuthenticated === false) {
        navigate('/', { replace: true })
      } else if (
        isAuthenticated === true &&
        user !== null &&
        user !== undefined &&
        user.is_admin === false
      ) {
        navigate('/', { replace: true })
      }
    }
  }, [location.pathname, isAuthenticated, user, authLoading, navigate])

  const { browserFingerprint, setBrowserFingerprint } = useBrowserFingerprint()
  const { setUsageCount, fetchRateLimitStatus } = useRateLimitStatus({
    isAuthenticated,
    browserFingerprint,
  })
  const modelSelectionHook = useModelSelection({ isAuthenticated, user })
  const {
    selectedModels,
    setSelectedModels,
    originalSelectedModels,
    setOriginalSelectedModels,
    maxModelsLimit,
  } = modelSelectionHook

  // Note: Saved selections hook is called later (after useModelManagement)
  // to have access to all required dependencies

  const [accurateInputTokens, setAccurateInputTokens] = useState<number | null>(null)
  const [attachedFiles, setAttachedFilesState] = useState<(AttachedFile | StoredAttachedFile)[]>([])
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [defaultSelectionOverridden, setDefaultSelectionOverridden] = useState(false)

  const { userLocation } = useGeolocation({ isAuthenticated, user })

  const setAttachedFiles = useCallback((files: (AttachedFile | StoredAttachedFile)[]) => {
    setAttachedFilesState(files)
  }, [])

  const { expandFiles, extractFileContentForStorage } = useFileHandling()

  const comparisonHook = useModelComparison()
  const {
    input,
    setInput,
    isLoading,
    setIsLoading,
    error,
    setError,
    response,
    setResponse,
    setProcessingTime,
    conversations,
    setConversations,
    isFollowUpMode,
    setIsFollowUpMode,
    closedCards,
    setClosedCards,
    activeResultTabs,
    setActiveResultTabs,
    currentAbortController,
    setCurrentAbortController,
    userCancelledRef,
    followUpJustActivatedRef,
    hasScrolledToResultsRef,
    lastAlignedRoundRef,
    autoScrollPausedRef,
    scrollListenersRef,
    userInteractingRef,
    lastScrollTopRef,
    isScrollLocked,
    setIsScrollLocked,
    isScrollLockedRef,
    syncingFromElementRef,
    lastSyncTimeRef,
    getFirstUserMessage,
  } = comparisonHook

  const selectedModelsGridRef = useRef<HTMLDivElement>(null)
  const scrolledToTopRef = useRef<Set<string>>(new Set())
  const shouldScrollToTopAfterFormattingRef = useRef<boolean>(false)
  const hasScrolledToResultsOnFirstChunkRef = useRef<boolean>(false)
  const lastSubmittedInputRef = useRef<string>('')
  const [modelsByProvider, setModelsByProvider] = useState<ModelsByProvider>({})
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  // Track previous auth state to skip cache when auth changes (e.g., after login/registration)
  const prevIsAuthenticatedRef = useRef<boolean | null>(null)
  const [, setUserMessageTimestamp] = useState<string>('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isTouchDevice, isWideLayout, isMobileLayout } = useResponsive()
  const modelsSectionRef = useRef<HTMLDivElement>(null)
  const [isAnimatingButton, setIsAnimatingButton] = useState(false)
  const [isAnimatingTextarea, setIsAnimatingTextarea] = useState(false)
  const animationTimeoutRef = useRef<number | null>(null)
  const [isModelsHidden, setIsModelsHidden] = useState(false)
  const [hidePremiumModels, setHidePremiumModels] = useState(false)
  const [showPremiumModelsToggleModal, setShowPremiumModelsToggleModal] = useState(false)
  const [disabledButtonInfo, setDisabledButtonInfo] = useState<{
    button: 'collapse-all' | 'clear-all' | null
    message: string
  }>({ button: null, message: '' })
  const [disabledModelModalInfo, setDisabledModelModalInfo] = useState<{
    userTier: 'unregistered' | 'free'
    modelTierAccess: 'free' | 'paid'
    modelName?: string
  } | null>(null)
  const [modelErrors, setModelErrors] = useState<{ [key: string]: boolean }>({})
  const [anonymousCreditsRemaining, setAnonymousCreditsRemaining] = useState<number | null>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const {
    creditWarningMessage,
    setCreditWarningMessage,
    creditWarningType,
    setCreditWarningType,
    creditWarningDismissible,
    setCreditWarningDismissible,
    creditWarningMessageRef,
    getCreditWarningMessage,
    isLowCreditWarningDismissed,
    dismissLowCreditWarning,
  } = useCreditWarningManager()

  const { creditsRemaining } = useCreditsRemaining({
    isAuthenticated,
    user,
    creditBalance,
    anonymousCreditsRemaining,
    isFollowUpMode,
    setIsFollowUpMode,
  })

  const [, setAlreadyBrokenOutModels] = useState<Set<string>>(new Set())

  const { showExportMenu, setShowExportMenu, exportMenuRef, handleExport } = useExport({
    conversations,
    modelsByProvider,
    responseMetadata: response?.metadata,
    input,
    getFirstUserMessage,
  })

  const {
    openDropdowns,
    setOpenDropdowns,
    toggleDropdown,
    collapseAllDropdowns,
    toggleAllForProvider,
    handleModelToggle,
  } = useModelManagement({
    selectedModels,
    setSelectedModels,
    originalSelectedModels,
    maxModelsLimit,
    modelsByProvider,
    isAuthenticated,
    user,
    isFollowUpMode,
    error,
    setError,
    accurateInputTokens,
  })

  const switchResultTab = useCallback(
    (modelId: string, tab: ResultTab) => {
      setActiveResultTabs((prev: ActiveResultTabs) => ({
        ...prev,
        [modelId]: tab,
      }))
    },
    [setActiveResultTabs]
  )

  const { handleScreenshot, handleCopyResponse, handleCopyMessage } = useScreenshotCopy({
    conversations,
    activeResultTabs,
    switchResultTab,
  })

  // Combined tutorial hook (replaces useTutorial + useTutorialEffects)
  const {
    tutorialState,
    startTutorial,
    skipTutorial,
    completeStep,
    resetTutorial: _resetTutorial,
    showWelcomeModal,
    setShowWelcomeModal,
    tutorialHasCompletedComparison,
    setTutorialHasCompletedComparison,
    tutorialHasBreakout,
    setTutorialHasBreakout,
    tutorialHasSavedSelection,
    setTutorialHasSavedSelection,
  } = useTutorialComplete({
    currentView,
    locationPathname: location.pathname,
    conversations,
    isLoading,
    isFollowUpMode,
    isAuthenticated,
  })

  // Trial modal state (not part of tutorial)
  const [showTrialWelcomeModal, setShowTrialWelcomeModal] = useState(false)
  const [pendingTrialModalAfterVerification, setPendingTrialModalAfterVerification] =
    useState(false)
  const verificationCompletedAtRef = useRef<number | null>(null)

  const { showDoneSelectingCard, setShowDoneSelectingCard, handleDoneSelecting } =
    useDoneSelectingCard(
      {
        selectedModelsCount: selectedModels.length,
        isModelsHidden,
        isFollowUpMode,
        modelsSectionRef,
        tutorialIsActive: tutorialState.isActive,
      },
      {
        onCollapseAllDropdowns: collapseAllDropdowns,
        onSetIsModelsHidden: setIsModelsHidden,
        onFocusTextarea: () => textareaRef.current?.focus(),
      }
    )

  // Combined saved selections hook (replaces useSavedModelSelections + useSavedSelectionManager)
  const {
    savedSelections: savedModelSelections,
    deleteSelection: deleteModelSelection,
    setDefaultSelection,
    getDefaultSelection,
    defaultSelectionId,
    canSaveMore: canSaveMoreSelections,
    maxSelections: maxSavedSelections,
    handleSaveSelection: handleSaveModelSelection,
    handleLoadSelection: handleLoadModelSelection,
  } = useSavedSelectionsComplete(
    {
      userId: user?.id,
      tier: user?.subscription_tier ?? 'unregistered',
      selectedModels,
      modelsByProvider,
      maxModelsLimit,
      response,
      conversations,
      onSelectionSaved: () => {
        if (tutorialState.currentStep === 'save-selection') {
          setTutorialHasSavedSelection(true)
        }
      },
    },
    {
      setSelectedModels,
      setOpenDropdowns,
      setConversations,
      setResponse,
      setDefaultSelectionOverridden,
    }
  )

  // Helper to get the default selection ID (used by ComparisonForm)
  const getDefaultSelectionId = useCallback(() => defaultSelectionId, [defaultSelectionId])

  const errorMessageRef = useRef<HTMLDivElement>(null)

  const scrollToCenterElement = useCallback((element: HTMLElement | null) => {
    if (!element) return

    setTimeout(() => {
      const elementRect = element.getBoundingClientRect()
      const elementTop = elementRect.top + window.scrollY
      const elementHeight = elementRect.height
      const windowHeight = window.innerHeight

      const scrollPosition = elementTop - windowHeight / 2 + elementHeight / 2

      window.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: 'smooth',
      })
    }, 100)
  }, [])

  const handleDeleteActiveConversation = useCallback(() => {
    setIsFollowUpMode(false)
    setInput('')
    setConversations([])
    setResponse(null)
    setClosedCards(new Set())
    setError(null)
    setSelectedModels([])
    setOriginalSelectedModels([])
    setIsModelsHidden(false)
    setOpenDropdowns(new Set())
    setModelErrors({})
  }, [
    setIsFollowUpMode,
    setInput,
    setConversations,
    setResponse,
    setClosedCards,
    setError,
    setSelectedModels,
    setOriginalSelectedModels,
    setOpenDropdowns,
  ])

  const conversationHistoryHook = useConversationHistory({
    isAuthenticated,
    user,
    onDeleteActiveConversation: handleDeleteActiveConversation,
  })

  const {
    conversationHistory,
    setConversationHistory,
    isLoadingHistory,
    setIsLoadingHistory,
    historyLimit,
    currentVisibleComparisonId,
    setCurrentVisibleComparisonId,
    showHistoryDropdown,
    setShowHistoryDropdown,
    syncHistoryAfterComparison,
    loadHistoryFromAPI,
    saveConversationToLocalStorage,
    deleteConversation,
    loadHistoryFromLocalStorage,
  } = conversationHistoryHook

  const {
    setupScrollListener,
    cleanupScrollListener,
    justLoadedFromHistoryRef,
    isScrollingToTopFromHistoryRef,
    isPageScrollingRef,
  } = useScrollManagement({
    conversations,
    isLoadingHistory,
    isScrollLocked,
    autoScrollPausedRef,
    scrollListenersRef,
    userInteractingRef,
    lastScrollTopRef,
    isScrollLockedRef,
    syncingFromElementRef,
    lastSyncTimeRef,
  })

  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)

  const visibleConversations = useMemo(() => {
    return conversations.filter(
      conv =>
        conv &&
        conv.modelId &&
        selectedModels.includes(conv.modelId) &&
        !closedCards.has(conv.modelId)
    )
  }, [conversations, selectedModels, closedCards])

  const { modelErrorStates, modelProcessingStates } = useMemo(() => {
    const errorStates: Record<string, boolean> = {}
    const processingStates: Record<string, boolean> = {}

    conversations.forEach(conversation => {
      if (!conversation || !conversation.modelId) return

      const latestMessage = conversation.messages[conversation.messages.length - 1]
      const content = latestMessage?.content || ''

      const rawModelId = selectedModels?.find(m => createModelId(m) === conversation.modelId)

      const hasBackendError =
        (rawModelId && modelErrors[rawModelId] === true) ||
        modelErrors[conversation.modelId] === true

      const modelHasCompleted =
        (rawModelId && rawModelId in modelErrors) || conversation.modelId in modelErrors
      const isLoadingDone = !isLoading

      const isEmptyContent =
        content.trim().length === 0 &&
        latestMessage?.type === 'assistant' &&
        (modelHasCompleted || isLoadingDone)

      errorStates[conversation.modelId] = hasBackendError || isEmptyContent
      processingStates[conversation.modelId] = !modelHasCompleted && isLoading
    })

    return { modelErrorStates: errorStates, modelProcessingStates: processingStates }
  }, [conversations, selectedModels, modelErrors, isLoading])

  const attemptFocusTextarea = useCallback(() => {
    if (!isTouchDevice && currentView === 'main' && textareaRef.current) {
      const textarea = textareaRef.current
      const rect = textarea.getBoundingClientRect()
      const isVisible = rect.width > 0 && rect.height > 0
      const isNotDisabled = !textarea.disabled

      if (isVisible && isNotDisabled) {
        const hasBlockingModal = document.querySelector(
          '.tutorial-welcome-backdrop, .tutorial-backdrop, [role="dialog"]'
        )

        if (!hasBlockingModal) {
          textarea.focus()
          return true
        }
      }
    }
    return false
  }, [isTouchDevice, currentView])

  useMainPageEffects({
    error,
    setError,
    errorMessageRef,
    scrollToCenterElement,
    activeTabIndex,
    visibleConversationsLength: visibleConversations.length,
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
    userVerified: user?.is_verified ?? false,
    isFollowUpMode,
    activeResultTabs,
    scrolledToTopRef,
    conversationsForScroll: conversations,
    response,
    hasScrolledToResultsRef,
    followUpJustActivatedRef,
    shouldScrollToTopAfterFormattingRef,
    selectedModelsForScroll: selectedModels,
    input,
  })

  const { visibleTooltip, handleCapabilityTileTap } = useTooltipManager({ isMobileLayout })

  const authModals = useAuthModals({ isAuthenticated, user, authLoading })
  const {
    isAuthModalOpen,
    authModalMode,
    loginEmail,
    showVerificationCodeModal,
    setShowVerificationCodeModal,
    showVerificationSuccessModal,
    setShowVerificationSuccessModal,
    showPasswordReset,
    anonymousMockModeEnabled,
    openLogin,
    openRegister,
    closeAuthModal,
    handlePasswordResetClose,
    openLoginAfterVerificationCode,
    handleVerified,
  } = authModals

  const resetUsage = async () => {
    try {
      const currentDisplayedConversations = [...conversations]
      const currentDisplayedComparisonId = currentVisibleComparisonId

      try {
        await resetRateLimit(browserFingerprint || undefined)
        setError(null)

        if (isAuthenticated) {
          setConversationHistory([])
          setConversations(currentDisplayedConversations)
          if (currentDisplayedConversations.length > 0 && currentDisplayedComparisonId) {
            setCurrentVisibleComparisonId(currentDisplayedComparisonId)
          } else {
            setCurrentVisibleComparisonId(null)
          }

          await refreshUser()
        } else {
          setUsageCount(0)
          localStorage.removeItem('compareintel_usage')

          localStorage.removeItem('compareintel_conversation_history')
          const keysToRemove: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('compareintel_conversation_')) {
              keysToRemove.push(key)
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key))

          setConversationHistory([])
          setConversations(currentDisplayedConversations)
          if (currentDisplayedConversations.length > 0 && currentDisplayedComparisonId) {
            setCurrentVisibleComparisonId(currentDisplayedComparisonId)
          } else {
            setCurrentVisibleComparisonId(null)
          }

          await fetchRateLimitStatus()
        }
      } catch (error) {
        if (error instanceof ApiError) {
          logger.error(`Failed to reset: ${error.message}`)
        } else {
          logger.error('Reset error:', error)
        }
      }
    } catch (error) {
      logger.error('Unexpected error in resetUsage:', error)
    }
  }

  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).resetUsage = resetUsage
  }

  const allModels = Object.values(modelsByProvider).flat()

  // Breakout conversation hook - must be after allModels is defined
  const { breakoutPhase, handleBreakout } = useBreakoutConversation(
    {
      isAuthenticated,
      currentVisibleComparisonId,
      allModels,
      textareaRef,
    },
    {
      loadHistoryFromAPI,
      loadConversationFromLocalStorage: id => {
        const key = `compareintel_conversation_${id}`
        const data = localStorage.getItem(key)
        if (!data) return null
        try {
          return JSON.parse(data)
        } catch {
          return null
        }
      },
      loadHistoryFromLocalStorage,
      saveConversationToLocalStorage,
      setConversationHistory,
      setConversations,
      setSelectedModels,
      setOriginalSelectedModels,
      setClosedCards,
      setIsFollowUpMode,
      setCurrentVisibleComparisonId,
      setInput,
      setError,
      setIsModelsHidden,
      setAlreadyBrokenOutModels,
      setTutorialHasBreakout,
    }
  )

  const { loadConversation, loadConversationFromAPI, loadConversationFromLocalStorage } =
    useConversationManager({
      isAuthenticated,
      showHistoryDropdown,
      loadHistoryFromAPI,
      loadHistoryFromLocalStorage,
      setConversationHistory,
      setIsLoadingHistory,
      setAlreadyBrokenOutModels,
      setConversations,
      setSelectedModels,
      setOriginalSelectedModels,
      setInput,
      setIsFollowUpMode,
      setClosedCards,
      setResponse,
      error,
      setError,
      setShowHistoryDropdown,
      setIsModelsHidden,
      collapseAllDropdowns,
      justLoadedFromHistoryRef,
      setCurrentVisibleComparisonId,
      setModelErrors,
    })

  // Note: Tutorial effects are now handled by useTutorialComplete hook

  // Anonymous credits reset listener
  useEffect(() => {
    const handleAnonymousCreditsReset = async () => {
      if (!isAuthenticated) {
        if (browserFingerprint) {
          try {
            const creditBalance = await getCreditBalance(browserFingerprint)
            setAnonymousCreditsRemaining(creditBalance.credits_remaining)
            setCreditBalance(creditBalance)
          } catch (err) {
            logger.error('Failed to refresh credit balance after reset:', err)
            setAnonymousCreditsRemaining(50)
          }
        } else {
          setAnonymousCreditsRemaining(50)
        }

        setError(currentError => {
          if (
            currentError &&
            (currentError.includes("You've run out of credits") ||
              currentError.includes('run out of credits') ||
              (currentError.includes('credits') && currentError.includes('reset')))
          ) {
            return null
          }
          return currentError
        })
      }
    }

    window.addEventListener('anonymousCreditsReset', handleAnonymousCreditsReset)
    return () => {
      window.removeEventListener('anonymousCreditsReset', handleAnonymousCreditsReset)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, browserFingerprint])

  // Token count reload effect
  useTokenReload(
    {
      currentVisibleComparisonId,
      conversations,
      isAuthenticated,
    },
    {
      loadConversationFromAPI,
      loadConversationFromLocalStorage,
      setConversations,
    }
  )

  // Refresh usage on model selection
  useEffect(() => {
    if (selectedModels.length > 0 && !isLoading) {
      const timeoutId = setTimeout(() => {
        if (!isAuthenticated && browserFingerprint) {
          fetchRateLimitStatus()
        } else if (isAuthenticated) {
          refreshUser()
        }
      }, 300)

      return () => clearTimeout(timeoutId)
    }
  }, [
    selectedModels.length,
    isLoading,
    browserFingerprint,
    isAuthenticated,
    fetchRateLimitStatus,
    refreshUser,
  ])

  // Page scroll detection
  useEffect(() => {
    let lastPageScrollTop = window.scrollY || document.documentElement.scrollTop
    let scrollTimeout: number | null = null

    const handlePageWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement
      const isCardContent = target.closest('.conversation-content')
      if (isCardContent) {
        return
      }
    }

    const handlePageTouchStart = () => {
      // Touch events handled by card scroll listeners
    }

    const handlePageScroll = () => {
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollDelta = Math.abs(currentScrollTop - lastPageScrollTop)

      if (scrollDelta > 1) {
        isPageScrollingRef.current = true

        if (scrollTimeout !== null) {
          clearTimeout(scrollTimeout)
        }

        scrollTimeout = window.setTimeout(() => {
          isPageScrollingRef.current = false
          scrollTimeout = null
        }, 300)
      }

      lastPageScrollTop = currentScrollTop
    }

    document.addEventListener('wheel', handlePageWheel, { passive: true, capture: true })
    document.addEventListener('touchstart', handlePageTouchStart, { passive: true, capture: true })
    window.addEventListener('scroll', handlePageScroll, { passive: true })

    return () => {
      document.removeEventListener('wheel', handlePageWheel, { capture: true })
      document.removeEventListener('touchstart', handlePageTouchStart, { capture: true })
      window.removeEventListener('scroll', handlePageScroll)
      if (scrollTimeout !== null) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [isPageScrollingRef])

  // Cleanup scroll listeners
  useEffect(() => {
    const scrollListeners = scrollListenersRef.current
    const userInteracting = userInteractingRef.current
    const lastScrollTop = lastScrollTopRef.current

    return () => {
      scrollListeners.forEach((_listener, modelId) => {
        const safeId = modelId.replace(/[^a-zA-Z0-9_-]/g, '-')
        const conversationContent = document.querySelector(
          `#conversation-content-${safeId}`
        ) as HTMLElement
        const listenerSet = scrollListeners.get(modelId)

        if (conversationContent && listenerSet) {
          conversationContent.removeEventListener('scroll', listenerSet.scroll)
          conversationContent.removeEventListener('wheel', listenerSet.wheel)
          conversationContent.removeEventListener('touchstart', listenerSet.touchstart)
          conversationContent.removeEventListener('mousedown', listenerSet.mousedown)
        }
      })
      scrollListeners.clear()
      userInteracting.clear()
      lastScrollTop.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Align user sections across cards
  useEffect(() => {
    if (conversations.length === 0) return

    if (justLoadedFromHistoryRef.current || isScrollingToTopFromHistoryRef.current) return

    const firstConversation = conversations[0]
    const currentRound = firstConversation?.messages.filter(m => m.type === 'user').length || 0

    if (currentRound <= lastAlignedRoundRef.current) return

    const allModelsComplete = conversations.every(conv => {
      const userMessages = conv.messages.filter(m => m.type === 'user').length
      const aiMessages = conv.messages.filter(m => m.type === 'assistant').length
      return userMessages === currentRound && aiMessages === currentRound
    })

    if (!allModelsComplete) return

    setTimeout(() => {
      const cards = document.querySelectorAll('.result-card.conversation-card')
      if (cards.length === 0) return

      let maxOffsetTop = 0
      const scrollData: { element: HTMLElement; targetOffsetTop: number }[] = []

      cards.forEach(card => {
        const conversationContent = card.querySelector('.conversation-content') as HTMLElement
        if (!conversationContent) return

        const userMessages = conversationContent.querySelectorAll('.conversation-message.user')
        if (userMessages.length === 0) return

        const lastUserMessage = userMessages[userMessages.length - 1] as HTMLElement
        const offsetTop = lastUserMessage.offsetTop

        maxOffsetTop = Math.max(maxOffsetTop, offsetTop)
        scrollData.push({ element: conversationContent, targetOffsetTop: offsetTop })
      })

      scrollData.forEach(({ element }) => {
        element.scrollTo({
          top: maxOffsetTop,
          behavior: 'smooth',
        })
      })

      lastAlignedRoundRef.current = currentRound
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations])

  // Animation scroll handler
  useEffect(() => {
    const handleScroll = () => {
      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
      setIsAnimatingButton(false)
      setIsAnimatingTextarea(false)

      if (modelsSectionRef.current) {
        const rect = modelsSectionRef.current.getBoundingClientRect()
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          setIsAnimatingButton(false)
          setIsAnimatingTextarea(false)
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Input change animation handler
  useEffect(() => {
    if (input.length > 0 && (isAnimatingButton || isAnimatingTextarea)) {
      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
      setIsAnimatingButton(false)
      setIsAnimatingTextarea(false)
    }
  }, [input, isAnimatingButton, isAnimatingTextarea])

  // Listen for save state event (triggered before logout when "remember state" is enabled)
  useEffect(() => {
    if (!user) return

    const cleanup = onSaveStateEvent(() => {
      saveSessionState({
        input,
        isFollowUpMode,
        webSearchEnabled,
        response,
        selectedModels,
        conversations,
        userId: user.id,
      })
    })

    return cleanup
  }, [user, input, isFollowUpMode, webSearchEnabled, response, selectedModels, conversations])

  // Load usage and models on mount
  useEffect(() => {
    const initFingerprint = async () => {
      const fingerprint = await generateBrowserFingerprint()
      setBrowserFingerprint(fingerprint)

      try {
        if (isAuthenticated && user) {
          setUsageCount(user.credits_used_this_period || 0)

          try {
            const creditBalance = await getCreditBalance()
            setCreditBalance(creditBalance)
          } catch (error) {
            logger.error('Failed to fetch authenticated user credit balance:', error)
            if (user.monthly_credits_allocated !== undefined) {
              setCreditBalance({
                credits_allocated: user.monthly_credits_allocated || 0,
                credits_used_this_period: user.credits_used_this_period || 0,
                credits_remaining: Math.max(
                  0,
                  (user.monthly_credits_allocated || 0) - (user.credits_used_this_period || 0)
                ),
                total_credits_used: user.total_credits_used,
                credits_reset_at: user.credits_reset_at,
                billing_period_start: user.billing_period_start,
                billing_period_end: user.billing_period_end,
                period_type: user.billing_period_start ? 'monthly' : 'daily',
                subscription_tier: user.subscription_tier,
              })
            }
          }
        } else {
          try {
            const data = await getRateLimitStatus(fingerprint)
            const usageCount = data.daily_usage || data.fingerprint_usage || data.ip_usage || 0
            setUsageCount(usageCount)

            const today = new Date().toDateString()
            localStorage.setItem(
              'compareintel_usage',
              JSON.stringify({
                count: usageCount,
                date: today,
              })
            )

            try {
              const creditBalance = await getCreditBalance(fingerprint)
              setAnonymousCreditsRemaining(creditBalance.credits_remaining)
              setCreditBalance(creditBalance)
            } catch (error) {
              logger.error('Failed to fetch anonymous credit balance:', error)
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'CancellationError') {
              // Expected on unmount
            } else {
              logger.error('Failed to sync usage count from backend, using localStorage:', error)
            }
            const savedUsage = localStorage.getItem('compareintel_usage')
            const today = new Date().toDateString()

            if (savedUsage) {
              const usage = JSON.parse(savedUsage)
              if (usage.date === today) {
                setUsageCount(usage.count || 0)
              } else {
                setUsageCount(0)
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'CancellationError') {
          // Expected
        } else {
          logger.error('Failed to sync usage count with backend:', error)
        }
        const savedUsage = localStorage.getItem('compareintel_usage')
        const today = new Date().toDateString()

        if (savedUsage) {
          const usage = JSON.parse(savedUsage)
          if (usage.date === today) {
            setUsageCount(usage.count || 0)
          } else {
            setUsageCount(0)
          }
        }
      }
    }

    initFingerprint()

    const fetchModels = async () => {
      try {
        // Skip cache when auth state changes (e.g., after login/registration/logout)
        // This ensures we get fresh model data with correct trial_unlocked status
        const authStateChanged =
          prevIsAuthenticatedRef.current !== null &&
          prevIsAuthenticatedRef.current !== isAuthenticated
        const skipCache = authStateChanged

        const data = await getAvailableModels(skipCache)

        if (data.models_by_provider && Object.keys(data.models_by_provider).length > 0) {
          setModelsByProvider(data.models_by_provider)
        } else {
          logger.error('No models_by_provider data received')
          setError('No model data received from server')
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'CancellationError') {
          return
        }
        const msg = error instanceof Error ? error.message : String(error)
        const ctx = error instanceof ApiError ? `${error.status}: ${msg}` : error
        logger.error('Failed to fetch models:', ctx)
        setError(`Failed to fetch models: ${msg}`)
      } finally {
        setIsLoadingModels(false)
        // Update ref after fetch completes
        prevIsAuthenticatedRef.current = isAuthenticated
      }
    }

    fetchModels()
  }, [isAuthenticated, user, setBrowserFingerprint, setError, setUsageCount])

  // Load default selection
  useEffect(() => {
    if (isLoadingModels || Object.keys(modelsByProvider).length === 0) {
      return
    }

    if (defaultSelectionOverridden) {
      return
    }

    if (selectedModels.length > 0) {
      return
    }

    const defaultSelection = getDefaultSelection()
    if (!defaultSelection) {
      return
    }

    const modelIds = defaultSelection.modelIds

    const validModelIds = modelIds
      .map(id => String(id))
      .filter(modelId => {
        for (const providerModels of Object.values(modelsByProvider)) {
          const model = providerModels.find(m => String(m.id) === modelId)
          if (model) {
            const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
            const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)

            // Check if model is accessible: paid tiers can access all, trial_unlocked means trial user can access
            if (model.tier_access === 'paid' && !isPaidTier && !model.trial_unlocked) {
              return false
            }
            if (model.available === false) {
              return false
            }
            return true
          }
        }
        return false
      })

    const limitedModelIds = validModelIds.slice(0, maxModelsLimit)

    if (limitedModelIds.length > 0) {
      setSelectedModels(limitedModelIds)

      setOpenDropdowns(prev => {
        const newSet = new Set(prev)
        let hasChanges = false

        for (const [provider, providerModels] of Object.entries(modelsByProvider)) {
          if (providerModels) {
            const hasSelectedModels = providerModels.some(model =>
              limitedModelIds.includes(String(model.id))
            )

            if (hasSelectedModels && !newSet.has(provider)) {
              newSet.add(provider)
              hasChanges = true
            }
          }
        }

        return hasChanges ? newSet : prev
      })
    }
  }, [
    isLoadingModels,
    modelsByProvider,
    defaultSelectionOverridden,
    selectedModels.length,
    getDefaultSelection,
    maxModelsLimit,
    isAuthenticated,
    user,
    setSelectedModels,
    setOpenDropdowns,
  ])

  // Refetch credit balance
  useEffect(() => {
    if (!isAuthenticated && browserFingerprint && !user) {
      const shouldRefetch = anonymousCreditsRemaining === null || anonymousCreditsRemaining === 50
      if (shouldRefetch) {
        getCreditBalance(browserFingerprint)
          .then(balance => {
            if (balance.credits_remaining < 50) {
              setAnonymousCreditsRemaining(balance.credits_remaining)
              setCreditBalance(balance)
            }
          })
          .catch(error => {
            logger.error('Failed to refetch anonymous credit balance:', error)
          })
      }
    }
  }, [browserFingerprint, isAuthenticated, user, anonymousCreditsRemaining])

  // Selected models grid scroll chaining
  useEffect(() => {
    const grid = selectedModelsGridRef.current
    if (!grid) return

    const handleWheel = (e: WheelEvent) => {
      const isAtTop = grid.scrollTop === 0
      const isAtBottom = grid.scrollHeight - grid.scrollTop - grid.clientHeight < 1

      if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
        e.preventDefault()
        window.scrollBy({
          top: e.deltaY * 0.5,
          left: 0,
          behavior: 'auto',
        })
        return
      }
    }

    grid.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      grid.removeEventListener('wheel', handleWheel)
    }
  }, [selectedModels.length])

  // Auth state change effects (login/logout state reset)
  useAuthStateEffects(
    {
      isAuthenticated,
      userId: user?.id,
      currentAbortController,
    },
    {
      setError,
      setInput,
      setResponse,
      setIsLoading,
      setConversations,
      setProcessingTime,
      setIsFollowUpMode,
      setCurrentVisibleComparisonId,
      setSelectedModels,
      setOriginalSelectedModels,
      setClosedCards,
      setActiveResultTabs,
      setShowDoneSelectingCard,
      setIsModelsHidden,
      setIsScrollLocked,
      setOpenDropdowns,
      setDefaultSelectionOverridden,
      setCreditBalance,
      setAnonymousCreditsRemaining,
      setCurrentAbortController,
      setWebSearchEnabled,
      hasScrolledToResultsRef,
      shouldScrollToTopAfterFormattingRef,
    }
  )

  // Helper to get user-specific localStorage key for trial modal
  // This ensures each user gets their own "seen" flag
  const getTrialSeenKey = useCallback((email?: string) => {
    return email ? `trial-welcome-seen-${email}` : 'trial-welcome-seen'
  }, [])

  // Show trial welcome modal for users with active trial on page load/login
  // Note: For new registrations, the modal is shown via the 'registration-complete' event
  // This effect handles cases where user returns to the site while trial is still active
  const hasShownTrialModalRef = useRef(false)
  useEffect(() => {
    // Only run once per session and if user has active trial
    const trialSeenKey = getTrialSeenKey(user?.email)
    if (
      !hasShownTrialModalRef.current &&
      isAuthenticated &&
      user?.is_trial_active &&
      user?.is_verified &&
      !localStorage.getItem(trialSeenKey)
    ) {
      hasShownTrialModalRef.current = true
      // Delay to let page settle
      const timeout = setTimeout(() => {
        setShowTrialWelcomeModal(true)
      }, 1000)
      return () => clearTimeout(timeout)
    }
  }, [isAuthenticated, user?.is_trial_active, user?.is_verified, user?.email, getTrialSeenKey])

  // Listen for registration complete to refetch models (trial modal shown after verification)
  useEffect(() => {
    const handleRegistrationComplete = async () => {
      // Refetch models with cache bypass to get trial_unlocked status
      try {
        const data = await getAvailableModels(true) // Skip cache for fresh trial status
        if (data.models_by_provider && Object.keys(data.models_by_provider).length > 0) {
          setModelsByProvider(data.models_by_provider)
        }
      } catch (error) {
        logger.error('Failed to refetch models after registration:', error)
      }
      // Note: Trial welcome modal is shown after email verification, not registration
    }

    window.addEventListener('registration-complete', handleRegistrationComplete)
    return () => window.removeEventListener('registration-complete', handleRegistrationComplete)
  }, [])

  // Listen for verification complete to refetch models and schedule trial modal
  useEffect(() => {
    const handleVerificationComplete = async () => {
      // Record verification completion time for banner delay calculation
      verificationCompletedAtRef.current = Date.now()
      setPendingTrialModalAfterVerification(true)

      // Refetch models with cache bypass immediately
      try {
        const data = await getAvailableModels(true) // Skip cache for fresh trial status
        if (data.models_by_provider && Object.keys(data.models_by_provider).length > 0) {
          setModelsByProvider(data.models_by_provider)
        }
      } catch (error) {
        logger.error('Failed to refetch models after verification:', error)
      }

      // Actual modal display is handled in the effect below once user.is_verified updates
    }

    window.addEventListener('verification-complete', handleVerificationComplete)
    return () => window.removeEventListener('verification-complete', handleVerificationComplete)
  }, [user?.email, getTrialSeenKey])

  // Show trial modal after verification once user state is updated and success modal is closed
  useEffect(() => {
    if (!pendingTrialModalAfterVerification || !user?.is_verified) {
      return
    }

    // Don't show trial modal while success modal is still visible
    if (showVerificationSuccessModal) {
      return
    }

    const trialSeenKey = getTrialSeenKey(user?.email)
    if (localStorage.getItem(trialSeenKey)) {
      setPendingTrialModalAfterVerification(false)
      return
    }

    // Small delay after success modal closes before showing trial modal
    const timeout = setTimeout(() => {
      setShowTrialWelcomeModal(true)
      setPendingTrialModalAfterVerification(false)
    }, 500)

    return () => clearTimeout(timeout)
  }, [
    pendingTrialModalAfterVerification,
    user?.is_verified,
    user?.email,
    getTrialSeenKey,
    showVerificationSuccessModal,
  ])

  const resetAppStateForTutorial = () => {
    setInput('')
    setSelectedModels([])
    setOriginalSelectedModels([])
    setOpenDropdowns(new Set())
    setDefaultSelectionOverridden(true)
    setIsFollowUpMode(false)
    setConversations([])
    setResponse(null)
    setError(null)
    setClosedCards(new Set())
    setIsModelsHidden(false)
  }

  // Track model selection changes for default override. When user deselects models,
  // hide the default selection name from the toolbar. When selectedModels is empty
  // during initial load (models still loading), do not set overridden=true so the
  // Load default selection effect can run first and populate selectedModels.
  useEffect(() => {
    const defaultSelection = getDefaultSelection()
    if (!defaultSelection) {
      return
    }

    if (selectedModels.length === 0) {
      // During initial load, models may not be loaded yet - don't set overridden
      // so the Load default selection effect can run and populate selectedModels
      const stillLoading = isLoadingModels || Object.keys(modelsByProvider).length === 0
      if (stillLoading) {
        return
      }
      // User deselected all models - hide default name since selection doesn't match
      setDefaultSelectionOverridden(true)
      return
    }

    const defaultModelIds = defaultSelection.modelIds.map(id => String(id)).sort()
    const currentModelIds = [...selectedModels].sort()

    const matchesDefault =
      defaultModelIds.length === currentModelIds.length &&
      defaultModelIds.every((id, index) => id === currentModelIds[index])

    if (matchesDefault) {
      setDefaultSelectionOverridden(false)
    } else {
      setDefaultSelectionOverridden(true)
    }
  }, [selectedModels, getDefaultSelection, isLoadingModels, modelsByProvider])

  const handleCancel = () => {
    if (currentAbortController) {
      userCancelledRef.current = true
      currentAbortController.abort()
      setCurrentAbortController(null)
      setIsLoading(false)
    }
  }

  const closeResultCard = (modelId: string) => {
    setClosedCards(prev => new Set(prev).add(modelId))
  }

  const hideAllOtherModels = (currentModelId: string) => {
    const otherModelIds = conversations
      .map(conv => conv.modelId)
      .filter(id => id !== currentModelId)

    setClosedCards(prev => {
      const newSet = new Set(prev)
      otherModelIds.forEach(id => newSet.add(id))
      return newSet
    })
  }

  const showAllResults = () => {
    setClosedCards(new Set())
  }

  const isModelFailed = (modelId: string): boolean => {
    const formattedModelId = createModelId(modelId)

    if (modelErrors[modelId] === true || modelErrors[formattedModelId] === true) {
      return true
    }

    const conversation = conversations.find(
      conv => conv.modelId === modelId || conv.modelId === formattedModelId
    )
    if (conversation) {
      const assistantMessages = conversation.messages.filter(msg => msg.type === 'assistant')
      if (assistantMessages.length === 0) return true
      const latestMessage = assistantMessages[assistantMessages.length - 1]
      if (
        latestMessage &&
        (isErrorMessage(latestMessage.content) || !(latestMessage.content || '').trim())
      ) {
        return true
      }
    }

    return false
  }

  const getSuccessfulModels = (models: string[]): string[] => {
    return models.filter(modelId => !isModelFailed(modelId))
  }

  const isFollowUpDisabled = () => {
    if (originalSelectedModels.length === 0) {
      return false
    }

    const hasNewModels = selectedModels.some(model => !originalSelectedModels.includes(model))

    if (hasNewModels) {
      return true
    }

    const successfulModels = getSuccessfulModels(originalSelectedModels)
    if (successfulModels.length === 0) {
      return true
    }

    return false
  }

  const handleFollowUp = () => {
    followUpJustActivatedRef.current = true
    setIsFollowUpMode(true)
    if (!input.trim()) {
      setInput('')
    }
    setIsModelsHidden(true)

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })

    setTimeout(() => {
      const inputSection = document.querySelector('.input-section')
      if (inputSection) {
        const heading = inputSection.querySelector('h2')
        if (heading) {
          heading.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        } else {
          inputSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
      }
      followUpJustActivatedRef.current = false
    }, 250)

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    }, 650)
  }

  const handleContinueConversation = () => {
    handleSubmitClick()
  }

  const handleNewComparison = () => {
    setIsFollowUpMode(false)
    if (!input.trim()) {
      setInput('')
    }
    setDefaultSelectionOverridden(false)
    setSelectedModels([])
    collapseAllDropdowns()
    setConversations([])
    setResponse(null)
    setClosedCards(new Set())
    setError(null)
    setOriginalSelectedModels([])
    setIsModelsHidden(false)
    setCurrentVisibleComparisonId(null)
    setModelErrors({})
    hasScrolledToResultsOnFirstChunkRef.current = false
    setAttachedFiles([])
  }

  const scrollConversationsToBottom = () => {
    setTimeout(() => {
      const conversationContents = document.querySelectorAll('.conversation-content')
      conversationContents.forEach(content => {
        const userMessages = content.querySelectorAll('.conversation-message.user')
        if (userMessages.length > 0) {
          const lastUserMessage = userMessages[userMessages.length - 1]

          const messageRect = lastUserMessage.getBoundingClientRect()
          const containerRect = content.getBoundingClientRect()
          const relativeTop = messageRect.top - containerRect.top + content.scrollTop

          content.scrollTo({
            top: relativeTop,
            behavior: 'smooth',
          })
        } else {
          content.scrollTop = content.scrollHeight
        }
      })
    }, 100)
  }

  const { submitComparison } = useComparisonStreaming(
    {
      isAuthenticated,
      user,
      browserFingerprint,
      selectedModels,
      modelsByProvider,
      originalSelectedModels,
      input,
      attachedFiles,
      accurateInputTokens,
      webSearchEnabled,
      userLocation,
      conversations,
      isFollowUpMode,
      currentVisibleComparisonId,
      creditBalance,
      anonymousCreditsRemaining,
      creditWarningType,
      modelErrors,
      tutorialState,
      userCancelledRef,
      hasScrolledToResultsRef,
      hasScrolledToResultsOnFirstChunkRef,
      scrolledToTopRef,
      shouldScrollToTopAfterFormattingRef,
      autoScrollPausedRef,
      userInteractingRef,
      lastScrollTopRef,
      lastAlignedRoundRef,
      isPageScrollingRef,
      scrollListenersRef,
      lastSubmittedInputRef,
    },
    {
      setError,
      setIsLoading,
      setResponse,
      setProcessingTime,
      setClosedCards,
      setModelErrors,
      setActiveResultTabs,
      setConversations,
      setInput,
      setIsModelsHidden,
      setShowDoneSelectingCard,
      setUserMessageTimestamp,
      setCurrentAbortController,
      setOriginalSelectedModels,
      setCurrentVisibleComparisonId,
      setAlreadyBrokenOutModels,
      setIsScrollLocked,
      setUsageCount,
      setIsFollowUpMode,
      setAnonymousCreditsRemaining,
      setCreditBalance,
      setCreditWarningMessage,
      setCreditWarningType,
      setCreditWarningDismissible,
      expandFiles,
      extractFileContentForStorage,
      setupScrollListener,
      cleanupScrollListener,
      saveConversationToLocalStorage,
      syncHistoryAfterComparison,
      loadHistoryFromAPI,
      getFirstUserMessage,
      getCreditWarningMessage,
      isLowCreditWarningDismissed,
      scrollConversationsToBottom,
      refreshUser,
    }
  )

  const handleSubmitClick = () => {
    if (error && error.includes('Your input is too long for one or more of the selected models')) {
      setError(null)
    }

    if (animationTimeoutRef.current !== null) {
      window.clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = null
    }
    setIsAnimatingButton(false)
    setIsAnimatingTextarea(false)

    if (user && !user.is_verified) {
      setError(
        'Please verify your email address before making comparisons. Check your inbox for a verification link from CompareIntel.'
      )
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
    const creditsAllocated =
      creditBalance?.credits_allocated ??
      (isAuthenticated && user
        ? user.monthly_credits_allocated || getCreditAllocation(userTier)
        : getDailyCreditLimit(userTier) || getCreditAllocation(userTier))

    let currentCreditsRemaining: number
    if (!isAuthenticated && anonymousCreditsRemaining !== null) {
      currentCreditsRemaining = anonymousCreditsRemaining
    } else if (creditBalance !== null) {
      currentCreditsRemaining = creditBalance.credits_remaining
    } else if (isAuthenticated && user) {
      currentCreditsRemaining = Math.max(
        0,
        (user.monthly_credits_allocated || creditsAllocated) - (user.credits_used_this_period || 0)
      )
    } else {
      currentCreditsRemaining = creditsAllocated
    }

    if (currentCreditsRemaining <= 0) {
      const resetAt = creditBalance?.credits_reset_at
      const message = getCreditWarningMessage('insufficient', userTier, 0, 0, resetAt)

      setError(message)
      setCreditWarningMessage(null)
      setCreditWarningType('insufficient')

      return
    }

    submitComparison()
  }

  const renderUsagePreview = useCallback(() => {
    const regularToUse = selectedModels.length

    return (
      <div
        style={{
          marginTop: '0.5rem',
          fontSize: '0.825rem',
          color: 'rgba(255, 255, 255, 0.85)',
        }}
      >
        <span>
          <strong>{regularToUse}</strong> {regularToUse === 1 ? 'model' : 'models'} selected •{' '}
          <strong>{Math.round(creditsRemaining)}</strong> credits remaining
        </span>
      </div>
    )
  }, [selectedModels, creditsRemaining])

  return (
    <div className="app">
      {user?.mock_mode_enabled && currentView === 'main' && (
        <MockModeBanner isAnonymous={false} isDev={import.meta.env.DEV} />
      )}

      {!authLoading && !user && anonymousMockModeEnabled && currentView === 'main' && (
        <MockModeBanner isAnonymous={true} isDev={true} />
      )}

      {currentView === 'admin' && user?.is_admin ? (
        <Suspense
          fallback={<LoadingSpinner size="large" modern={true} message="Loading admin panel..." />}
        >
          <AdminPanel onClose={() => navigate('/')} />
        </Suspense>
      ) : (
        <>
          {showDoneSelectingCard && <DoneSelectingCard onDone={handleDoneSelecting} />}

          <Navigation
            isAuthenticated={isAuthenticated}
            isAdmin={user?.is_admin || false}
            currentView={currentView}
            onViewChange={view => navigate(view === 'admin' ? '/admin' : '/')}
            onSignInClick={openLogin}
            onSignUpClick={openRegister}
          />

          <ModalManager
            isAuthModalOpen={isAuthModalOpen}
            authModalMode={authModalMode}
            loginEmail={loginEmail}
            onAuthModalClose={closeAuthModal}
            showVerificationCodeModal={showVerificationCodeModal}
            showVerificationSuccessModal={showVerificationSuccessModal}
            showPasswordReset={showPasswordReset}
            userEmail={user?.email}
            onVerificationCodeModalClose={() => setShowVerificationCodeModal(false)}
            onVerificationCodeModalUseDifferentEmail={openLoginAfterVerificationCode}
            onVerificationComplete={handleVerified}
            onVerificationSuccessModalClose={() => setShowVerificationSuccessModal(false)}
            onPasswordResetClose={handlePasswordResetClose}
            showPremiumModelsToggleModal={showPremiumModelsToggleModal}
            onPremiumModelsModalClose={() => {
              setShowPremiumModelsToggleModal(false)
              setHidePremiumModels(!hidePremiumModels)
            }}
            onPremiumModelsDontShowAgain={checked => {
              if (checked) {
                localStorage.setItem('premium-models-toggle-info-dismissed', 'true')
              } else {
                localStorage.removeItem('premium-models-toggle-info-dismissed')
              }
            }}
            disabledButtonInfo={disabledButtonInfo}
            onDisabledButtonInfoClose={() => setDisabledButtonInfo({ button: null, message: '' })}
            showTrialWelcomeModal={showTrialWelcomeModal}
            trialEndsAt={user?.trial_ends_at}
            trialUserEmail={user?.email}
            onTrialWelcomeModalClose={() => setShowTrialWelcomeModal(false)}
            disabledModelModalInfo={disabledModelModalInfo}
            onDisabledModelModalClose={() => setDisabledModelModalInfo(null)}
            onToggleHidePremiumModels={() => setHidePremiumModels(true)}
            onOpenSignUp={openRegister}
          />

          <ComparisonView>
            <Hero visibleTooltip={visibleTooltip} onCapabilityTileTap={handleCapabilityTileTap}>
              <ErrorBoundary>
                <ComparisonForm
                  input={input}
                  setInput={setInput}
                  textareaRef={textareaRef}
                  isFollowUpMode={isFollowUpMode}
                  isLoading={isLoading}
                  isAnimatingButton={isAnimatingButton}
                  isAnimatingTextarea={isAnimatingTextarea}
                  isAuthenticated={isAuthenticated}
                  user={user}
                  conversations={conversations}
                  historyProps={{
                    showHistoryDropdown,
                    setShowHistoryDropdown,
                    conversationHistory,
                    isLoadingHistory,
                    historyLimit,
                    currentVisibleComparisonId,
                    onLoadConversation: loadConversation,
                    onDeleteConversation: deleteConversation,
                  }}
                  onSubmitClick={handleSubmitClick}
                  onContinueConversation={handleContinueConversation}
                  onNewComparison={handleNewComparison}
                  renderUsagePreview={renderUsagePreview}
                  selectedModels={selectedModels}
                  modelsByProvider={modelsByProvider}
                  onAccurateTokenCountChange={setAccurateInputTokens}
                  creditsRemaining={creditsRemaining}
                  selectionProps={{
                    savedModelSelections,
                    onSaveModelSelection: handleSaveModelSelection,
                    onLoadModelSelection: handleLoadModelSelection,
                    onDeleteModelSelection: deleteModelSelection,
                    onSetDefaultSelection: setDefaultSelection,
                    getDefaultSelectionId,
                    getDefaultSelection,
                    defaultSelectionOverridden,
                    canSaveMoreSelections,
                    maxSavedSelections,
                  }}
                  fileProps={{
                    attachedFiles,
                    setAttachedFiles,
                    onExpandFiles: expandFiles,
                  }}
                  webSearchEnabled={webSearchEnabled}
                  onWebSearchEnabledChange={setWebSearchEnabled}
                  tutorialStep={tutorialState.currentStep}
                  tutorialIsActive={tutorialState.isActive}
                  modelsSectionRef={modelsSectionRef}
                />
              </ErrorBoundary>
            </Hero>

            <CreditWarningBanner
              message={creditWarningMessage}
              messageRef={creditWarningMessageRef}
              isDismissible={creditWarningDismissible}
              creditBalance={creditBalance}
              onDismiss={() => {
                const userTier = isAuthenticated
                  ? user?.subscription_tier || 'free'
                  : 'unregistered'
                const periodType =
                  userTier === 'unregistered' || userTier === 'free' ? 'daily' : 'monthly'
                dismissLowCreditWarning(userTier, periodType, creditBalance?.credits_reset_at)
              }}
            />

            {/* Trial expired banner - show when user has trial_ends_at but is_trial_active is false */}
            {isAuthenticated && user?.trial_ends_at && !user?.is_trial_active && (
              <TrialExpiredBanner
                trialEndsAt={user.trial_ends_at}
                onDismiss={() => {
                  // Banner handles its own localStorage dismissal
                }}
              />
            )}

            {error && (
              <div className="error-message" ref={errorMessageRef}>
                <span>⚠️ {error}</span>
              </div>
            )}

            <ModelsArea
              modelsByProvider={modelsByProvider}
              selectedModels={selectedModels}
              originalSelectedModels={originalSelectedModels}
              openDropdowns={openDropdowns}
              allModels={allModels}
              isLoadingModels={isLoadingModels}
              isFollowUpMode={isFollowUpMode}
              maxModelsLimit={maxModelsLimit}
              hidePremiumModels={hidePremiumModels}
              isModelsHidden={isModelsHidden}
              isAuthenticated={isAuthenticated}
              user={user}
              isWideLayout={isWideLayout}
              isMobileLayout={isMobileLayout}
              response={response}
              conversations={conversations}
              modelsSectionRef={modelsSectionRef}
              selectedModelsGridRef={selectedModelsGridRef}
              onToggleDropdown={toggleDropdown}
              onToggleModel={handleModelToggle}
              onToggleAllForProvider={toggleAllForProvider}
              onToggleModelsHidden={() => setIsModelsHidden(!isModelsHidden)}
              onToggleHidePremiumModels={() => setHidePremiumModels(!hidePremiumModels)}
              onShowPremiumModelsModal={() => setShowPremiumModelsToggleModal(true)}
              onCollapseAllDropdowns={collapseAllDropdowns}
              onShowDisabledButtonInfo={setDisabledButtonInfo}
              onClearAllModels={() => setSelectedModels([])}
              onSetDefaultSelectionOverridden={setDefaultSelectionOverridden}
              onClearConversations={() => setConversations([])}
              onClearResponse={() => setResponse(null)}
              onExpandModelsSection={() => setIsModelsHidden(false)}
              onError={setError}
              onShowDisabledModelModal={info => setDisabledModelModalInfo(info)}
            />

            {isLoading && (
              <LoadingSection selectedModelsCount={selectedModels.length} onCancel={handleCancel} />
            )}

            {(response || conversations.length > 0) && (
              <ResultsArea
                conversations={conversations}
                selectedModels={selectedModels}
                closedCards={closedCards}
                allModels={allModels}
                activeResultTabs={activeResultTabs}
                modelProcessingStates={modelProcessingStates}
                modelErrorStates={modelErrorStates}
                breakoutPhase={breakoutPhase}
                isScrollLocked={isScrollLocked}
                isFollowUpMode={isFollowUpMode}
                isFollowUpDisabled={isFollowUpDisabled()}
                followUpDisabledReason="Cannot follow up when new models are selected. You can follow up if you only deselect models from the original comparison."
                showExportMenu={showExportMenu}
                isMobileLayout={isMobileLayout}
                isTutorialActive={tutorialState.isActive}
                exportMenuRef={exportMenuRef}
                onToggleScrollLock={() => setIsScrollLocked(!isScrollLocked)}
                onFollowUp={handleFollowUp}
                onToggleExportMenu={() => setShowExportMenu(!showExportMenu)}
                onExport={handleExport}
                onShowAllResults={showAllResults}
                onScreenshot={handleScreenshot}
                onCopyResponse={handleCopyResponse}
                onCloseCard={closeResultCard}
                onSwitchTab={switchResultTab}
                onBreakout={handleBreakout}
                onHideOthers={hideAllOtherModels}
                onCopyMessage={handleCopyMessage}
              />
            )}
          </ComparisonView>

          {import.meta.env.PROD && <InstallPrompt />}

          <TutorialManager
            showWelcomeModal={showWelcomeModal}
            setShowWelcomeModal={setShowWelcomeModal}
            resetAppStateForTutorial={resetAppStateForTutorial}
            startTutorial={startTutorial}
            skipTutorial={skipTutorial}
            isTouchDevice={isTouchDevice}
            currentView={currentView}
            isMobileLayout={isMobileLayout}
            modelsByProvider={modelsByProvider}
            openDropdowns={openDropdowns}
            selectedModels={selectedModels}
            input={input}
            tutorialState={tutorialState}
            completeStep={completeStep}
            isFollowUpMode={isFollowUpMode}
            tutorialHasCompletedComparison={tutorialHasCompletedComparison}
            tutorialHasBreakout={tutorialHasBreakout}
            tutorialHasSavedSelection={tutorialHasSavedSelection}
            showHistoryDropdown={showHistoryDropdown}
            isLoading={isLoading}
            setTutorialHasCompletedComparison={setTutorialHasCompletedComparison}
            setTutorialHasBreakout={setTutorialHasBreakout}
            setTutorialHasSavedSelection={setTutorialHasSavedSelection}
          />
        </>
      )}
    </div>
  )
}
