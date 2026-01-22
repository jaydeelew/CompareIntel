import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'

// Import all CSS modules directly (better for Vite than CSS @import)
import './styles/variables.css'
import './styles/base.css'
import './styles/animations.css'
import './styles/banners.css'
import './styles/components.css'
import './styles/navigation.css'
import './styles/layout.css'
import './styles/responsive.css'
import './styles/hero.css'
import './styles/models.css'
import './styles/results.css'
import './App.css'
// Lazy load heavy components for code splitting
const AdminPanel = lazy(() => import('./components/admin/AdminPanel'))
// Lazy load page components for better code splitting (handle named exports)
const About = lazy(() =>
  import('./components/pages/About').then(module => ({ default: module.About }))
)
const Features = lazy(() =>
  import('./components/pages/Features').then(module => ({ default: module.Features }))
)
const FAQ = lazy(() => import('./components/pages/FAQ').then(module => ({ default: module.FAQ })))
const PrivacyPolicy = lazy(() =>
  import('./components/pages/PrivacyPolicy').then(module => ({ default: module.PrivacyPolicy }))
)
const HowItWorks = lazy(() =>
  import('./components/pages/HowItWorks').then(module => ({ default: module.HowItWorks }))
)
const TermsOfService = lazy(() =>
  import('./components/TermsOfService').then(module => ({ default: module.TermsOfService }))
)
import { Layout } from './components'
import { AuthModal, VerifyEmail, VerificationBanner, ResetPassword } from './components/auth'
import {
  ComparisonForm,
  ComparisonView,
  PremiumModelsToggleInfoModal,
  DisabledButtonInfoModal,
  ResultsDisplay,
  ModelsSection,
  ModelsSectionHeader,
  LoadingSection,
  ResultsSectionHeader,
  type AttachedFile,
  type StoredAttachedFile,
} from './components/comparison'
import { Navigation, Hero, MockModeBanner, InstallPrompt } from './components/layout'
import {
  CreditWarningBanner,
  DoneSelectingCard,
  ErrorBoundary,
  LoadingSpinner,
} from './components/shared'
import { TutorialManager } from './components/tutorial'
import { getCreditAllocation, getDailyCreditLimit } from './config/constants'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import {
  useConversationHistory,
  useBrowserFingerprint,
  useRateLimitStatus,
  useModelSelection,
  useModelComparison,
  useSavedModelSelections,
  useTutorial,
  useResponsive,
  useFileHandling,
  useConversationManager,
  useSavedSelectionManager,
  useCreditWarningManager,
  useTabCoordination,
  useComparisonStreaming,
  useScrollManagement,
  useExport,
  useModelManagement,
  useScreenshotCopy,
  useDoneSelectingCard,
  useCreditsRemaining,
} from './hooks'
import { apiClient } from './services/api/client'
import { ApiError } from './services/api/errors'
import {
  getAnonymousMockModeStatus,
  getRateLimitStatus,
  resetRateLimit,
} from './services/compareService'
import { createBreakoutConversation } from './services/conversationService'
import { getCreditBalance } from './services/creditService'
import type { CreditBalance } from './services/creditService'
import { getAvailableModels } from './services/modelsService'
import type {
  ConversationMessage,
  StoredMessage,
  ModelConversation,
  ModelsByProvider,
  ResultTab,
  ActiveResultTabs,
} from './types'
import { RESULT_TAB, createModelId, createMessageId } from './types'
import { generateBrowserFingerprint, showNotification, getSafeId } from './utils'
import { isErrorMessage } from './utils/error'

// TODO: This file has grown way too big - should extract MainPage, ResultsSection, etc.
// Started refactoring but got sidetracked. The state management here is a mess.
function AppContent() {
  const { isAuthenticated, user, refreshUser, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const currentView = location.pathname === '/admin' ? 'admin' : 'main'

  // Admin route guard - be careful with the auth loading state here
  useEffect(() => {
    if (location.pathname === '/admin' && !authLoading) {
      // Only redirect if we're certain the user is not an admin
      // Don't redirect if user is null/undefined (might be during transitions)
      // Only redirect if explicitly not authenticated OR explicitly not admin
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
      // If isAuthenticated is true but user is null/undefined, don't redirect (might be loading)
    }
  }, [location.pathname, isAuthenticated, user, authLoading, navigate])

  // All these hooks could probably be consolidated into a single useAppState hook
  const { browserFingerprint, setBrowserFingerprint } = useBrowserFingerprint()
  const {
    usageCount: _usageCount,
    setUsageCount,
    fetchRateLimitStatus,
  } = useRateLimitStatus({
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

  // Saved model selections hook for storing/loading named model selection groups
  // Pass user ID to store selections per user (registered users use their ID, unregistered users get a generated ID)
  // Pass subscription tier to enforce tier-based limits on saved selections
  const savedSelectionsHook = useSavedModelSelections(
    user?.id,
    user?.subscription_tier ?? 'unregistered'
  )
  const {
    savedSelections: savedModelSelections,
    saveSelection: saveModelSelection,
    loadSelection: loadModelSelectionFromStorage,
    deleteSelection: deleteModelSelection,
    setDefaultSelection,
    getDefaultSelectionId,
    getDefaultSelection,
    canSaveMore: canSaveMoreSelections,
    maxSelections: maxSavedSelections,
  } = savedSelectionsHook

  // Store accurate token count from ComparisonForm (from /estimate-tokens endpoint)
  const [accurateInputTokens, setAccurateInputTokens] = useState<number | null>(null)

  // File attachments state (can be AttachedFile for new uploads or StoredAttachedFile for loaded history)
  const [attachedFiles, setAttachedFilesState] = useState<(AttachedFile | StoredAttachedFile)[]>([])
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)

  // Track default selection override state (for current session)
  const [defaultSelectionOverridden, setDefaultSelectionOverridden] = useState(false)

  // User location state (for accurate location context)
  const [userLocation, setUserLocation] = useState<string | null>(null)
  // Ref to prevent duplicate geolocation detection in React StrictMode
  const geolocationDetectedRef = useRef(false)

  // Wrapper function to match ComparisonForm's expected signature
  const setAttachedFiles = useCallback((files: (AttachedFile | StoredAttachedFile)[]) => {
    setAttachedFilesState(files)
  }, [])

  // File handling hook
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
    // getConversationsWithMessages, // Available from hook if needed
  } = comparisonHook

  // Scroll tracking refs - these handle a lot of edge cases for smooth UX
  // Note: justLoadedFromHistoryRef, isScrollingToTopFromHistoryRef, isPageScrollingRef
  // are now managed by useScrollManagement hook
  const selectedModelsGridRef = useRef<HTMLDivElement>(null)
  const scrolledToTopRef = useRef<Set<string>>(new Set())
  const shouldScrollToTopAfterFormattingRef = useRef<boolean>(false)
  const hasScrolledToResultsOnFirstChunkRef = useRef<boolean>(false)
  const lastSubmittedInputRef = useRef<string>('')
  const [modelsByProvider, setModelsByProvider] = useState<ModelsByProvider>({})
  const [isLoadingModels, setIsLoadingModels] = useState(true)
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

  // Credits remaining calculation and follow-up mode exit when credits run out
  const { creditsRemaining } = useCreditsRemaining({
    isAuthenticated,
    user,
    creditBalance,
    anonymousCreditsRemaining,
    isFollowUpMode,
    setIsFollowUpMode,
  })

  // Breakout conversation tracking - could use a reducer instead
  const [_alreadyBrokenOutModels, setAlreadyBrokenOutModels] = useState<Set<string>>(new Set())
  const [breakoutPhase, setBreakoutPhase] = useState<
    'idle' | 'fading-out' | 'hidden' | 'fading-in'
  >('idle')

  // Export functionality hook
  const { showExportMenu, setShowExportMenu, exportMenuRef, handleExport } = useExport({
    conversations,
    modelsByProvider,
    responseMetadata: response?.metadata,
    input,
    getFirstUserMessage,
  })

  // Model management hook (dropdowns, toggling, tier restrictions)
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

  // Helper function to switch tabs for a specific conversation
  const switchResultTab = useCallback(
    (modelId: string, tab: ResultTab) => {
      setActiveResultTabs((prev: ActiveResultTabs) => ({
        ...prev,
        [modelId]: tab,
      }))
    },
    [setActiveResultTabs]
  )

  // Screenshot and copy functionality hook
  const { handleScreenshot, handleCopyResponse, handleCopyMessage } = useScreenshotCopy({
    conversations,
    activeResultTabs,
    switchResultTab,
  })

  // Tutorial state
  const {
    tutorialState,
    startTutorial,
    skipTutorial,
    completeStep,
    resetTutorial: _resetTutorial,
  } = useTutorial()
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const lastWelcomeModalPathnameRef = useRef<string | null>(null)
  const [tutorialHasCompletedComparison, setTutorialHasCompletedComparison] = useState(false)
  const [tutorialHasBreakout, setTutorialHasBreakout] = useState(false)
  const [tutorialHasSavedSelection, setTutorialHasSavedSelection] = useState(false)

  // Done selecting card visibility and handler
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

  const { handleSaveModelSelection, handleLoadModelSelection } = useSavedSelectionManager({
    selectedModels,
    modelsByProvider,
    maxModelsLimit,
    response,
    conversations,
    saveModelSelection,
    loadModelSelectionFromStorage,
    setSelectedModels,
    setOpenDropdowns,
    setConversations,
    setResponse,
    getDefaultSelectionId,
    setDefaultSelectionOverridden,
    onSelectionSaved: () => {
      if (tutorialState.currentStep === 'save-selection') {
        setTutorialHasSavedSelection(true)
      }
    },
  })

  // Refs for error message elements to enable scrolling
  const errorMessageRef = useRef<HTMLDivElement>(null)
  const prevErrorRef = useRef<string | null>(null)

  // Helper function to scroll to an element and center it vertically
  const scrollToCenterElement = useCallback((element: HTMLElement | null) => {
    if (!element) return

    // Wait for DOM to update, then scroll
    setTimeout(() => {
      const elementRect = element.getBoundingClientRect()
      const elementTop = elementRect.top + window.scrollY
      const elementHeight = elementRect.height
      const windowHeight = window.innerHeight

      // Calculate scroll position to center the element vertically
      const scrollPosition = elementTop - windowHeight / 2 + elementHeight / 2

      window.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: 'smooth',
      })
    }, 100) // Small delay to ensure DOM is updated
  }, [])

  // Scroll to error message when it first appears and center it vertically
  useEffect(() => {
    // Check if error message just appeared
    if (error && !prevErrorRef.current) {
      scrollToCenterElement(errorMessageRef.current)
    }
    prevErrorRef.current = error
  }, [error, scrollToCenterElement])

  // Auto-dismiss "input too long" error after 20 seconds
  useEffect(() => {
    if (error && error.includes('Your input is too long for one or more of the selected models')) {
      const timeoutId = setTimeout(() => {
        setError(null)
      }, 20000) // 20 seconds

      return () => {
        clearTimeout(timeoutId)
      }
    }
  }, [error, setError])

  // Callback for when the active conversation is deleted
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

  // Credit warnings removed - comparisons are allowed to proceed regardless of credit balance
  // Credits will be capped at allocated amount during deduction if needed

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
    // Now using hook versions - migrated from App.tsx local implementations
    loadHistoryFromAPI,
    saveConversationToLocalStorage,
    deleteConversation,
    loadHistoryFromLocalStorage,
    // Note: loadConversationFromAPI and loadConversationFromLocalStorage are defined locally below
    // as they return different types (raw conversation data vs ModelConversation[])
  } = conversationHistoryHook

  // Scroll management hook - handles scroll listeners, scroll lock sync, and scroll-to-top on history load
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

  // Note: responsive breakpoints (isWideLayout, isMobileLayout, isSmallLayout, isTouchDevice)
  // are now from useResponsive() called above

  // State for active tab in mobile view (index of the visible card)
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)

  // Get visible conversations for tab logic
  const visibleConversations = useMemo(() => {
    return conversations.filter(
      conv =>
        conv &&
        conv.modelId &&
        selectedModels.includes(conv.modelId) &&
        !closedCards.has(conv.modelId)
    )
  }, [conversations, selectedModels, closedCards])

  // Compute error and processing states for ResultsDisplay
  const { modelErrorStates, modelProcessingStates } = useMemo(() => {
    const errorStates: Record<string, boolean> = {}
    const processingStates: Record<string, boolean> = {}

    conversations.forEach(conversation => {
      if (!conversation || !conversation.modelId) return

      const latestMessage = conversation.messages[conversation.messages.length - 1]
      const content = latestMessage?.content || ''

      // Find raw model ID for backend error lookup
      const rawModelId = selectedModels?.find(m => createModelId(m) === conversation.modelId)

      // Check backend errors
      const hasBackendError =
        (rawModelId && modelErrors[rawModelId] === true) ||
        modelErrors[conversation.modelId] === true

      // Check model completion status
      const modelHasCompleted =
        (rawModelId && rawModelId in modelErrors) || conversation.modelId in modelErrors
      const isLoadingDone = !isLoading

      // Empty content is an error if model completed or loading done (timeout)
      const isEmptyContent =
        content.trim().length === 0 &&
        latestMessage?.type === 'assistant' &&
        (modelHasCompleted || isLoadingDone)

      errorStates[conversation.modelId] = hasBackendError || isEmptyContent
      processingStates[conversation.modelId] = !modelHasCompleted && isLoading
    })

    return { modelErrorStates: errorStates, modelProcessingStates: processingStates }
  }, [conversations, selectedModels, modelErrors, isLoading])

  // Reset active tab index if it's out of bounds
  useEffect(() => {
    if (activeTabIndex >= visibleConversations.length && visibleConversations.length > 0) {
      setActiveTabIndex(0)
    }
  }, [activeTabIndex, visibleConversations.length])

  // Helper function to attempt focusing the textarea
  const attemptFocusTextarea = useCallback(() => {
    if (!isTouchDevice && currentView === 'main' && textareaRef.current) {
      const textarea = textareaRef.current
      // Check if textarea is actually visible and not disabled
      const rect = textarea.getBoundingClientRect()
      const isVisible = rect.width > 0 && rect.height > 0
      const isNotDisabled = !textarea.disabled

      if (isVisible && isNotDisabled) {
        // Check if there's no modal or overlay blocking focus
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

  // Focus textarea on desktop when page loads or when conditions change
  useEffect(() => {
    // Only focus on desktop (not touch devices) and when on main view
    // Don't focus if welcome modal is showing or tutorial is active
    if (!isTouchDevice && currentView === 'main' && !showWelcomeModal && !tutorialState.isActive) {
      let timeout1: ReturnType<typeof setTimeout> | null = null
      let timeout2: ReturnType<typeof setTimeout> | null = null
      let timeout3: ReturnType<typeof setTimeout> | null = null

      // Use requestAnimationFrame for first attempt
      requestAnimationFrame(() => {
        if (attemptFocusTextarea()) return

        // If not successful, try with delays to handle async rendering
        timeout1 = setTimeout(() => {
          if (attemptFocusTextarea()) return

          // Try again with longer delay
          timeout2 = setTimeout(() => {
            if (attemptFocusTextarea()) return

            // Final attempt with even longer delay for slow renders
            timeout3 = setTimeout(() => {
              attemptFocusTextarea()
            }, 500)
          }, 300)
        }, 100)
      })

      return () => {
        if (timeout1) clearTimeout(timeout1)
        if (timeout2) clearTimeout(timeout2)
        if (timeout3) clearTimeout(timeout3)
      }
    }
  }, [isTouchDevice, currentView, showWelcomeModal, tutorialState.isActive, attemptFocusTextarea])

  // Also focus when welcome modal closes
  useEffect(() => {
    if (!isTouchDevice && currentView === 'main' && !showWelcomeModal && !tutorialState.isActive) {
      // When welcome modal closes, attempt to focus after a brief delay
      const timeout = setTimeout(() => {
        attemptFocusTextarea()
      }, 200)
      return () => clearTimeout(timeout)
    }
  }, [showWelcomeModal, isTouchDevice, currentView, tutorialState.isActive, attemptFocusTextarea])

  // State for mobile tooltip visibility (capability tiles)
  const [visibleTooltip, setVisibleTooltip] = useState<string | null>(null)

  // Handle capability tile tap on mobile to show tooltip
  const handleCapabilityTileTap = (tileId: string) => {
    // Only show tooltip on mobile layout
    if (isMobileLayout) {
      setVisibleTooltip(tileId)
      // Hide tooltip after 2 seconds
      setTimeout(() => {
        setVisibleTooltip(null)
      }, 2000)
    }
  }

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login')
  const [anonymousMockModeEnabled, setAnonymousMockModeEnabled] = useState(false)

  const [loginEmail, setLoginEmail] = useState<string>('')

  // Tab coordination for email verification and password reset
  const { verificationToken, suppressVerification, showPasswordReset, handlePasswordResetClose } =
    useTabCoordination({
      onOpenAuthModal: mode => {
        setIsAuthModalOpen(true)
        setAuthModalMode(mode === 'login' ? 'login' : 'register')
      },
      onCloseAuthModal: () => setIsAuthModalOpen(false),
      onSetLoginEmail: setLoginEmail,
    })

  // Fetch anonymous mock mode setting for unregistered users (development only)
  useEffect(() => {
    const fetchAnonymousMockModeSetting = async () => {
      // Only fetch for unregistered users in development mode
      // Also wait for auth to finish loading to prevent race conditions
      if (isAuthenticated || !import.meta.env.DEV || authLoading) {
        // Reset anonymous mock mode when authenticated or while loading
        if (isAuthenticated || authLoading) {
          setAnonymousMockModeEnabled(false)
        }
        return
      }

      try {
        const data = await getAnonymousMockModeStatus()
        if (data.is_development && data.anonymous_mock_mode_enabled) {
          setAnonymousMockModeEnabled(true)
        } else {
          setAnonymousMockModeEnabled(false)
        }
      } catch {
        // Silently fail - this is a development-only feature
      }
    }

    fetchAnonymousMockModeSetting()
  }, [isAuthenticated, authLoading])

  // Fetch backend credit estimate when input/models change (debounced)
  // Credit estimation removed - no longer needed since comparisons proceed regardless of credit balance

  // Note: Screenshot/copy handlers (handleScreenshot, handleCopyResponse, handleCopyMessage)
  // are now provided by useScreenshotCopy hook

  // Note: Scroll management effects (scroll-to-top on history load, scroll lock sync,
  // scroll listener setup/cleanup) are now handled by useScrollManagement hook

  // Developer reset function - exposed to window for debugging
  const resetUsage = async () => {
    try {
      // Save currently displayed conversations to preserve them after reset
      const currentDisplayedConversations = [...conversations]
      const currentDisplayedComparisonId = currentVisibleComparisonId

      // Reset backend rate limits (dev only)
      try {
        await resetRateLimit(browserFingerprint || undefined)
        setError(null)

        if (isAuthenticated) {
          // Authenticated user: backend handles database cleanup
          // Clear history but preserve currently displayed results
          setConversationHistory([])
          // Restore the currently displayed conversations
          setConversations(currentDisplayedConversations)
          // Keep the current visible comparison ID if there's a visible comparison
          if (currentDisplayedConversations.length > 0 && currentDisplayedComparisonId) {
            setCurrentVisibleComparisonId(currentDisplayedComparisonId)
          } else {
            setCurrentVisibleComparisonId(null)
          }

          // Refresh user data to show updated usage from backend
          await refreshUser()
        } else {
          // Unregistered user: clear localStorage and reset UI state
          // Reset usage counts
          setUsageCount(0)
          localStorage.removeItem('compareintel_usage')

          // Clear all conversation history from localStorage
          localStorage.removeItem('compareintel_conversation_history')
          // Clear all individual conversation data
          const keysToRemove: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('compareintel_conversation_')) {
              keysToRemove.push(key)
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key))

          // Clear history but preserve currently displayed results
          setConversationHistory([])
          // Restore the currently displayed conversations
          setConversations(currentDisplayedConversations)
          // Keep the current visible comparison ID if there's a visible comparison
          if (currentDisplayedConversations.length > 0 && currentDisplayedComparisonId) {
            setCurrentVisibleComparisonId(currentDisplayedComparisonId)
          } else {
            setCurrentVisibleComparisonId(null)
          }

          // Fetch updated rate limit status from backend to sync usage counts
          await fetchRateLimitStatus()
        }
      } catch (error) {
        if (error instanceof ApiError) {
          console.error(`Failed to reset: ${error.message}`)
        } else {
          console.error('Reset error:', error)
          console.error('Failed to reset rate limits. Make sure the backend is running.')
        }
      }
    } catch (error) {
      console.error('Unexpected error in resetUsage:', error)
    }
  }

  // Expose resetUsage to window for debugging (prevents TypeScript unused variable error)
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).resetUsage = resetUsage
  }

  // Get all models in a flat array for compatibility
  const allModels = Object.values(modelsByProvider).flat()

  // Note: The following functions are now provided by the useConversationHistory hook above:
  // - loadHistoryFromLocalStorage
  // - saveConversationToLocalStorage
  // - loadHistoryFromAPI
  // - deleteConversation
  // These functions have been migrated to the hook and are destructured from conversationHistoryHook

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

  // Check if tutorial welcome modal should be shown
  useEffect(() => {
    if (tutorialState.isActive || currentView !== 'main') {
      // Reset ref when leaving main view
      if (currentView !== 'main') {
        lastWelcomeModalPathnameRef.current = null
      }
      return
    }

    // Only show modal when navigating to main page (not on every render)
    const isNavigatingToMain = lastWelcomeModalPathnameRef.current !== location.pathname

    if (!isNavigatingToMain) {
      return
    }

    // For mobile/touchscreen users: show welcome modal every time (unless "Don't show again" is checked)
    if (isTouchDevice) {
      const dontShowAgain = localStorage.getItem('compareintel_mobile_welcome_dont_show_again')
      if (dontShowAgain !== 'true') {
        setShowWelcomeModal(true)
        lastWelcomeModalPathnameRef.current = location.pathname
      }
    } else {
      // For desktop users: show welcome modal only on first visit
      const hasSeenWelcome = localStorage.getItem('compareintel_tutorial_welcome_seen')
      if (!hasSeenWelcome) {
        setShowWelcomeModal(true)
        localStorage.setItem('compareintel_tutorial_welcome_seen', 'true')
        lastWelcomeModalPathnameRef.current = location.pathname
      }
    }
  }, [tutorialState.isActive, currentView, isTouchDevice, location.pathname])

  // Track when comparison completes for tutorial
  useEffect(() => {
    const isSubmitStep =
      tutorialState.currentStep === 'submit-comparison' ||
      tutorialState.currentStep === 'submit-comparison-2'

    if (isSubmitStep && !isLoading) {
      // For follow-ups (step 7), check if new assistant messages have been added
      // For initial comparisons (step 4), check if conversations exist
      if (tutorialState.currentStep === 'submit-comparison-2' && isFollowUpMode) {
        // For follow-ups, check if at least one conversation has a new assistant message
        // This ensures the follow-up responses have actually been received
        // We check for at least 2 assistant messages (initial + follow-up) in successful conversations
        const hasFollowUpResponses =
          conversations.length > 0 &&
          conversations.some(conv => {
            const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
            // Should have at least 2 assistant messages (initial + follow-up) with content
            return (
              assistantMessages.length >= 2 &&
              assistantMessages[assistantMessages.length - 1].content.trim().length > 0
            )
          })
        if (hasFollowUpResponses) {
          setTutorialHasCompletedComparison(true)
        }
      } else if (tutorialState.currentStep === 'submit-comparison') {
        // For initial comparison, just check if conversations exist and loading is done
        if (conversations.length > 0) {
          setTutorialHasCompletedComparison(true)
        }
      }
    }
  }, [conversations, isLoading, tutorialState.currentStep, isFollowUpMode])

  // Reset comparison completion flag when entering step 6 (enter-prompt-2) to allow step 7 to detect completion
  useEffect(() => {
    if (tutorialState.currentStep === 'enter-prompt-2') {
      setTutorialHasCompletedComparison(false)
    }
  }, [tutorialState.currentStep])

  // Track breakout creation for tutorial (backup detection)
  // Primary detection is in handleBreakout function
  useEffect(() => {
    // This is a backup - the main tracking happens in handleBreakout
    // Only use this if handleBreakout doesn't fire (shouldn't happen normally)
  }, [currentVisibleComparisonId, conversations.length, tutorialState.currentStep])

  // Listen for anonymous credits reset event from AdminPanel and refresh credit display
  useEffect(() => {
    const handleAnonymousCreditsReset = async () => {
      // Refresh credit balance for unregistered users (history is not affected)
      if (!isAuthenticated) {
        // Refresh credit balance to reflect the reset
        if (browserFingerprint) {
          try {
            const creditBalance = await getCreditBalance(browserFingerprint)
            setAnonymousCreditsRemaining(creditBalance.credits_remaining)
            setCreditBalance(creditBalance)
          } catch (err) {
            console.error('Failed to refresh credit balance after reset:', err)
            // Still reset credits optimistically
            setAnonymousCreditsRemaining(50) // Default anonymous credits
          }
        } else {
          // If fingerprint not available yet, reset credits optimistically
          setAnonymousCreditsRemaining(50) // Default anonymous credits
        }

        // Always clear credit-related errors when credits are reset
        // Use a function form of setError to access current error value
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

  // Track currently visible comparison ID for authenticated users after history loads
  // This ensures the visible comparison is highlighted in the history dropdown
  // Always try to match and set the ID when history or conversations change
  // BUT: Skip if currentVisibleComparisonId is null and conversations are empty (screen was reset)
  useEffect(() => {
    // Skip auto-matching if we just reset the screen (conversations empty and no current ID)
    if (conversations.length === 0 && !currentVisibleComparisonId) {
      return
    }

    if (isAuthenticated && conversationHistory.length > 0 && conversations.length > 0) {
      const firstUserMessage = conversations
        .flatMap(conv => conv.messages)
        .filter(msg => msg.type === 'user')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]

      if (firstUserMessage && firstUserMessage.content) {
        // First, check if the currentVisibleComparisonId is still valid and matches the loaded conversations
        // This prevents overwriting an explicitly selected conversation when there are multiple matches
        if (currentVisibleComparisonId) {
          const currentConversation = conversationHistory.find(
            summary => String(summary.id) === currentVisibleComparisonId
          )

          if (currentConversation) {
            const currentModelsMatch =
              JSON.stringify([...currentConversation.models_used].sort()) ===
              JSON.stringify([...selectedModels].sort())
            const currentInputMatches = currentConversation.input_data === firstUserMessage.content

            // If the current ID still matches, keep it (don't search for a different match)
            if (currentModelsMatch && currentInputMatches) {
              return
            }
          }
        }

        // Only if currentVisibleComparisonId doesn't match or doesn't exist, try to find a new match
        const matchingConversation = conversationHistory.find(summary => {
          const modelsMatch =
            JSON.stringify([...summary.models_used].sort()) ===
            JSON.stringify([...selectedModels].sort())
          const inputMatches = summary.input_data === firstUserMessage.content
          return modelsMatch && inputMatches
        })

        if (matchingConversation) {
          const matchingId = String(matchingConversation.id)
          // Only update if it's different or not set - this ensures we always track the current visible comparison
          if (currentVisibleComparisonId !== matchingId) {
            setCurrentVisibleComparisonId(matchingId)
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAuthenticated,
    conversationHistory,
    conversations,
    selectedModels,
    currentVisibleComparisonId,
  ])

  // Track which conversation IDs we've already attempted to load token counts for
  // This prevents infinite loops when updating conversations state
  const processedConversationIdsRef = useRef<Set<string | number>>(new Set())

  // Reload conversations with token counts when currentVisibleComparisonId is set after a comparison completes
  // This ensures token counts are available for the token-usage-indicator in follow-up mode
  useEffect(() => {
    if (!currentVisibleComparisonId || conversations.length === 0) {
      return
    }

    // Check if we've already processed this conversation ID
    if (processedConversationIdsRef.current.has(currentVisibleComparisonId)) {
      return
    }

    // Check if conversations already have token counts
    const hasTokenCounts = conversations.some(conv =>
      conv.messages.some(
        msg =>
          (msg.type === 'user' && msg.input_tokens) ||
          (msg.type === 'assistant' && msg.output_tokens)
      )
    )

    // If conversations already have token counts, mark as processed and return
    if (hasTokenCounts) {
      processedConversationIdsRef.current.add(currentVisibleComparisonId)
      return
    }

    // Simple token estimation function (1 token ≈ 4 chars)
    const estimateTokensSimple = (text: string): number => {
      if (!text.trim()) {
        return 0
      }
      return Math.max(1, Math.ceil(text.length / 4))
    }

    if (isAuthenticated) {
      // For authenticated users, reload from API to get accurate token counts
      const conversationId =
        typeof currentVisibleComparisonId === 'string'
          ? parseInt(currentVisibleComparisonId, 10)
          : currentVisibleComparisonId

      if (isNaN(conversationId)) {
        return
      }

      // Mark this conversation ID as being processed to prevent duplicate requests
      processedConversationIdsRef.current.add(currentVisibleComparisonId)

      // Use a small delay to ensure backend has finished saving
      const timeoutId = setTimeout(async () => {
        try {
          const conversationData = await loadConversationFromAPI(conversationId)
          if (!conversationData) {
            return
          }

          // Update conversations with token counts from API
          setConversations(prevConversations => {
            const modelsUsed = conversationData.models_used
            const messagesByModel: { [modelId: string]: ConversationMessage[] } = {}

            // Group messages by model
            conversationData.messages.forEach(msg => {
              if (msg.role === 'user') {
                // User messages go to all models
                modelsUsed.forEach((modelId: string) => {
                  if (!messagesByModel[modelId]) {
                    messagesByModel[modelId] = []
                  }
                  messagesByModel[modelId].push({
                    id: msg.id
                      ? createMessageId(String(msg.id))
                      : createMessageId(`${Date.now()}-user-${Math.random()}`),
                    type: 'user' as const,
                    content: msg.content,
                    timestamp: msg.created_at,
                    input_tokens: msg.input_tokens,
                  })
                })
              } else if (msg.role === 'assistant' && msg.model_id) {
                // Assistant messages go to their specific model
                const modelId = createModelId(msg.model_id)
                if (!messagesByModel[modelId]) {
                  messagesByModel[modelId] = []
                }
                messagesByModel[modelId].push({
                  id: msg.id
                    ? createMessageId(String(msg.id))
                    : createMessageId(`${Date.now()}-${Math.random()}`),
                  type: 'assistant' as const,
                  content: msg.content,
                  timestamp: msg.created_at,
                  output_tokens: msg.output_tokens,
                })
              }
            })

            // Update conversations with token counts, preserving existing structure
            return prevConversations.map(conv => {
              const modelId = conv.modelId
              const apiMessages = messagesByModel[modelId] || []

              // If we have API messages for this model, update with token counts
              if (apiMessages.length > 0) {
                // Match messages by content and timestamp to preserve order
                const updatedMessages = conv.messages.map(msg => {
                  const apiMsg = apiMessages.find(
                    apiMsg =>
                      apiMsg.type === msg.type &&
                      apiMsg.content === msg.content &&
                      Math.abs(
                        new Date(apiMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()
                      ) < 5000 // Within 5 seconds
                  )

                  if (apiMsg) {
                    // Update with token counts from API
                    return {
                      ...msg,
                      input_tokens: apiMsg.input_tokens,
                      output_tokens: apiMsg.output_tokens,
                    }
                  }
                  return msg
                })

                return {
                  ...conv,
                  messages: updatedMessages,
                }
              }

              return conv
            })
          })
        } catch (error) {
          console.error('Failed to reload conversation with token counts:', error)
        }
      }, 2000) // Give backend time to finish saving

      return () => {
        clearTimeout(timeoutId)
      }
    } else {
      // Mark this conversation ID as being processed to prevent duplicate requests
      processedConversationIdsRef.current.add(currentVisibleComparisonId)

      // For unregistered users, reload from localStorage and estimate tokens if missing
      const timeoutId = setTimeout(() => {
        try {
          const conversationData = loadConversationFromLocalStorage(currentVisibleComparisonId)
          if (!conversationData) {
            return
          }

          // Update conversations with token counts from localStorage, estimating if missing
          setConversations(prevConversations => {
            const modelsUsed = conversationData.models_used
            const messagesByModel: { [modelId: string]: ConversationMessage[] } = {}

            // Group messages by model
            conversationData.messages.forEach(msg => {
              if (msg.role === 'user') {
                // User messages go to all models
                modelsUsed.forEach((modelId: string) => {
                  if (!messagesByModel[modelId]) {
                    messagesByModel[modelId] = []
                  }
                  messagesByModel[modelId].push({
                    id: msg.id
                      ? createMessageId(String(msg.id))
                      : createMessageId(`${Date.now()}-user-${Math.random()}`),
                    type: 'user' as const,
                    content: msg.content,
                    timestamp: msg.created_at,
                    // Use saved token count or estimate if missing
                    input_tokens: msg.input_tokens ?? estimateTokensSimple(msg.content),
                  })
                })
              } else if (msg.role === 'assistant' && msg.model_id) {
                // Assistant messages go to their specific model
                const modelId = createModelId(msg.model_id)
                if (!messagesByModel[modelId]) {
                  messagesByModel[modelId] = []
                }
                messagesByModel[modelId].push({
                  id: msg.id
                    ? createMessageId(String(msg.id))
                    : createMessageId(`${Date.now()}-${Math.random()}`),
                  type: 'assistant' as const,
                  content: msg.content,
                  timestamp: msg.created_at,
                  // Use saved token count or estimate if missing
                  output_tokens: msg.output_tokens ?? estimateTokensSimple(msg.content),
                })
              }
            })

            // Update conversations with token counts, preserving existing structure
            return prevConversations.map(conv => {
              const modelId = conv.modelId
              const storedMessages = messagesByModel[modelId] || []

              // If we have stored messages for this model, update with token counts
              if (storedMessages.length > 0) {
                // Match messages by content and timestamp to preserve order
                const updatedMessages = conv.messages.map(msg => {
                  const storedMsg = storedMessages.find(
                    storedMsg =>
                      storedMsg.type === msg.type &&
                      storedMsg.content === msg.content &&
                      Math.abs(
                        new Date(storedMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()
                      ) < 5000 // Within 5 seconds
                  )

                  if (storedMsg) {
                    // Update with token counts from localStorage (or estimated)
                    return {
                      ...msg,
                      input_tokens: storedMsg.input_tokens,
                      output_tokens: storedMsg.output_tokens,
                    }
                  }
                  // If no match found, estimate tokens for this message
                  return {
                    ...msg,
                    input_tokens:
                      msg.type === 'user' && !msg.input_tokens
                        ? estimateTokensSimple(msg.content)
                        : msg.input_tokens,
                    output_tokens:
                      msg.type === 'assistant' && !msg.output_tokens
                        ? estimateTokensSimple(msg.content)
                        : msg.output_tokens,
                  }
                })

                return {
                  ...conv,
                  messages: updatedMessages,
                }
              }

              // If no stored messages found, estimate tokens for existing messages
              return {
                ...conv,
                messages: conv.messages.map(msg => ({
                  ...msg,
                  input_tokens:
                    msg.type === 'user' && !msg.input_tokens
                      ? estimateTokensSimple(msg.content)
                      : msg.input_tokens,
                  output_tokens:
                    msg.type === 'assistant' && !msg.output_tokens
                      ? estimateTokensSimple(msg.content)
                      : msg.output_tokens,
                })),
              }
            })
          })
        } catch (error) {
          console.error('Failed to reload conversation with token counts from localStorage:', error)
        }
      }, 500) // Small delay to ensure localStorage is updated

      return () => {
        clearTimeout(timeoutId)
      }
    }
    // Only depend on currentVisibleComparisonId and isAuthenticated to avoid infinite loops
    // The conversations dependency was causing re-renders when we update conversations with token counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentVisibleComparisonId,
    isAuthenticated,
    loadConversationFromAPI,
    loadConversationFromLocalStorage,
  ])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
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
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistoryDropdown])

  // Note: switchResultTab is now defined earlier with useCallback for use in useScreenshotCopy hook

  // Scroll to loading section when loading starts
  useEffect(() => {
    if (isLoading) {
      // Small delay to ensure the loading section is rendered
      setTimeout(() => {
        const loadingSection = document.querySelector('.loading-section')
        if (loadingSection) {
          loadingSection.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          })
        }
      }, 100)
    }
  }, [isLoading])

  // Clear verification-related errors when user becomes verified
  useEffect(() => {
    if (user?.is_verified && error?.includes('verify your email')) {
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_verified, error])

  // Scroll individual model result cards to top when they finish formatting (initial comparison only)
  useEffect(() => {
    if (isFollowUpMode) return // Only for initial comparison, not follow-ups

    // Check each model's tab state
    Object.entries(activeResultTabs).forEach(([modelId, tab]) => {
      // If this model is on FORMATTED tab and we haven't scrolled it yet
      // Also verify that a conversation exists for this model
      if (
        tab === RESULT_TAB.FORMATTED &&
        !scrolledToTopRef.current.has(modelId) &&
        conversations.some(conv => conv.modelId === modelId)
      ) {
        // Mark as scrolled to avoid duplicate scrolling
        scrolledToTopRef.current.add(modelId)

        // Wait for LatexRenderer to finish rendering, then scroll this card's conversation content to top
        setTimeout(() => {
          const safeId = getSafeId(modelId)
          const conversationContent = document.querySelector(
            `#conversation-content-${safeId}`
          ) as HTMLElement
          if (conversationContent) {
            conversationContent.scrollTop = 0
          }
        }, 200) // Delay to allow LatexRenderer to finish rendering
      }
    })
  }, [activeResultTabs, isFollowUpMode, conversations])

  // Scroll to results section when results are loaded (only once per comparison)
  useEffect(() => {
    // Don't scroll to results if there's an error (e.g., all models failed)
    // The error message scroll will handle centering the error instead
    // Also don't scroll when tutorial is active and on 'submit-comparison' or 'follow-up' step - let the tutorial handle scrolling
    // We check 'submit-comparison' because the step hasn't advanced yet when this effect runs
    const isTutorialSubmitOrFollowUpStep =
      tutorialState.isActive &&
      (tutorialState.currentStep === 'submit-comparison' ||
        tutorialState.currentStep === 'follow-up')
    if (
      response &&
      !isFollowUpMode &&
      !hasScrolledToResultsRef.current &&
      !error &&
      !isTutorialSubmitOrFollowUpStep
    ) {
      // Also check if all models failed (even if error state hasn't updated yet)
      const allModelsFailed = response.metadata?.models_successful === 0
      if (allModelsFailed) {
        // Don't scroll if all models failed - error message will be shown instead
        return
      }

      // Mark that we've scrolled for this comparison
      hasScrolledToResultsRef.current = true

      // Longer delay to ensure the results section is fully rendered
      setTimeout(() => {
        const resultsSection = document.querySelector('.results-section')
        if (resultsSection) {
          // Scroll to the results section header specifically
          resultsSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
      }, 300)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, isFollowUpMode, error, tutorialState.currentStep])

  // Scroll all conversation cards to top after formatting is applied (initial comparison only)
  useEffect(() => {
    // Only for initial comparison, not follow-ups
    if (isFollowUpMode || !shouldScrollToTopAfterFormattingRef.current) return

    // Check if all selected models are formatted
    const allModelsFormatted = selectedModels.every(modelId => {
      const modelIdFormatted = createModelId(modelId)
      const tab = activeResultTabs[modelIdFormatted]
      return tab === RESULT_TAB.FORMATTED
    })

    // Also check that conversations exist for all models
    const allConversationsExist = selectedModels.every(modelId => {
      const modelIdFormatted = createModelId(modelId)
      return conversations.some(conv => conv.modelId === modelIdFormatted)
    })

    if (allModelsFormatted && allConversationsExist) {
      // Reset the flag to prevent duplicate scrolling
      shouldScrollToTopAfterFormattingRef.current = false

      // Wait for LatexRenderer to finish rendering, then scroll all conversation cards to top
      setTimeout(() => {
        selectedModels.forEach(modelId => {
          const safeId = createModelId(modelId).replace(/[^a-zA-Z0-9_-]/g, '-')
          const conversationContent = document.querySelector(
            `#conversation-content-${safeId}`
          ) as HTMLElement
          if (conversationContent) {
            conversationContent.scrollTo({
              top: 0,
              behavior: 'smooth',
            })
          }
        })
      }, 300) // Delay to allow LatexRenderer to finish rendering
    }
  }, [activeResultTabs, isFollowUpMode, conversations, selectedModels])

  // Note: Scroll handling moved to handleFollowUp function for better control

  // Scroll to results section when conversations are updated (follow-up mode)
  useEffect(() => {
    // Don't scroll when tutorial is active and on steps 7-10 - let the tutorial handle scrolling
    const isTutorialLateStep =
      tutorialState.isActive &&
      (tutorialState.currentStep === 'submit-comparison-2' ||
        tutorialState.currentStep === 'view-follow-up-results' ||
        tutorialState.currentStep === 'history-dropdown' ||
        tutorialState.currentStep === 'save-selection')
    if (
      conversations.length > 0 &&
      isFollowUpMode &&
      !followUpJustActivatedRef.current &&
      !isTutorialLateStep
    ) {
      // Scroll to results section after follow-up is submitted
      setTimeout(() => {
        const resultsSection = document.querySelector('.results-section')
        if (resultsSection) {
          resultsSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
      }, 400)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, isFollowUpMode, tutorialState.currentStep, tutorialState.isActive])

  // Note: Done Selecting card visibility is now handled by useDoneSelectingCard hook

  // Refresh usage count when models are selected to ensure renderUsagePreview shows accurate remaining count
  useEffect(() => {
    // Only refresh if we have models selected and we're not loading
    if (selectedModels.length > 0 && !isLoading) {
      // Debounce the refresh to avoid too many API calls when user is rapidly selecting models
      const timeoutId = setTimeout(() => {
        if (!isAuthenticated && browserFingerprint) {
          // For unregistered users, refresh rate limit status (which updates usageCount)
          fetchRateLimitStatus()
        } else if (isAuthenticated) {
          // For authenticated users, refresh user data (which updates credits)
          refreshUser()
        }
      }, 300) // Wait 300ms after last model selection change

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

  // Detect page-level scrolling to prevent card auto-scroll from interfering
  // Only pauses card auto-scroll when user is actually scrolling the page
  useEffect(() => {
    let lastPageScrollTop = window.scrollY || document.documentElement.scrollTop
    let scrollTimeout: number | null = null

    // Detect wheel events on card boundaries - user trying to scroll past card to page
    // This helps detect when user wants to scroll the page, but we primarily rely on
    // actual scroll movement detection below
    const handlePageWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement
      const isCardContent = target.closest('.conversation-content')

      // If wheel is on a card content, let the card handle it
      // The card's own scroll handler will manage scrolling within the card
      if (isCardContent) {
        return
      }

      // Wheel event is on page/document level (not on a card)
      // The actual scroll movement handler below will detect if page scrolling occurs
    }

    // Detect touch events - card touches are handled by card scroll listeners
    // We primarily rely on actual scroll movement detection
    const handlePageTouchStart = () => {
      // Touch events are handled by card scroll listeners
      // Actual scroll movement will be detected by handlePageScroll below
    }

    // Track actual scroll movement - this is the primary detection method
    const handlePageScroll = () => {
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollDelta = Math.abs(currentScrollTop - lastPageScrollTop)

      // Only mark as page scrolling if there's actual scroll movement
      // This prevents false positives from programmatic scrolls
      if (scrollDelta > 1) {
        // User is actually scrolling the page - pause card auto-scroll
        isPageScrollingRef.current = true

        // Clear any existing timeout
        if (scrollTimeout !== null) {
          clearTimeout(scrollTimeout)
        }

        // Reset flag after scrolling stops (300ms of no scroll activity)
        scrollTimeout = window.setTimeout(() => {
          isPageScrollingRef.current = false
          scrollTimeout = null
        }, 300)
      }

      lastPageScrollTop = currentScrollTop
    }

    // Use capture phase for wheel events (though we primarily rely on scroll movement)
    // Rely primarily on actual scroll movement detection for pausing card auto-scroll
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

  // Cleanup scroll listeners on unmount
  useEffect(() => {
    // Capture ref values at mount time
    const scrollListeners = scrollListenersRef.current
    const userInteracting = userInteractingRef.current
    const lastScrollTop = lastScrollTopRef.current

    return () => {
      // Clean up all scroll listeners when component unmounts
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

  // Align "You" sections across all model cards after each round completes
  useEffect(() => {
    if (conversations.length === 0) return

    // Don't align if we just loaded from history (to prevent scrolling)
    if (justLoadedFromHistoryRef.current || isScrollingToTopFromHistoryRef.current) return

    // Get the current round number
    const firstConversation = conversations[0]
    const currentRound = firstConversation?.messages.filter(m => m.type === 'user').length || 0

    // Check if this round has already been aligned
    if (currentRound <= lastAlignedRoundRef.current) return

    // Check if all models have completed this round
    const allModelsComplete = conversations.every(conv => {
      const userMessages = conv.messages.filter(m => m.type === 'user').length
      const aiMessages = conv.messages.filter(m => m.type === 'assistant').length
      return userMessages === currentRound && aiMessages === currentRound
    })

    if (!allModelsComplete) return

    // Wait for DOM to settle, then align scroll positions
    setTimeout(() => {
      const cards = document.querySelectorAll('.result-card.conversation-card')
      if (cards.length === 0) return

      // Find the maximum offsetTop for the latest "You" section across all cards
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

      // Scroll all cards to align the "You" section at the same position
      scrollData.forEach(({ element }) => {
        element.scrollTo({
          top: maxOffsetTop,
          behavior: 'smooth',
        })
      })

      // Mark this round as aligned
      lastAlignedRoundRef.current = currentRound
    }, 500) // Wait for content to settle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations])

  // Note: Mouse tracking for Done Selecting card is now handled by useDoneSelectingCard hook

  // Handle scroll tracking to stop animations
  useEffect(() => {
    const handleScroll = () => {
      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
      setIsAnimatingButton(false)
      setIsAnimatingTextarea(false)

      // Check if user is scrolling down to models section
      if (modelsSectionRef.current) {
        const rect = modelsSectionRef.current.getBoundingClientRect()
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          // User is scrolling to models section, stop animations
          setIsAnimatingButton(false)
          setIsAnimatingTextarea(false)
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Handle input change to stop animations
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

  // Clear textarea-related errors when user starts typing
  useEffect(() => {
    if (
      input.trim().length > 0 &&
      error &&
      (error === 'Please enter some text to compare' ||
        error === 'Please enter a follow-up question or code')
    ) {
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, error])

  // Detect user location using browser geolocation API (most accurate)
  // Use ref to prevent duplicate detection in React StrictMode
  useEffect(() => {
    if (geolocationDetectedRef.current) return
    geolocationDetectedRef.current = true

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async position => {
          try {
            // Reverse geocode coordinates to location string
            const response = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`
            )
            if (response.ok) {
              const data = await response.json()
              const city = data.city || ''
              const region = data.principalSubdivision || ''
              // Clean up country name - remove "(the)" suffix if present
              let country = data.countryName || ''
              country = country.replace(/\s*\(the\)\s*$/i, '').trim()
              const parts = [city, region, country].filter(Boolean)
              if (parts.length > 0) {
                const location = parts.join(', ')
                console.log('[Geolocation] Successfully detected location:', location)
                setUserLocation(location)
              } else {
                console.debug('[Geolocation] Reverse geocoding returned no location parts')
              }
            }
          } catch (error) {
            // Silently fail - will fallback to IP-based location on backend
            console.debug('Failed to get location from coordinates:', error)
          }
        },
        error => {
          // User denied permission or error - will fallback to IP-based location on backend
          console.debug('Geolocation not available:', error.message)
        },
        { timeout: 5000, enableHighAccuracy: false }
      )
    }
  }, [])

  // Load usage data and fetch models on component mount
  useEffect(() => {
    // Generate browser fingerprint for anti-abuse tracking
    const initFingerprint = async () => {
      const fingerprint = await generateBrowserFingerprint()
      setBrowserFingerprint(fingerprint)

      // Sync usage count with backend (only for unregistered users)
      try {
        if (isAuthenticated && user) {
          // For authenticated users, use credits instead of daily_usage_count
          setUsageCount(user.credits_used_this_period || 0)

          // Fetch credit balance for authenticated users on mount
          try {
            const creditBalance = await getCreditBalance()
            setCreditBalance(creditBalance)
          } catch (error) {
            // Silently handle credit balance fetch errors
            console.error('Failed to fetch authenticated user credit balance:', error)
            // Fallback to user object data if available
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
            // Backend returns 'daily_usage' for authenticated, 'fingerprint_usage' or 'ip_usage' for anonymous
            const usageCount = data.daily_usage || data.fingerprint_usage || data.ip_usage || 0
            setUsageCount(usageCount)

            // Update localStorage to match backend
            const today = new Date().toDateString()
            localStorage.setItem(
              'compareintel_usage',
              JSON.stringify({
                count: usageCount,
                date: today,
              })
            )

            // Fetch anonymous credit balance
            try {
              const creditBalance = await getCreditBalance(fingerprint)
              setAnonymousCreditsRemaining(creditBalance.credits_remaining)
              setCreditBalance(creditBalance)
            } catch (error) {
              // Silently handle credit balance fetch errors
              console.error('Failed to fetch anonymous credit balance:', error)
            }
          } catch (error) {
            // Silently handle cancellation errors (expected when component unmounts)
            if (error instanceof Error && error.name === 'CancellationError') {
              // Fallback to localStorage silently
            } else {
              // Fallback to localStorage if backend is unavailable
              console.error('Failed to sync usage count from backend, using localStorage:', error)
            }
            const savedUsage = localStorage.getItem('compareintel_usage')
            const today = new Date().toDateString()

            if (savedUsage) {
              const usage = JSON.parse(savedUsage)
              if (usage.date === today) {
                setUsageCount(usage.count || 0)
              } else {
                // New day, reset usage
                setUsageCount(0)
              }
            }
          }
        }
      } catch (error) {
        // Silently handle cancellation errors (expected when component unmounts or request is cancelled)
        if (error instanceof Error && error.name === 'CancellationError') {
          // Fallback to localStorage silently
        } else {
          console.error('Failed to sync usage count with backend:', error)
        }
        // Fallback to localStorage
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
        const data = await getAvailableModels()

        if (data.models_by_provider && Object.keys(data.models_by_provider).length > 0) {
          setModelsByProvider(data.models_by_provider)
        } else {
          console.error('No models_by_provider data received')
          setError('No model data received from server')
        }
      } catch (error) {
        // Silently handle cancellation errors (expected when component unmounts)
        if (error instanceof Error && error.name === 'CancellationError') {
          return // Don't show error for cancelled requests
        }
        if (error instanceof ApiError) {
          console.error('Failed to fetch models:', error.status, error.message)
          setError(`Failed to fetch models: ${error.message}`)
        } else {
          console.error(
            'Failed to fetch models:',
            error instanceof Error ? error.message : String(error)
          )
          setError(
            `Failed to fetch models: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      } finally {
        setIsLoadingModels(false)
      }
    }

    fetchModels()
  }, [isAuthenticated, user, setBrowserFingerprint, setError, setUsageCount])

  // Load default selection when models are loaded and default hasn't been overridden
  useEffect(() => {
    // Wait for models to be loaded
    if (isLoadingModels || Object.keys(modelsByProvider).length === 0) {
      return
    }

    // Don't load if default has been overridden in this session
    if (defaultSelectionOverridden) {
      return
    }

    // Don't load if models are already selected (user may have manually selected)
    if (selectedModels.length > 0) {
      return
    }

    // Get default selection
    const defaultSelection = getDefaultSelection()
    if (!defaultSelection) {
      return
    }

    // Load the default selection using the same logic as handleLoadModelSelection
    const modelIds = defaultSelection.modelIds

    // Validate models are still available and within tier limits
    const validModelIds = modelIds
      .map(id => String(id))
      .filter(modelId => {
        // Check if model exists in modelsByProvider
        for (const providerModels of Object.values(modelsByProvider)) {
          const model = providerModels.find(m => String(m.id) === modelId)
          if (model) {
            // Check tier access
            const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
            const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)

            // Filter out premium models for non-paid tiers
            if (model.tier_access === 'paid' && !isPaidTier) {
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

    // Limit to maxModelsLimit
    const limitedModelIds = validModelIds.slice(0, maxModelsLimit)

    if (limitedModelIds.length > 0) {
      setSelectedModels(limitedModelIds)

      // Update dropdown states: expand dropdowns with selections
      setOpenDropdowns(prev => {
        const newSet = new Set(prev)
        let hasChanges = false

        // Expand dropdowns for providers that have selected models
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

  // Refetch credit balance when browserFingerprint becomes available (backup for timing issues)
  useEffect(() => {
    if (!isAuthenticated && browserFingerprint && !user) {
      // Only refetch if we don't already have a credit balance set, or if it's the default 50
      const shouldRefetch = anonymousCreditsRemaining === null || anonymousCreditsRemaining === 50
      if (shouldRefetch) {
        getCreditBalance(browserFingerprint)
          .then(balance => {
            // Only update if we got a different (lower) value, indicating credits were actually used
            if (balance.credits_remaining < 50) {
              setAnonymousCreditsRemaining(balance.credits_remaining)
              setCreditBalance(balance)
            }
          })
          .catch(error => {
            console.error('Failed to refetch anonymous credit balance:', error)
          })
      }
    }
  }, [browserFingerprint, isAuthenticated, user, anonymousCreditsRemaining])

  // Setup scroll chaining for selected models grid
  useEffect(() => {
    const grid = selectedModelsGridRef.current
    if (!grid) return

    const handleWheel = (e: WheelEvent) => {
      const isAtTop = grid.scrollTop === 0
      const isAtBottom = grid.scrollHeight - grid.scrollTop - grid.clientHeight < 1

      // If at top and scrolling up, or at bottom and scrolling down, manually scroll the window
      if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
        // Prevent default to stop the grid from trying to scroll
        e.preventDefault()
        // Manually scroll the window to allow continuation of scrolling beyond grid boundaries
        window.scrollBy({
          top: e.deltaY * 0.5, // Scale down the scroll amount slightly for smoother UX
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
  }, [selectedModels.length]) // Re-run when selected models change

  // Track previous authentication state to detect transitions
  const prevIsAuthenticatedRef = useRef<boolean | null>(null)

  // Track previous user ID to detect user changes (including switching between authenticated users)
  const prevUserIdRef = useRef<number | null | undefined>(null)
  const isInitialMountRef = useRef<boolean>(true)

  // Clear error state whenever the user changes (handles switching between users)
  useEffect(() => {
    const currentUserId = user?.id

    // Skip on initial mount - don't clear errors that might be from a page refresh
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      prevUserIdRef.current = currentUserId
      return
    }

    // If user ID changed (including null/undefined transitions), clear error state
    // Credit errors shouldn't persist across users or when switching auth states
    if (prevUserIdRef.current !== currentUserId) {
      setError(null)
    }

    // Update the ref to track current user ID for next render
    prevUserIdRef.current = currentUserId
  }, [user?.id, setError])

  // Handle authentication state changes (logout and sign-in from unregistered)
  useEffect(() => {
    // Only process transitions if we have a previous state (not initial mount)
    if (prevIsAuthenticatedRef.current === null) {
      // Initial mount - just record the current state and don't clear anything
      prevIsAuthenticatedRef.current = isAuthenticated
      return
    }

    const wasUnregistered = prevIsAuthenticatedRef.current === false
    const isNowAuthenticated = isAuthenticated === true
    const wasAuthenticated = prevIsAuthenticatedRef.current === true
    const isNowUnregistered = isAuthenticated === false

    // Clear all state when signing in from unregistered mode
    if (wasUnregistered && isNowAuthenticated) {
      // Clear all prompts, model choices, results, and related state
      setInput('')
      setResponse(null)
      setError(null)
      setIsLoading(false)
      setConversations([])
      setProcessingTime(null)
      setIsFollowUpMode(false)
      setCurrentVisibleComparisonId(null)
      setSelectedModels([]) // Clear model choices when signing in
      setOriginalSelectedModels([])
      setClosedCards(new Set())
      setActiveResultTabs({})
      setShowDoneSelectingCard(false)
      setIsModelsHidden(false)
      setIsScrollLocked(false)
      setOpenDropdowns(new Set())
      // Reset default selection override state on login
      setDefaultSelectionOverridden(false)
      // Clear credit state from unregistered session - authenticated users have separate credit tracking
      setCreditBalance(null)
      setAnonymousCreditsRemaining(null)
      // Clear any ongoing requests
      if (currentAbortController) {
        currentAbortController.abort()
        setCurrentAbortController(null)
      }
      // Clear scroll refs
      hasScrolledToResultsRef.current = false
      shouldScrollToTopAfterFormattingRef.current = false
    }

    // Reset default selection override state on logout
    if (wasAuthenticated && isNowUnregistered) {
      setDefaultSelectionOverridden(false)
    }

    // Reset page state when user logs out
    if (wasAuthenticated && isNowUnregistered) {
      // Reset all state to default
      setInput('')
      setResponse(null)
      setError(null)
      setIsLoading(false)
      setConversations([])
      setProcessingTime(null)
      setIsFollowUpMode(false)
      // Clear currently visible comparison ID on logout so saved comparisons appear in history
      setCurrentVisibleComparisonId(null)
      // Clear credit state from authenticated session - unregistered users have separate credit tracking
      setCreditBalance(null)
      setAnonymousCreditsRemaining(null)
      // Don't reset selectedModels or usage count - let them keep their selections
    }

    // Update the ref to track current state for next render
    prevIsAuthenticatedRef.current = isAuthenticated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentAbortController])

  // Helper function to reset app state for a clean tutorial experience
  const resetAppStateForTutorial = () => {
    setInput('') // Clear textarea
    setSelectedModels([]) // Deselect all models
    setOriginalSelectedModels([]) // Clear original model selections
    setOpenDropdowns(new Set()) // Collapse all model providers
    setIsFollowUpMode(false) // Exit follow-up mode
    setConversations([]) // Clear conversations
    setResponse(null) // Clear response
    setError(null) // Clear any errors
    setClosedCards(new Set()) // Reset closed cards
    setIsModelsHidden(false) // Show models section
  }

  // Track manual model changes to disable default selection for session
  useEffect(() => {
    // Skip if no default selection
    const defaultSelection = getDefaultSelection()
    if (!defaultSelection) {
      return
    }

    // Skip if no models selected yet (initial state)
    if (selectedModels.length === 0) {
      return
    }

    // Check if current selection matches default selection
    const defaultModelIds = defaultSelection.modelIds.map(id => String(id)).sort()
    const currentModelIds = [...selectedModels].sort()

    const matchesDefault =
      defaultModelIds.length === currentModelIds.length &&
      defaultModelIds.every((id, index) => id === currentModelIds[index])

    // If selection matches default, reset override flag (user manually selected back to default)
    // If selection doesn't match default, mark as overridden (user manually changed from default)
    if (matchesDefault) {
      setDefaultSelectionOverridden(false)
    } else {
      setDefaultSelectionOverridden(true)
    }
  }, [selectedModels, getDefaultSelection])

  const handleCancel = () => {
    if (currentAbortController) {
      userCancelledRef.current = true
      currentAbortController.abort()
      setCurrentAbortController(null)
      setIsLoading(false)
      // Don't set error here - we'll handle it in the catch block
    }
  }

  const closeResultCard = (modelId: string) => {
    setClosedCards(prev => new Set(prev).add(modelId))
  }

  const hideAllOtherModels = (currentModelId: string) => {
    // Get all model IDs from conversations, excluding the current one
    const otherModelIds = conversations
      .map(conv => conv.modelId)
      .filter(id => id !== currentModelId)

    // Add all other model IDs to closedCards
    setClosedCards(prev => {
      const newSet = new Set(prev)
      otherModelIds.forEach(id => newSet.add(id))
      return newSet
    })
  }

  const showAllResults = () => {
    setClosedCards(new Set())
  }

  // Helper function to check if a model failed
  // Handles both raw model IDs (from selectedModels) and formatted model IDs (from conversations)
  const isModelFailed = (modelId: string): boolean => {
    const formattedModelId = createModelId(modelId)

    // Check if model has error flag (check both raw and formatted IDs)
    if (modelErrors[modelId] === true || modelErrors[formattedModelId] === true) {
      return true
    }

    // Check if model has a conversation with error
    // Conversations use formatted model IDs, so check both formats
    const conversation = conversations.find(
      conv => conv.modelId === modelId || conv.modelId === formattedModelId
    )
    if (conversation) {
      const assistantMessages = conversation.messages.filter(msg => msg.type === 'assistant')
      if (assistantMessages.length === 0) {
        return true // No assistant messages means model failed
      }
      const latestMessage = assistantMessages[assistantMessages.length - 1]
      if (latestMessage && isErrorMessage(latestMessage.content)) {
        return true // Latest message is an error
      }
    }

    return false
  }

  // Helper function to get successful models (models that didn't fail)
  const getSuccessfulModels = (models: string[]): string[] => {
    return models.filter(modelId => !isModelFailed(modelId))
  }

  // Helper function to check if follow-up should be disabled based on model selection changes or all models failed
  const isFollowUpDisabled = () => {
    if (originalSelectedModels.length === 0) {
      return false // No original comparison yet, so follow-up is not applicable
    }

    // Check if any new models have been added (models in selectedModels that weren't in originalSelectedModels)
    const hasNewModels = selectedModels.some(model => !originalSelectedModels.includes(model))

    // If new models were added, disable follow-up
    if (hasNewModels) {
      return true
    }

    // Check if all models failed - if so, disable follow-up
    const successfulModels = getSuccessfulModels(originalSelectedModels)
    if (successfulModels.length === 0) {
      return true // All models failed, hide Follow Up button
    }

    return false
  }

  const handleFollowUp = () => {
    followUpJustActivatedRef.current = true
    setIsFollowUpMode(true)
    // Only clear input if it's empty - preserve text if user has typed something
    if (!input.trim()) {
      setInput('')
    }
    setIsModelsHidden(true) // Collapse the models section when entering follow-up mode

    // Scroll to top of page smoothly
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })

    // Wait for state to update, then scroll to the input section
    setTimeout(() => {
      const inputSection = document.querySelector('.input-section')
      if (inputSection) {
        // Get the h2 heading inside the input section
        const heading = inputSection.querySelector('h2')
        if (heading) {
          heading.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        } else {
          // Fallback to scrolling to the section itself
          inputSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
      }
      // Reset the flag after scrolling
      followUpJustActivatedRef.current = false
    }, 250) // Increased delay to ensure DOM updates

    // Focus the textarea after scroll completes
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    }, 650) // Wait for scroll to complete
  }

  const handleContinueConversation = () => {
    if (!input.trim()) {
      setError('Please enter a follow-up question or code')
      return
    }
    handleSubmit()
  }

  const handleNewComparison = () => {
    setIsFollowUpMode(false)
    // Only clear input if it's empty - preserve text if user has typed something
    if (!input.trim()) {
      setInput('')
    }
    setConversations([])
    setResponse(null)
    setClosedCards(new Set())
    setError(null)
    setOriginalSelectedModels([]) // Reset original models for new comparison
    setIsModelsHidden(false) // Show models section again for new comparison
    // Clear currently visible comparison ID
    setCurrentVisibleComparisonId(null)
    setModelErrors({})
    hasScrolledToResultsOnFirstChunkRef.current = false // Reset scroll tracking for first chunk
    // Clear attached files when starting a new comparison
    setAttachedFiles([])
  }

  /**
   * Handle breaking out a model from a multi-model comparison into its own conversation
   * This creates a new conversation with only the selected model's messages
   */
  const handleBreakout = async (modelId: string) => {
    // Get the current conversation ID
    const conversationId = currentVisibleComparisonId
    if (!conversationId) {
      setError('No active conversation to break out from')
      return
    }

    try {
      // Phase 1: Fade out old cards
      setBreakoutPhase('fading-out')

      // Wait for fade-out animation to complete (300ms)
      await new Promise(resolve => setTimeout(resolve, 300))

      // Phase 2: Hide everything while we update state
      setBreakoutPhase('hidden')

      // Scroll to top instantly while screen is blank (user won't see the scroll)
      window.scrollTo({ top: 0, behavior: 'instant' })

      let breakoutConversationId: string
      let breakoutMessages: ConversationMessage[]

      if (isAuthenticated) {
        // Authenticated users: create breakout via API
        const breakoutConversation = await createBreakoutConversation({
          parent_conversation_id: parseInt(conversationId, 10),
          model_id: modelId,
        })

        // Clear cache for conversations endpoint to ensure fresh data
        apiClient.deleteCache('GET:/conversations')

        // Reload history to include the new breakout conversation
        await loadHistoryFromAPI()

        // Extract the conversation data
        breakoutConversationId = String(breakoutConversation.id)
        breakoutMessages = breakoutConversation.messages.map(msg => ({
          id: createMessageId(`${breakoutConversation.id}-${msg.id}`),
          type: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.created_at,
          input_tokens: msg.input_tokens,
          output_tokens: msg.output_tokens,
        }))
      } else {
        // Unregistered users: create breakout in localStorage
        // Load the parent conversation
        const parentData = loadConversationFromLocalStorage(conversationId)
        if (!parentData) {
          setError('Failed to load parent conversation')
          setBreakoutPhase('idle')
          return
        }

        // Filter messages to only include user messages and assistant messages from the breakout model
        const filteredMessages: StoredMessage[] = parentData.messages.filter(
          msg => msg.role === 'user' || (msg.role === 'assistant' && msg.model_id === modelId)
        )

        // Create breakout conversation ID
        breakoutConversationId = Date.now().toString()

        // Convert to ConversationMessage format
        breakoutMessages = filteredMessages.map((msg, idx) => ({
          id: createMessageId(`${breakoutConversationId}-${idx}`),
          type: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.created_at || new Date().toISOString(),
          input_tokens: msg.input_tokens,
          output_tokens: msg.output_tokens,
        }))

        // Save breakout conversation to localStorage
        const breakoutModelConversationForStorage: ModelConversation = {
          modelId: createModelId(modelId),
          messages: breakoutMessages,
        }

        saveConversationToLocalStorage(
          parentData.input_data,
          [modelId],
          [breakoutModelConversationForStorage],
          false, // isUpdate
          parentData.file_contents,
          'breakout',
          conversationId,
          modelId
        )

        // Reload history to include the new breakout conversation
        const reloadedHistory = loadHistoryFromLocalStorage()
        setConversationHistory(reloadedHistory)
      }

      // Set up the breakout conversation UI
      const breakoutModelConversation: ModelConversation = {
        modelId: createModelId(modelId),
        messages: breakoutMessages,
      }

      // Clear the current comparison state and set up breakout mode
      setConversations([breakoutModelConversation])
      setSelectedModels([modelId])
      setOriginalSelectedModels([modelId])
      setClosedCards(new Set())
      setIsFollowUpMode(true)
      setCurrentVisibleComparisonId(breakoutConversationId)
      setInput('') // Clear input for new follow-up
      setError(null)
      setIsModelsHidden(true) // Hide models section in breakout mode

      // Track this model as broken out (for informational purposes)
      // Note: Users can still create additional breakouts with the same model
      // Convert to string to match the format from API/localStorage
      setAlreadyBrokenOutModels(prev => new Set(prev).add(String(modelId)))

      // Wait a brief moment for DOM to update with the new card (still hidden)
      await new Promise(resolve => setTimeout(resolve, 50))

      // Phase 3: Fade in the new card
      setBreakoutPhase('fading-in')

      // Clear the phase after animation completes
      setTimeout(() => {
        setBreakoutPhase('idle')
      }, 300)

      // Focus the textarea after fade-in animation completes
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
        }
      }, 350)

      // Show success notification (extended duration: 5 seconds instead of default 3)
      const model = allModels.find(m => m.id === modelId)
      const notification = showNotification(
        `Broke out conversation with ${model?.name || modelId}. You can now continue the conversation with this model only.`,
        'success'
      )
      // Clear the default 3-second timeout and manually remove after 5 seconds
      notification.clearAutoRemove()
      setTimeout(() => {
        notification()
      }, 5000)

      // Breakout tracking removed - step 6 is now enter-prompt-2
      setTutorialHasBreakout(true)
    } catch (err) {
      console.error('Failed to create breakout conversation:', err)
      setError('Failed to break out conversation. Please try again.')
      setBreakoutPhase('idle') // Reset phase on error
    }
  }

  // Function to scroll all conversation content areas to the last user message
  const scrollConversationsToBottom = () => {
    // Use a small delay to ensure DOM has updated
    setTimeout(() => {
      const conversationContents = document.querySelectorAll('.conversation-content')
      conversationContents.forEach(content => {
        // Find all user messages in this conversation
        const userMessages = content.querySelectorAll('.conversation-message.user')
        if (userMessages.length > 0) {
          // Get the last user message
          const lastUserMessage = userMessages[userMessages.length - 1]

          // Calculate the position of the last user message relative to the conversation content
          const messageRect = lastUserMessage.getBoundingClientRect()
          const containerRect = content.getBoundingClientRect()
          const relativeTop = messageRect.top - containerRect.top + content.scrollTop

          // Scroll to position the last user message at the top of the conversation container
          content.scrollTo({
            top: relativeTop,
            behavior: 'smooth',
          })
        } else {
          // Fallback to scrolling to bottom if no user message found
          content.scrollTop = content.scrollHeight
        }
      })
    }, 100)
  }

  // Set up the comparison streaming hook
  const { submitComparison } = useComparisonStreaming(
    {
      // User/Auth state
      isAuthenticated,
      user,
      browserFingerprint,
      // Model state
      selectedModels,
      modelsByProvider,
      originalSelectedModels,
      // Input state
      input,
      attachedFiles,
      accurateInputTokens,
      webSearchEnabled,
      userLocation,
      // Conversation state
      conversations,
      isFollowUpMode,
      currentVisibleComparisonId,
      // Credit state
      creditBalance,
      anonymousCreditsRemaining,
      creditWarningType,
      // Model errors state
      modelErrors,
      // Tutorial state
      tutorialState,
      // Refs
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
      // State setters
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
      // Credit state setters
      setAnonymousCreditsRemaining,
      setCreditBalance,
      setCreditWarningMessage,
      setCreditWarningType,
      setCreditWarningDismissible,
      // Helper functions
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

  // Note: handleDoneSelecting is now provided by useDoneSelectingCard hook

  // Handler for submit button that provides helpful validation messages
  const handleSubmitClick = () => {
    // Clear "input too long" error when clicking submit
    if (error && error.includes('Your input is too long for one or more of the selected models')) {
      setError(null)
    }

    // Clear animations when submitting
    if (animationTimeoutRef.current !== null) {
      window.clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = null
    }
    setIsAnimatingButton(false)
    setIsAnimatingTextarea(false)

    // Check if user is logged in but not verified
    if (user && !user.is_verified) {
      setError(
        'Please verify your email address before making comparisons. Check your inbox for a verification link from CompareIntel.'
      )
      // Scroll to the top to show the verification banner
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    // Note: Validation for empty input and no models selected is now handled
    // by disabling the submit button, so those checks are no longer needed here.

    // Check if user has credits before submitting
    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
    const creditsAllocated =
      creditBalance?.credits_allocated ??
      (isAuthenticated && user
        ? user.monthly_credits_allocated || getCreditAllocation(userTier)
        : getDailyCreditLimit(userTier) || getCreditAllocation(userTier))

    // Calculate credits remaining using the same logic as renderUsagePreview
    let currentCreditsRemaining: number
    if (!isAuthenticated && anonymousCreditsRemaining !== null) {
      currentCreditsRemaining = anonymousCreditsRemaining
    } else if (creditBalance?.credits_remaining !== undefined) {
      currentCreditsRemaining = creditBalance.credits_remaining
    } else {
      const creditsUsed =
        creditBalance?.credits_used_this_period ??
        creditBalance?.credits_used_today ??
        (isAuthenticated && user ? user.credits_used_this_period || 0 : 0)
      currentCreditsRemaining = Math.max(0, creditsAllocated - creditsUsed)
    }

    // Prevent submission if credits are 0
    if (currentCreditsRemaining <= 0) {
      // Exit follow-up mode if in it
      if (isFollowUpMode) {
        setIsFollowUpMode(false)
      }
      const tierName = user?.subscription_tier || 'free'
      if (tierName === 'unregistered' || tierName === 'free') {
        setError(
          "You've run out of credits. Credits will reset tomorrow, or sign-up for a free account to get more credits!"
        )
      } else {
        setError(
          "You've run out of credits. Please wait for credits to reset or upgrade your plan."
        )
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    submitComparison()
  }

  // NOTE: handleSubmit logic has been moved to useComparisonStreaming hook
  // The submitComparison() function now handles all comparison streaming logic

  // Note: creditsRemaining calculation and exit follow-up mode effect are now in useCreditsRemaining hook

  // Check credits and set error message if credits are 0 (persists across page refresh and login/logout)
  useEffect(() => {
    // Only check if we have credit data available
    // Skip if credits are still loading (null/undefined)
    if (creditsRemaining === null || creditsRemaining === undefined) {
      return
    }

    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'

    // Only use creditBalance if it matches the current user's tier to prevent cross-contamination
    const resetDate =
      (creditBalance?.subscription_tier === userTier ? creditBalance?.credits_reset_at : null) ||
      user?.credits_reset_at

    // Verify that creditBalance matches current user type before using it
    // This prevents unregistered user's zero credits from affecting authenticated users
    const creditBalanceMatchesUser = !creditBalance || creditBalance.subscription_tier === userTier

    // Only check credits if creditBalance matches current user (or if we're using fallback calculation)
    if (!creditBalanceMatchesUser && creditBalance) {
      // creditBalance is for a different user type - ignore it and use fallback
      return
    }

    // Check if credits are 0
    if (creditsRemaining <= 0) {
      // Calculate what the error message should be for 0 credits
      const expectedErrorMessage = getCreditWarningMessage(
        'none',
        userTier,
        creditsRemaining,
        undefined,
        resetDate
      )

      // Set error message if credits are 0 and error is not already set correctly
      // Also clear creditWarningMessage to prevent duplicate messages
      if (error !== expectedErrorMessage) {
        setError(expectedErrorMessage)
        // Clear credit warning message to prevent duplicate display
        if (creditWarningMessage && creditWarningMessage === expectedErrorMessage) {
          setCreditWarningMessage(null)
          setCreditWarningType('none')
        }
      }
    } else {
      // If credits are > 0, clear error if it's a credit-related error
      // Check if error matches credit error patterns (to avoid clearing other errors)
      if (
        error &&
        (error.includes("You've run out of credits") ||
          error.includes('run out of credits') ||
          (error.includes('credits') && error.includes('reset')))
      ) {
        setError(null)
      }
    }
  }, [
    creditsRemaining,
    creditBalance,
    user,
    isAuthenticated,
    getCreditWarningMessage,
    error,
    setError,
    creditWarningMessage,
    setCreditWarningMessage,
    setCreditWarningType,
  ])

  // Helper function to render usage preview (used in both regular and follow-up modes)
  // Wrapped in useCallback with dependencies so ComparisonForm (memoized) re-renders when credits change
  const renderUsagePreview = useCallback(() => {
    // Calculate what will be used
    const regularToUse = selectedModels.length

    // Credit estimation removed - no longer needed since comparisons proceed regardless

    return (
      <div
        style={{
          marginTop: '0.5rem',
          fontSize: '0.825rem',
          color: 'rgba(255, 255, 255, 0.85)',
        }}
      >
        {/* Credits Display (Primary) */}
        <span>
          <strong>{regularToUse}</strong> {regularToUse === 1 ? 'model' : 'models'} selected •{' '}
          <strong>{Math.round(creditsRemaining)}</strong> credits remaining
        </span>
      </div>
    )
  }, [selectedModels, creditsRemaining])

  return (
    <div className="app">
      {/* Mock Mode Banner - Show when mock mode is enabled for current user */}
      {user?.mock_mode_enabled && currentView === 'main' && (
        <MockModeBanner isAnonymous={false} isDev={import.meta.env.DEV} />
      )}

      {/* Anonymous Mock Mode Banner - Show when anonymous mock mode is enabled (development only) */}
      {/* Only show when auth has finished loading (!authLoading) to prevent flash on refresh */}
      {!authLoading && !user && anonymousMockModeEnabled && currentView === 'main' && (
        <MockModeBanner isAnonymous={true} isDev={true} />
      )}

      {/* Admin Panel - Show if user is admin and in admin view */}
      {currentView === 'admin' && user?.is_admin ? (
        <Suspense
          fallback={<LoadingSpinner size="large" modern={true} message="Loading admin panel..." />}
        >
          <AdminPanel onClose={() => navigate('/')} />
        </Suspense>
      ) : (
        <>
          {/* Done Selecting? Floating Card - Fixed position at screen center */}
          {/* Note: Visibility logic (including tutorial check) handled by useDoneSelectingCard hook */}
          {showDoneSelectingCard && <DoneSelectingCard onDone={handleDoneSelecting} />}

          <Navigation
            isAuthenticated={isAuthenticated}
            isAdmin={user?.is_admin || false}
            currentView={currentView}
            onViewChange={view => navigate(view === 'admin' ? '/admin' : '/')}
            onSignInClick={() => {
              setAuthModalMode('login')
              setIsAuthModalOpen(true)
            }}
            onSignUpClick={() => {
              setAuthModalMode('register')
              setIsAuthModalOpen(true)
            }}
            onTutorialClick={
              !isAuthenticated
                ? () => {
                    resetAppStateForTutorial() // Reset app state for clean tutorial experience
                    startTutorial() // Start the tutorial (includes resetting localStorage)
                  }
                : undefined
            }
          />

          {/* Email verification banners - placed between header and main content */}
          {/* Only show VerifyEmail if we're NOT in password reset mode */}
          {!showPasswordReset && !authLoading && (
            <>
              <VerifyEmail
                onClose={() => {}}
                externalToken={verificationToken}
                suppressVerification={suppressVerification}
              />
              <VerificationBanner />
            </>
          )}

          {/* Password reset modal */}
          {showPasswordReset && <ResetPassword onClose={handlePasswordResetClose} />}

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
                  showHistoryDropdown={showHistoryDropdown}
                  setShowHistoryDropdown={setShowHistoryDropdown}
                  conversationHistory={conversationHistory}
                  isLoadingHistory={isLoadingHistory}
                  historyLimit={historyLimit}
                  currentVisibleComparisonId={currentVisibleComparisonId}
                  onSubmitClick={handleSubmitClick}
                  onContinueConversation={handleContinueConversation}
                  onNewComparison={handleNewComparison}
                  onLoadConversation={loadConversation}
                  onDeleteConversation={deleteConversation}
                  renderUsagePreview={renderUsagePreview}
                  selectedModels={selectedModels}
                  modelsByProvider={modelsByProvider}
                  onAccurateTokenCountChange={setAccurateInputTokens}
                  creditsRemaining={creditsRemaining}
                  savedModelSelections={savedModelSelections}
                  onSaveModelSelection={handleSaveModelSelection}
                  onLoadModelSelection={handleLoadModelSelection}
                  onDeleteModelSelection={deleteModelSelection}
                  onSetDefaultSelection={setDefaultSelection}
                  getDefaultSelectionId={getDefaultSelectionId}
                  getDefaultSelection={getDefaultSelection}
                  defaultSelectionOverridden={defaultSelectionOverridden}
                  canSaveMoreSelections={canSaveMoreSelections}
                  maxSavedSelections={maxSavedSelections}
                  attachedFiles={attachedFiles}
                  setAttachedFiles={setAttachedFiles}
                  onExpandFiles={expandFiles}
                  webSearchEnabled={webSearchEnabled}
                  onWebSearchEnabledChange={setWebSearchEnabled}
                  tutorialStep={tutorialState.currentStep}
                />
              </ErrorBoundary>
            </Hero>

            {/* Credit Warning Messages */}
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

            {error && (
              <div className="error-message" ref={errorMessageRef}>
                <span>⚠️ {error}</span>
              </div>
            )}

            <ErrorBoundary>
              <section className="models-section" ref={modelsSectionRef}>
                <ModelsSectionHeader
                  selectedModels={selectedModels}
                  maxModelsLimit={maxModelsLimit}
                  isModelsHidden={isModelsHidden}
                  isFollowUpMode={isFollowUpMode}
                  isAuthenticated={isAuthenticated}
                  user={user}
                  isWideLayout={isWideLayout}
                  isMobileLayout={isMobileLayout}
                  hidePremiumModels={hidePremiumModels}
                  openDropdowns={openDropdowns}
                  response={response}
                  conversations={conversations}
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
                />

                {!isModelsHidden && (
                  <ModelsSection
                    modelsByProvider={modelsByProvider}
                    selectedModels={selectedModels}
                    originalSelectedModels={originalSelectedModels}
                    openDropdowns={openDropdowns}
                    allModels={allModels}
                    isLoadingModels={isLoadingModels}
                    isFollowUpMode={isFollowUpMode}
                    maxModelsLimit={maxModelsLimit}
                    hidePremiumModels={hidePremiumModels}
                    isAuthenticated={isAuthenticated}
                    user={user}
                    selectedModelsGridRef={selectedModelsGridRef}
                    onToggleDropdown={toggleDropdown}
                    onToggleModel={handleModelToggle}
                    onToggleAllForProvider={toggleAllForProvider}
                    onError={setError}
                  />
                )}
              </section>
            </ErrorBoundary>

            {isLoading && (
              <LoadingSection selectedModelsCount={selectedModels.length} onCancel={handleCancel} />
            )}

            {(response || conversations.length > 0) && (
              <ErrorBoundary>
                <section className="results-section">
                  <ResultsSectionHeader
                    conversationsCount={conversations.length}
                    isScrollLocked={isScrollLocked}
                    onToggleScrollLock={() => setIsScrollLocked(!isScrollLocked)}
                    isFollowUpMode={isFollowUpMode}
                    isFollowUpDisabled={isFollowUpDisabled()}
                    followUpDisabledReason="Cannot follow up when new models are selected. You can follow up if you only deselect models from the original comparison."
                    onFollowUp={handleFollowUp}
                    showExportMenu={showExportMenu}
                    onToggleExportMenu={() => setShowExportMenu(!showExportMenu)}
                    exportMenuRef={exportMenuRef}
                    onExport={handleExport}
                    closedCardsCount={closedCards.size}
                    onShowAllResults={showAllResults}
                    isMobileLayout={isMobileLayout}
                  />

                  {/* Results grid - uses ResultsDisplay for both mobile tabbed and desktop grid views */}
                  <ResultsDisplay
                    conversations={conversations}
                    selectedModels={selectedModels}
                    closedCards={closedCards}
                    allModels={allModels}
                    activeResultTabs={activeResultTabs}
                    modelProcessingStates={modelProcessingStates}
                    modelErrorStates={modelErrorStates}
                    breakoutPhase={breakoutPhase}
                    onScreenshot={handleScreenshot}
                    onCopyResponse={handleCopyResponse}
                    onCloseCard={closeResultCard}
                    onSwitchTab={switchResultTab}
                    onBreakout={handleBreakout}
                    onHideOthers={hideAllOtherModels}
                    onCopyMessage={handleCopyMessage}
                  />
                </section>
              </ErrorBoundary>
            )}
          </ComparisonView>

          {/* Auth Modal */}
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => {
              setIsAuthModalOpen(false)
              setLoginEmail('') // Reset email when modal closes
            }}
            initialMode={authModalMode}
            initialEmail={loginEmail}
          />

          {/* Install Prompt - Only show in production */}
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

          {/* Premium Models Toggle Info Modal - shown on mobile layout */}
          <PremiumModelsToggleInfoModal
            isOpen={showPremiumModelsToggleModal}
            onClose={() => {
              setShowPremiumModelsToggleModal(false)
              // After closing modal, toggle the premium models visibility
              setHidePremiumModels(!hidePremiumModels)
            }}
            onDontShowAgain={checked => {
              if (checked) {
                localStorage.setItem('premium-models-toggle-info-dismissed', 'true')
              } else {
                localStorage.removeItem('premium-models-toggle-info-dismissed')
              }
            }}
          />

          {/* Disabled Button Info Modal - shown on mobile layout when buttons are disabled */}
          <DisabledButtonInfoModal
            isOpen={disabledButtonInfo.button !== null}
            onClose={() => setDisabledButtonInfo({ button: null, message: '' })}
            buttonType={disabledButtonInfo.button}
            message={disabledButtonInfo.message}
          />
        </>
      )}
    </div>
  )
}

// Wrap AppContent with AuthProvider and top-level ErrorBoundary
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          {/* Layout wrapper provides consistent footer across all pages */}
          <Route element={<Layout />}>
            {/* SEO Content Pages - Lazy loaded for better code splitting */}
            <Route
              path="/about"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <About />
                </Suspense>
              }
            />
            <Route
              path="/features"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <Features />
                </Suspense>
              }
            />
            <Route
              path="/how-it-works"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <HowItWorks />
                </Suspense>
              }
            />
            <Route
              path="/faq"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <FAQ />
                </Suspense>
              }
            />
            <Route
              path="/privacy-policy"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <PrivacyPolicy />
                </Suspense>
              }
            />
            <Route
              path="/terms-of-service"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <TermsOfService />
                </Suspense>
              }
            />
            {/* Main Application */}
            <Route path="*" element={<AppContent />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
