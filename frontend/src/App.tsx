import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
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
const LatexRenderer = lazy(() => import('./components/LatexRenderer'))
const AdminPanel = lazy(() => import('./components/admin/AdminPanel'))
import { Footer } from './components'
import { AuthModal, VerifyEmail, VerificationBanner, ResetPassword } from './components/auth'
import { ComparisonForm } from './components/comparison'
import { Navigation, Hero, MockModeBanner } from './components/layout'
import { DoneSelectingCard, ErrorBoundary, LoadingSpinner } from './components/shared'
import { TermsOfService } from './components/TermsOfService'
import { getDailyLimit, getCreditAllocation, getDailyCreditLimit } from './config/constants'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import {
  useConversationHistory,
  useBrowserFingerprint,
  useRateLimitStatus,
  useModelSelection,
  useModelComparison,
} from './hooks'
import { apiClient } from './services/api/client'
import { ApiError, PaymentRequiredError } from './services/api/errors'
import {
  getAnonymousMockModeStatus,
  getRateLimitStatus,
  resetRateLimit,
  compareStream,
} from './services/compareService'
import { getConversation } from './services/conversationService'
import { getCreditBalance } from './services/creditService'
import type { CreditBalance } from './services/creditService'
import { getAvailableModels } from './services/modelsService'
import type {
  CompareResponse,
  ConversationMessage,
  StoredMessage,
  ModelConversation,
  ModelsByProvider,
  ConversationSummary,
  ConversationRound,
  ResultTab,
  ActiveResultTabs,
} from './types'
import { RESULT_TAB, createModelId, createConversationId, createMessageId } from './types'
import {
  generateBrowserFingerprint,
  showNotification,
  getSafeId,
  formatTime,
  formatNumber,
  formatConversationMessage,
} from './utils'
import { isErrorMessage } from './utils/error'

function AppContent() {
  const { isAuthenticated, user, refreshUser, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Determine current view from route
  const currentView = location.pathname === '/admin' ? 'admin' : 'main'

  // Route protection: redirect non-admin users away from /admin
  // Only redirect if we're definitely not an admin (not just during loading/transitions)
  useEffect(() => {
    if (location.pathname === '/admin' && !authLoading) {
      // Only redirect if we're certain the user is not an admin
      // Don't redirect if user is null/undefined (might be during transitions)
      // Only redirect if explicitly not authenticated OR explicitly not admin
      if (isAuthenticated === false) {
        navigate('/', { replace: true });
      } else if (isAuthenticated === true && user !== null && user !== undefined && user.is_admin === false) {
        navigate('/', { replace: true });
      }
      // If isAuthenticated is true but user is null/undefined, don't redirect (might be loading)
    }
  }, [location.pathname, isAuthenticated, user, authLoading, navigate])

  // Custom hooks for state management
  const browserFingerprintHook = useBrowserFingerprint()
  const { browserFingerprint, setBrowserFingerprint } = browserFingerprintHook

  const rateLimitHook = useRateLimitStatus({ isAuthenticated, browserFingerprint })
  const {
    usageCount,
    setUsageCount,
    fetchRateLimitStatus,
  } = rateLimitHook

  const modelSelectionHook = useModelSelection({ isAuthenticated, user })
  const {
    selectedModels,
    setSelectedModels,
    originalSelectedModels,
    setOriginalSelectedModels,
    maxModelsLimit,
  } = modelSelectionHook

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
    processingTime,
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

  // State not covered by hooks (declare before callbacks that use them)
  const selectedModelsGridRef = useRef<HTMLDivElement>(null)
  const scrolledToTopRef = useRef<Set<string>>(new Set()) // Track which model cards have been scrolled to top
  const shouldScrollToTopAfterFormattingRef = useRef<boolean>(false) // Track if we should scroll to top after all models format (initial comparison only)
  const isPageScrollingRef = useRef<boolean>(false) // Track if user is scrolling the page
  const [modelsByProvider, setModelsByProvider] = useState<ModelsByProvider>({})
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set())
  const [, setUserMessageTimestamp] = useState<string>('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showDoneSelectingCard, setShowDoneSelectingCard] = useState(false)
  const modelsSectionRef = useRef<HTMLDivElement>(null)
  const [isAnimatingButton, setIsAnimatingButton] = useState(false)
  const [isAnimatingTextarea, setIsAnimatingTextarea] = useState(false)
  const animationTimeoutRef = useRef<number | null>(null)
  const [isModelsHidden, setIsModelsHidden] = useState(false)
  const [isMetadataCollapsed, setIsMetadataCollapsed] = useState(false)
  const [modelErrors, setModelErrors] = useState<{ [key: string]: boolean }>({})
  const [anonymousCreditsRemaining, setAnonymousCreditsRemaining] = useState<number | null>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [creditWarningMessage, setCreditWarningMessage] = useState<string | null>(null)
  const [creditWarningType, setCreditWarningType] = useState<'low' | 'insufficient' | 'none' | null>(null)
  const [creditWarningDismissible, setCreditWarningDismissible] = useState(false)

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
  ])

  const conversationHistoryHook = useConversationHistory({
    isAuthenticated,
    user,
    onDeleteActiveConversation: handleDeleteActiveConversation,
  })

  // Helper function to get credit warning message based on tier and scenario
  const getCreditWarningMessage = useCallback((
    type: 'low' | 'insufficient' | 'none',
    tier: string,
    creditsRemaining: number,
    estimatedCredits?: number,
    creditsResetAt?: string
  ): string => {
    if (type === 'none') {
      // No Credits scenario
      if (tier === 'anonymous') {
        return "You've run out of credits. Credits will reset to 50 tomorrow, or sign-up for a free account to get more credits, more models, and more history!"
      } else if (tier === 'free') {
        return "You've run out of credits. Credits will reset to 100 tomorrow, or upgrade your plan for more credits, more models, and more history!"
      } else if (tier === 'pro_plus') {
        const resetDate = creditsResetAt ? new Date(creditsResetAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'N/A'
        return `You've run out of credits which will reset on ${resetDate}. Wait until your reset, or sign-up for model comparison overages.`
      } else {
        // starter, starter_plus, pro
        const resetDate = creditsResetAt ? new Date(creditsResetAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'N/A'
        return `You've run out of credits which will reset on ${resetDate}. Consider upgrading your plan for more credits, more models per comparison, and more history!`
      }
    } else if (type === 'insufficient') {
      // Possible Insufficient Credits scenario
      return `This comparison is estimated to take ${estimatedCredits?.toFixed(1) || 'X'} credits and you have ${Math.round(creditsRemaining)} credits remaining. The model responses may be truncated. If possible, try selecting less models or shorten your input.`
    } else {
      // Low Credits scenario
      if (tier === 'anonymous') {
        return `You have ${Math.round(creditsRemaining)} credits left for today. Credits will reset to 50 tomorrow, or sign-up for a free account to get more credits, more models, and more history!`
      } else if (tier === 'free') {
        return `You have ${Math.round(creditsRemaining)} credits left for today. Credits will reset to 100 tomorrow, or upgrade your plan for more credits, more models, and more history!`
      } else if (tier === 'pro_plus') {
        return `You have ${Math.round(creditsRemaining)} credits left in your monthly billing cycle. Wait until your cycle starts again, or sign-up for model comparison overages.`
      } else {
        // starter, starter_plus, pro
        return `You have ${Math.round(creditsRemaining)} credits left in your monthly billing cycle. Consider upgrading your plan for more credits, more models per comparison, and more history!`
      }
    }
  }, [])

  // Helper function to check if low credit warning was dismissed for current period
  const isLowCreditWarningDismissed = useCallback((tier: string, periodType: 'daily' | 'monthly', creditsResetAt?: string): boolean => {
    if (periodType === 'daily') {
      const today = new Date().toDateString()
      const dismissedDate = localStorage.getItem(`credit-warning-dismissed-${tier}-daily`)
      return dismissedDate === today
    } else {
      // Monthly - check if dismissed for current billing period
      if (!creditsResetAt) return false
      const resetDate = new Date(creditsResetAt).toDateString()
      const dismissedResetDate = localStorage.getItem(`credit-warning-dismissed-${tier}-monthly`)
      return dismissedResetDate === resetDate
    }
  }, [])

  // Helper function to dismiss low credit warning for current period
  const dismissLowCreditWarning = useCallback((tier: string, periodType: 'daily' | 'monthly', creditsResetAt?: string) => {
    if (periodType === 'daily') {
      const today = new Date().toDateString()
      localStorage.setItem(`credit-warning-dismissed-${tier}-daily`, today)
    } else {
      if (creditsResetAt) {
        const resetDate = new Date(creditsResetAt).toDateString()
        localStorage.setItem(`credit-warning-dismissed-${tier}-monthly`, resetDate)
      }
    }
    setCreditWarningMessage(null)
    setCreditWarningType(null)
    setCreditWarningDismissible(false)
  }, [])

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
  // Track wide layout to coordinate header control alignment with toggle
  const [isWideLayout, setIsWideLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth > 1000 // match CSS breakpoint
  })

  useEffect(() => {
    const handleResize = () => setIsWideLayout(window.innerWidth > 1000)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-collapse metadata section when screen size triggers toggle layout (<= 1200px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1200) {
        setIsMetadataCollapsed(true)
      } else {
        setIsMetadataCollapsed(false)
      }
    }

    // Set initial state
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // State for mobile tooltip visibility (capability tiles)
  const [visibleTooltip, setVisibleTooltip] = useState<string | null>(null)

  // Handle capability tile tap on mobile to show tooltip
  const handleCapabilityTileTap = (tileId: string) => {
    // Only show tooltip on mobile (screen width <= 768px)
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
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

  // State to trigger verification from another tab
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  // State to prevent new tab from verifying while checking for existing tabs
  // Initialize suppressVerification based on whether this is a new tab with a token
  const [suppressVerification, setSuppressVerification] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const hasTokenInUrl = urlParams.get('token') !== null
    const isNewTab = window.opener === null
    return hasTokenInUrl && isNewTab
  })

  // State to track if we're in password reset mode
  const [showPasswordReset, setShowPasswordReset] = useState(false)

  // Check for password reset token on mount (for direct navigation or non-tab scenarios)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const path = window.location.pathname
    const fullUrl = window.location.href

    // Show password reset if URL contains reset-password and a token
    // This handles cases where user directly navigates to the URL (not from email link in new tab)
    if (token && (path.includes('reset-password') || fullUrl.includes('reset-password'))) {
      setShowPasswordReset(true)
    }
  }, [])

  // Handle password reset close
  const handlePasswordResetClose = (email?: string) => {
    setShowPasswordReset(false)
    // Clear the token from URL
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.pushState({}, '', url)
    // Open login modal with the email if provided
    if (email) {
      setLoginEmail(email)
    }
    setIsAuthModalOpen(true)
    setAuthModalMode('login')
  }

  // Listen for verification messages from email and handle tab coordination
  useEffect(() => {
    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel === 'undefined') {
      console.error('[App] BroadcastChannel is not supported in this browser!')
      return
    }

    const channel = new BroadcastChannel('compareintel-verification')
    let hasExistingTab = false

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'verify-email' && event.data.token) {
        // An existing tab (this one) received a verification token from a new tab
        // Update URL without page reload and trigger verification
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('token', event.data.token)
        window.history.pushState({}, '', newUrl)

        // Set the token to trigger verification in VerifyEmail component
        setVerificationToken(event.data.token)

        // Focus this tab
        window.focus()
      } else if (event.data.type === 'password-reset' && event.data.token) {
        // An existing tab (this one) received a password reset token from a new tab
        // Close the "Check Your Email" dialog if it's open
        setIsAuthModalOpen(false)

        // Update URL without page reload
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('token', event.data.token)
        if (!newUrl.pathname.includes('reset-password')) {
          newUrl.pathname = '/reset-password'
        }
        window.history.pushState({}, '', newUrl)

        // Show the password reset form
        setShowPasswordReset(true)

        // Focus this tab
        window.focus()
      } else if (event.data.type === 'ping') {
        // Another tab is checking if we exist - always respond for both email verification and password reset
        hasExistingTab = true
        channel.postMessage({ type: 'pong' })
      } else if (event.data.type === 'pong') {
        // An existing tab responded to our ping
        hasExistingTab = true
      }
    }

    channel.addEventListener('message', handleMessage)

    // Check if this is a verification page opened from email
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const path = window.location.pathname
    const fullUrl = window.location.href
    const isPasswordReset = path.includes('reset-password') || fullUrl.includes('reset-password')

    if (token && window.opener === null) {
      // This is a new tab opened from email with a token
      // Use tab coordination for both email verification AND password reset

      // Note: suppressVerification is already true from initial state

      // Ping to see if there's an existing CompareIntel tab
      channel.postMessage({ type: 'ping' })

      // Wait a moment to see if any existing tab responds
      setTimeout(() => {
        if (hasExistingTab) {
          // An existing tab exists - send the token to it and close this tab
          if (isPasswordReset) {
            // Send password reset token
            channel.postMessage({
              type: 'password-reset',
              token: token,
            })
          } else {
            // Send email verification token
            channel.postMessage({
              type: 'verify-email',
              token: token,
            })
          }

          // Give the existing tab time to process, then close this tab
          setTimeout(() => {
            window.close()
          }, 500)
        } else {
          // No existing tab found - handle in this tab
          if (isPasswordReset) {
            setShowPasswordReset(true)
            setSuppressVerification(false)
          } else {
            setSuppressVerification(false)
          }
        }
      }, 200)
    }

    return () => {
      channel.removeEventListener('message', handleMessage)
      channel.close()
    }
  }, [])

  // Fetch anonymous mock mode setting for anonymous users (development only)
  useEffect(() => {
    const fetchAnonymousMockModeSetting = async () => {
      // Only fetch for anonymous users in development mode
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

  // Screenshot handler for message area only

  // Helper to check if element is scrolled to bottom (within 50px threshold)
  const isScrolledToBottom = (element: HTMLElement): boolean => {
    const threshold = 50 // px tolerance
    return element.scrollHeight - element.scrollTop - element.clientHeight < threshold
  }

  // Setup scroll listener for a model to detect user scrolling
  // Returns true if successful, false if element not found
  const setupScrollListener = (modelId: string): boolean => {
    const safeId = getSafeId(modelId)
    const expectedId = `conversation-content-${safeId}`

    const conversationContent = document.querySelector(`#${expectedId}`) as HTMLElement

    if (!conversationContent) {
      return false
    }

    // Remove existing listeners if any
    const existingListeners = scrollListenersRef.current.get(modelId)
    if (existingListeners) {
      conversationContent.removeEventListener('scroll', existingListeners.scroll)
      conversationContent.removeEventListener('wheel', existingListeners.wheel)
      conversationContent.removeEventListener('touchstart', existingListeners.touchstart)
      conversationContent.removeEventListener('mousedown', existingListeners.mousedown)
    }

    // Initialize last scroll position
    lastScrollTopRef.current.set(modelId, conversationContent.scrollTop)

    // Handle mouse wheel - immediate indication of user interaction
    const handleWheel = (e: WheelEvent) => {
      const isAtTop = conversationContent.scrollTop === 0
      const isAtBottom = isScrolledToBottom(conversationContent)

      // If at top and scrolling up, or at bottom and scrolling down, manually scroll the window
      if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
        // Manually scroll the window to allow continuation of scrolling beyond card boundaries
        window.scrollBy({
          top: e.deltaY * 0.5, // Scale down the scroll amount slightly for smoother UX
          left: 0,
          behavior: 'auto',
        })
        // Continue to let the event propagate naturally as well
        return
      }

      // IMMEDIATELY pause auto-scroll when user scrolls
      autoScrollPausedRef.current.add(modelId)

      userInteractingRef.current.add(modelId)

      // Check scroll position after wheel event to potentially resume
      setTimeout(() => {
        if (isScrolledToBottom(conversationContent)) {
          // User scrolled to bottom - resume auto-scroll
          autoScrollPausedRef.current.delete(modelId)
        }
        // If not at bottom, keep it paused (already set above)
        userInteractingRef.current.delete(modelId)
      }, 75)
    }

    // Handle touch start - immediate indication of user interaction
    const handleTouchStart = () => {
      // IMMEDIATELY pause auto-scroll when user touches to scroll
      autoScrollPausedRef.current.add(modelId)

      userInteractingRef.current.add(modelId)

      // Check scroll position after touch to potentially resume
      setTimeout(() => {
        if (isScrolledToBottom(conversationContent)) {
          // User scrolled to bottom - resume auto-scroll
          autoScrollPausedRef.current.delete(modelId)
        }
        // If not at bottom, keep it paused (already set above)
        userInteractingRef.current.delete(modelId)
      }, 75)
    }

    // Handle mousedown on scrollbar - user is clicking/dragging scrollbar
    const handleMouseDown = () => {
      // IMMEDIATELY pause auto-scroll when user clicks scrollbar
      autoScrollPausedRef.current.add(modelId)

      userInteractingRef.current.add(modelId)

      // Check scroll position after mousedown to potentially resume
      setTimeout(() => {
        if (isScrolledToBottom(conversationContent)) {
          // User scrolled to bottom - resume auto-scroll
          autoScrollPausedRef.current.delete(modelId)
        }
        userInteractingRef.current.delete(modelId)
      }, 75)
    }

    // Handle scroll event - detect if scrolling upward (user interaction)
    const handleScroll = () => {
      const lastScrollTop = lastScrollTopRef.current.get(modelId) || 0
      const currentScrollTop = conversationContent.scrollTop

      // If scrolling up (position decreased), it's likely user interaction
      if (currentScrollTop < lastScrollTop) {
        // User scrolled up - pause auto-scroll
        autoScrollPausedRef.current.add(modelId)
      } else if (isScrolledToBottom(conversationContent)) {
        // Scrolled to bottom - resume auto-scroll
        autoScrollPausedRef.current.delete(modelId)
      }

      // Update last scroll position
      lastScrollTopRef.current.set(modelId, currentScrollTop)

      // If scroll lock is enabled, sync this scroll to all other cards
      if (!isScrollLockedRef.current) {
        return
      }

      // If we're already in a sync operation, check if this is a new user scroll
      // This prevents infinite loops when programmatic scrolls trigger scroll events
      if (syncingFromElementRef.current !== null) {
        // If a different element is trying to scroll, check if it's user-initiated
        if (syncingFromElementRef.current !== conversationContent) {
          // Check if enough time has passed since the last sync to allow new user scrolling
          const timeSinceLastSync = Date.now() - lastSyncTimeRef.current
          if (timeSinceLastSync < 100) {
            // Very recent sync - likely programmatic, skip it
            return
          } else {
            // Enough time has passed, this is likely a new user scroll on a different pane
            syncingFromElementRef.current = null
          }
        }
      }

      // Mark this element as the one initiating the sync
      syncingFromElementRef.current = conversationContent
      lastSyncTimeRef.current = Date.now()

      // Get all conversation content elements
      const allConversations = document.querySelectorAll('[id^="conversation-content-"]')

      // Store the scroll position as a percentage to account for different content heights
      const scrollHeight = conversationContent.scrollHeight - conversationContent.clientHeight
      const scrollPercentage = scrollHeight > 0 ? conversationContent.scrollTop / scrollHeight : 0

      // Sync all other cards
      allConversations.forEach(element => {
        const el = element as HTMLElement
        // Don't sync to the element that triggered this scroll
        if (el !== conversationContent) {
          const targetScrollHeight = el.scrollHeight - el.clientHeight
          if (targetScrollHeight > 0) {
            const targetScrollTop = scrollPercentage * targetScrollHeight
            el.scrollTop = targetScrollTop
          }
        }
      })

      // Reset the flag after a delay to allow all programmatic scroll events to complete
      setTimeout(() => {
        syncingFromElementRef.current = null
      }, 300)
    }

    // Add all listeners
    conversationContent.addEventListener('wheel', handleWheel, { passive: true })
    conversationContent.addEventListener('touchstart', handleTouchStart, { passive: true })
    conversationContent.addEventListener('mousedown', handleMouseDown, { passive: true })
    conversationContent.addEventListener('scroll', handleScroll, { passive: true })

    scrollListenersRef.current.set(modelId, {
      scroll: handleScroll,
      wheel: handleWheel,
      touchstart: handleTouchStart,
      mousedown: handleMouseDown,
    })

    return true
  }

  // Cleanup scroll listener for a model
  const cleanupScrollListener = (modelId: string) => {
    const safeId = getSafeId(modelId)
    const conversationContent = document.querySelector(
      `#conversation-content-${safeId}`
    ) as HTMLElement
    const listeners = scrollListenersRef.current.get(modelId)

    if (conversationContent && listeners) {
      conversationContent.removeEventListener('scroll', listeners.scroll)
      conversationContent.removeEventListener('wheel', listeners.wheel)
      conversationContent.removeEventListener('touchstart', listeners.touchstart)
      conversationContent.removeEventListener('mousedown', listeners.mousedown)
    }
    scrollListenersRef.current.delete(modelId)
    userInteractingRef.current.delete(modelId)
    lastScrollTopRef.current.delete(modelId)
  }

  const handleScreenshot = async (modelId: string) => {
    const safeId = getSafeId(modelId)
    const content = document.querySelector(`#conversation-content-${safeId}`) as HTMLElement | null
    if (!content) {
      showNotification('Screenshot target not found.', 'error')
      return
    }

    // Check if formatted tab is active, if not temporarily switch to it for copying
    // Use type assertion to handle string indexing into ActiveResultTabs
    const currentTab =
      (activeResultTabs as unknown as Record<string, ResultTab>)[modelId] || RESULT_TAB.FORMATTED
    const needsTabSwitch = currentTab !== RESULT_TAB.FORMATTED

    if (needsTabSwitch) {
      // Temporarily switch to formatted tab to render formatted content
      switchResultTab(modelId, RESULT_TAB.FORMATTED)
      // Wait for DOM to update and formatted content to render
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Additional delay to ensure LatexRenderer has rendered
            setTimeout(resolve, 100)
          })
        })
      })
    }

    // Show immediate feedback and store notification controller to update it when done
    const copyingNotification = showNotification('Copying screenshot...', 'success')
    // Clear auto-remove timeout so notification stays until we update it
    copyingNotification.clearAutoRemove()
    // Set timer icon for the copying notification
    copyingNotification.setIcon(
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
    )

    // Store original styles that we'll modify
    const prevOverflow = content.style.overflow
    const prevMaxHeight = content.style.maxHeight

    // Expand to show all content
    content.style.overflow = 'visible'
    content.style.maxHeight = 'none'

    try {
      // Start importing the library and waiting for repaint in parallel for faster processing
      const [htmlToImage] = await Promise.all([
        import('html-to-image'),
        // Use requestAnimationFrame for better timing - ensures browser has painted
        new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        }),
      ])

      const toBlob = htmlToImage.toBlob

      // Use html-to-image which typically preserves colors better
      const blob = await toBlob(content, {
        pixelRatio: 2, // High quality
        backgroundColor: '#ffffff',
        // Removed cacheBust for faster processing (not needed for DOM elements)
        style: {
          // Ensure the element is fully visible
          overflow: 'visible',
          maxHeight: 'none',
        },
      })

      if (blob && navigator.clipboard && window.ClipboardItem) {
        try {
          // Try to write to clipboard with retry logic
          let copySuccess = false
          let lastError: Error | null = null

          // Attempt clipboard write with up to 2 retries
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
              copySuccess = true
              break
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err))
              console.error(`Clipboard copy attempt ${attempt + 1} failed:`, lastError)

              // If it's a permission error or security error, don't retry
              if (
                lastError.name === 'NotAllowedError' ||
                lastError.name === 'SecurityError' ||
                lastError.message.includes('permission') ||
                lastError.message.includes('denied')
              ) {
                break
              }

              // Wait a bit before retrying (only if not the last attempt)
              if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 200))
              }
            }
          }

          if (copySuccess) {
            // Update notification in place for seamless transition
            copyingNotification.update('Screenshot copied to clipboard!', 'success')
          } else {
            // Show specific error message
            const errorMsg = lastError
              ? `Clipboard copy failed: ${lastError.message || lastError.name || 'Unknown error'}. Image downloaded instead.`
              : 'Clipboard copy failed. Image downloaded instead.'
            copyingNotification.update(errorMsg, 'error')
            console.error('Clipboard copy failed after retries:', lastError)

            // Fallback: download the image
            const link = document.createElement('a')
            link.download = `model_${safeId}_messages.png`
            link.href = URL.createObjectURL(blob)
            link.click()
            URL.revokeObjectURL(link.href)
          }
        } catch (err) {
          // Catch any unexpected errors during the retry logic
          const error = err instanceof Error ? err : new Error(String(err))
          const errorMsg = `Clipboard copy failed: ${error.message || error.name || 'Unknown error'}. Image downloaded instead.`
          copyingNotification.update(errorMsg, 'error')
          console.error('Unexpected error during clipboard copy:', error)

          // Fallback: download the image
          const link = document.createElement('a')
          link.download = `model_${safeId}_messages.png`
          link.href = URL.createObjectURL(blob)
          link.click()
          URL.revokeObjectURL(link.href)
        }
      } else if (blob) {
        // Clipboard API not available
        const reason = !navigator.clipboard
          ? 'Clipboard API not available'
          : !window.ClipboardItem
            ? 'ClipboardItem not supported'
            : 'Unknown reason'
        copyingNotification.update(`${reason}. Image downloaded.`, 'error')
        console.warn('Clipboard not supported:', {
          clipboard: !!navigator.clipboard,
          ClipboardItem: !!window.ClipboardItem,
        })
        const link = document.createElement('a')
        link.download = `model_${safeId}_messages.png`
        link.href = URL.createObjectURL(blob)
        link.click()
        URL.revokeObjectURL(link.href)
      } else {
        copyingNotification.update('Could not create image blob.', 'error')
        console.error('Failed to create image blob from content element')
      }
    } catch (err) {
      copyingNotification.update('Screenshot failed: ' + (err as Error).message, 'error')
    } finally {
      // Restore original styles
      content.style.overflow = prevOverflow
      content.style.maxHeight = prevMaxHeight

      // Restore original tab if we switched it
      if (needsTabSwitch) {
        switchResultTab(modelId, currentTab)
      }
    }
  }

  const handleCopyResponse = async (modelId: string) => {
    // Find the conversation for this model
    const conversation = conversations.find(conv => conv.modelId === modelId)
    if (!conversation) {
      showNotification('Model response not found.', 'error')
      return
    }

    if (conversation.messages.length === 0) {
      showNotification('No messages to copy.', 'error')
      return
    }

    // Format the entire conversation history
    const formattedHistory = conversation.messages
      .map(msg => formatConversationMessage(msg.type, msg.content, msg.timestamp))
      .join('\n\n---\n\n')

    try {
      await navigator.clipboard.writeText(formattedHistory)
      showNotification('Raw conversation copied to clipboard!', 'success')
    } catch (err) {
      showNotification('Failed to copy to clipboard.', 'error')
      console.error('Copy failed:', err)
    }
  }

  const handleCopyMessage = async (modelId: string, messageId: string, messageContent: string) => {
    const safeId = getSafeId(modelId)
    const messageSafeId = getSafeId(messageId)
    const messageContentId = `message-content-${safeId}-${messageSafeId}`
    const currentTab =
      (activeResultTabs as unknown as Record<string, ResultTab>)[modelId] || RESULT_TAB.FORMATTED

    try {
      if (currentTab === RESULT_TAB.FORMATTED) {
        // Take a screenshot of the formatted message
        const messageElement = document.querySelector(`#${messageContentId}`) as HTMLElement | null
        if (!messageElement) {
          showNotification('Message element not found.', 'error')
          return
        }

        // Wait for DOM to be ready (in case LatexRenderer is still rendering)
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Additional delay to ensure LatexRenderer has rendered
              setTimeout(resolve, 100)
            })
          })
        })

        // Show immediate feedback
        const copyingNotification = showNotification('Copying screenshot...', 'success')
        copyingNotification.clearAutoRemove()
        copyingNotification.setIcon(
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
        )

        // Store original styles that we'll modify
        const prevOverflow = messageElement.style.overflow
        const prevMaxHeight = messageElement.style.maxHeight
        const prevPadding = messageElement.style.padding
        const prevMargin = messageElement.style.margin

        // Expand to show all content
        messageElement.style.overflow = 'visible'
        messageElement.style.maxHeight = 'none'
        messageElement.style.padding =
          messageElement.style.padding || getComputedStyle(messageElement).padding
        messageElement.style.margin =
          messageElement.style.margin || getComputedStyle(messageElement).margin

        try {
          // Start importing the library and waiting for repaint in parallel
          const [htmlToImage] = await Promise.all([
            import('html-to-image'),
            new Promise<void>(resolve => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve())
              })
            }),
          ])

          const toBlob = htmlToImage.toBlob

          // Create screenshot of the message element
          const blob = await toBlob(messageElement, {
            pixelRatio: 2, // High quality
            backgroundColor: '#ffffff',
            style: {
              overflow: 'visible',
              maxHeight: 'none',
            },
          })

          if (blob && navigator.clipboard && window.ClipboardItem) {
            try {
              // Try to write to clipboard with retry logic
              let copySuccess = false
              let lastError: Error | null = null

              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
                  copySuccess = true
                  break
                } catch (err) {
                  lastError = err instanceof Error ? err : new Error(String(err))

                  if (
                    lastError.name === 'NotAllowedError' ||
                    lastError.name === 'SecurityError' ||
                    lastError.message.includes('permission') ||
                    lastError.message.includes('denied')
                  ) {
                    break
                  }

                  if (attempt < 2) {
                    await new Promise(resolve => setTimeout(resolve, 200))
                  }
                }
              }

              if (copySuccess) {
                copyingNotification.update('Screenshot copied to clipboard!', 'success')
              } else {
                const errorMsg = lastError
                  ? `Clipboard copy failed: ${lastError.message || lastError.name || 'Unknown error'}. Image downloaded instead.`
                  : 'Clipboard copy failed. Image downloaded instead.'
                copyingNotification.update(errorMsg, 'error')

                // Fallback: download the image
                const link = document.createElement('a')
                link.download = `message_${safeId}_${messageSafeId}.png`
                link.href = URL.createObjectURL(blob)
                link.click()
                URL.revokeObjectURL(link.href)
              }
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err))
              copyingNotification.update(
                `Clipboard copy failed: ${error.message || error.name || 'Unknown error'}. Image downloaded instead.`,
                'error'
              )

              // Fallback: download the image
              const link = document.createElement('a')
              link.download = `message_${safeId}_${messageSafeId}.png`
              link.href = URL.createObjectURL(blob)
              link.click()
              URL.revokeObjectURL(link.href)
            }
          } else if (blob) {
            const reason = !navigator.clipboard
              ? 'Clipboard API not available'
              : !window.ClipboardItem
                ? 'ClipboardItem not supported'
                : 'Unknown reason'
            copyingNotification.update(`${reason}. Image downloaded.`, 'error')
            const link = document.createElement('a')
            link.download = `message_${safeId}_${messageSafeId}.png`
            link.href = URL.createObjectURL(blob)
            link.click()
            URL.revokeObjectURL(link.href)
          } else {
            copyingNotification.update('Could not create image blob.', 'error')
          }
        } catch (err) {
          copyingNotification.update('Screenshot failed: ' + (err as Error).message, 'error')
        } finally {
          // Restore original styles
          messageElement.style.overflow = prevOverflow
          messageElement.style.maxHeight = prevMaxHeight
          messageElement.style.padding = prevPadding
          messageElement.style.margin = prevMargin
        }
      } else {
        // Raw mode: copy the raw content as text
        await navigator.clipboard.writeText(messageContent)
        showNotification('Message copied to clipboard!', 'success')
      }
    } catch (err) {
      showNotification('Failed to copy message.', 'error')
      console.error('Copy failed:', err)
    }
  }

  // Keep ref in sync with state
  useEffect(() => {
    isScrollLockedRef.current = isScrollLocked

    // When scroll lock is enabled, align all cards to the first card's scroll position
    if (isScrollLocked && conversations.length > 0) {
      const allConversations = document.querySelectorAll('[id^="conversation-content-"]')
      if (allConversations.length > 0) {
        const firstCard = allConversations[0] as HTMLElement

        // Mark the first card as the sync source
        syncingFromElementRef.current = firstCard

        const firstScrollHeight = firstCard.scrollHeight - firstCard.clientHeight
        const scrollPercentage = firstScrollHeight > 0 ? firstCard.scrollTop / firstScrollHeight : 0

        // Sync all other cards to the first card's scroll percentage
        allConversations.forEach((element, index) => {
          if (index > 0) {
            const el = element as HTMLElement
            const targetScrollHeight = el.scrollHeight - el.clientHeight
            if (targetScrollHeight > 0) {
              const targetScrollTop = scrollPercentage * targetScrollHeight
              el.scrollTop = targetScrollTop
            }
          }
        })

        // Reset after alignment is complete
        setTimeout(() => {
          syncingFromElementRef.current = null
        }, 100)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScrollLocked, conversations])

  // Setup scroll listeners when conversations are rendered
  useEffect(() => {
    conversations.forEach(conversation => {
      // Check if listener is already set up
      if (!scrollListenersRef.current.has(conversation.modelId)) {
        const maxAttempts = 5
        let attempt = 0

        const trySetup = () => {
          attempt++
          const success = setupScrollListener(conversation.modelId)
          if (!success && attempt < maxAttempts) {
            setTimeout(trySetup, 100 * attempt)
          }
        }

        // Try immediately
        trySetup()
      }
    })

    // Clean up listeners for models that are no longer in conversations
    const activeModelIds = new Set(conversations.map(c => c.modelId))
    scrollListenersRef.current.forEach((_, modelId) => {
      if (!activeModelIds.has(createModelId(modelId))) {
        cleanupScrollListener(modelId)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations])

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
          // Anonymous user: clear localStorage and reset UI state
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

  // Load full conversation from localStorage (anonymous users)
  const loadConversationFromLocalStorage = (
    id: string
  ): { input_data: string; models_used: string[]; messages: StoredMessage[] } | null => {
    try {
      const stored = localStorage.getItem(`compareintel_conversation_${id}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed
      } else {
        console.warn('No conversation found in localStorage for id:', id)
      }
    } catch (e) {
      console.error('Failed to load conversation from localStorage:', e, { id })
    }
    return null
  }

  // Load full conversation from API (authenticated users)
  const loadConversationFromAPI = async (
    id: number
  ): Promise<{ input_data: string; models_used: string[]; messages: StoredMessage[] } | null> => {
    if (!isAuthenticated) return null

    try {
      const conversationId = createConversationId(id)
      // Clear cache for this specific conversation to ensure we get the latest data
      apiClient.deleteCache(`GET:/conversations/${id}`)
      const data = await getConversation(conversationId)
      return {
        input_data: data.input_data,
        models_used: data.models_used,
        messages: data.messages.map(msg => {
          const storedMessage: StoredMessage = {
            role: msg.role,
            content: msg.content,
            created_at: msg.created_at,
          }
          if (msg.model_id !== null && msg.model_id !== undefined) {
            storedMessage.model_id = createModelId(msg.model_id)
          }
          if (msg.id !== undefined && msg.id !== null) {
            storedMessage.id = createMessageId(String(msg.id))
          }
          return storedMessage
        }),
      }
    } catch (error) {
      if (error instanceof ApiError) {
        console.error('Failed to load conversation:', error.message)
      } else {
        console.error('Failed to load conversation from API:', error)
      }
    }
    return null
  }

  // Load a conversation from history
  const loadConversation = async (summary: ConversationSummary) => {
    setIsLoadingHistory(true)
    try {
      let conversationData: {
        input_data: string
        models_used: string[]
        messages: StoredMessage[]
      } | null = null

      if (isAuthenticated && typeof summary.id === 'number') {
        conversationData = await loadConversationFromAPI(summary.id)
      } else if (!isAuthenticated && typeof summary.id === 'string') {
        conversationData = loadConversationFromLocalStorage(summary.id)
      }

      if (!conversationData) {
        console.error('Failed to load conversation data', { summary, isAuthenticated })
        return
      }

      // Store models_used in a local variable to satisfy TypeScript null checks in callbacks
      const modelsUsed = conversationData.models_used

      // Group messages by model_id
      const messagesByModel: { [key: string]: ConversationMessage[] } = {}

      // Initialize empty arrays for all models
      modelsUsed.forEach((modelId: string) => {
        messagesByModel[modelId] = []
      })

      // Process messages in strict alternating order: user, then assistant responses for each model
      // Messages are saved grouped by model conversation, so we need to reconstruct the round-based structure

      // Sort all messages by timestamp to ensure proper chronological order
      const sortedMessages = [...conversationData.messages].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      )

      // Group messages into conversation rounds (user message + all assistant responses)
      // User messages should already be deduplicated when saved, so we can process in order
      const rounds: ConversationRound[] = []
      let currentRound: ConversationRound | null = null

      sortedMessages.forEach((msg: StoredMessage) => {
        if (msg.role === 'user') {
          // If we have a current round, save it
          if (currentRound && currentRound.user) {
            rounds.push(currentRound)
          }
          // Start a new round - user messages should be deduplicated already when saved
          currentRound = { user: msg, assistants: [] }
        } else if (msg.role === 'assistant' && msg.model_id) {
          // Add assistant message to current round
          if (currentRound) {
            // Check for duplicate assistant messages (same model, content, and timestamp within 1 second)
            // Compare model IDs as strings to ensure proper matching
            const isDuplicate = currentRound.assistants.some(
              asm =>
                asm.model_id &&
                msg.model_id &&
                String(asm.model_id) === String(msg.model_id) &&
                asm.content === msg.content &&
                Math.abs(new Date(asm.created_at).getTime() - new Date(msg.created_at).getTime()) <
                  1000
            )

            if (!isDuplicate) {
              currentRound.assistants.push(msg)
            }
          } else {
            // Edge case: assistant without preceding user message
            // This shouldn't happen, but handle it gracefully
            console.warn('Assistant message without preceding user message:', msg)
          }
        }
      })

      // Don't forget the last round
      if (currentRound) {
        rounds.push(currentRound)
      }

      // Now reconstruct messages for each model based on rounds
      rounds.forEach(round => {
        // Add user message to all models
        modelsUsed.forEach((modelId: string) => {
          messagesByModel[modelId].push({
            id: round.user.id
              ? typeof round.user.id === 'string'
                ? createMessageId(round.user.id)
                : createMessageId(String(round.user.id))
              : createMessageId(`${Date.now()}-user-${Math.random()}`),
            type: 'user' as const,
            content: round.user.content,
            timestamp: round.user.created_at || new Date().toISOString(),
          })

          // Add assistant message for this specific model if it exists in this round
          // Compare model IDs as strings to ensure proper matching
          const modelAssistant = round.assistants.find(asm => {
            if (!asm.model_id) return false
            // Convert both to strings for comparison to handle type differences
            return String(asm.model_id) === String(modelId)
          })
          if (modelAssistant) {
            messagesByModel[modelId].push({
              id: modelAssistant.id
                ? typeof modelAssistant.id === 'string'
                  ? createMessageId(modelAssistant.id)
                  : createMessageId(String(modelAssistant.id))
                : createMessageId(`${Date.now()}-${Math.random()}`),
              type: 'assistant' as const,
              content: modelAssistant.content,
              timestamp: modelAssistant.created_at || new Date().toISOString(),
            })
          }
        })
      })

      // Convert to ModelConversation format
      const loadedConversations: ModelConversation[] = modelsUsed.map((modelId: string) => ({
        modelId: createModelId(modelId),
        messages: messagesByModel[modelId] || [],
      }))

      // Set state
      setConversations(loadedConversations)
      // Set selected models - only the models from this conversation, clear all others
      setSelectedModels([...modelsUsed])
      // Set original selected models to match the loaded conversation
      // This ensures that only models from THIS conversation show the red border when deselected
      setOriginalSelectedModels([...modelsUsed])

      // Use the first user message as the input reference, but clear textarea for new follow-up
      // The conversation will be referenced by this first query in history
      setInput('') // Clear textarea so user can type a new follow-up
      setIsFollowUpMode(loadedConversations.some(conv => conv.messages.length > 0))
      setClosedCards(new Set()) // Ensure all result cards are open/visible
      setResponse(null) // Clear any previous response state
      setShowHistoryDropdown(false)
      setIsModelsHidden(true) // Collapse the models section when selecting from history
      collapseAllDropdowns() // Collapse all provider dropdowns when selecting from history

      // Scroll to results section and reset all conversation cards to top
      // Use requestAnimationFrame to ensure DOM is rendered before scrolling
      requestAnimationFrame(() => {
        setTimeout(() => {
          const resultsSection = document.querySelector('.results-section')
          if (resultsSection) {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }

          // Scroll all conversation content divs to the top
          modelsUsed.forEach((modelId: string) => {
            const safeId = modelId.replace(/[^a-zA-Z0-9_-]/g, '-')
            const conversationContent = document.querySelector(
              `#conversation-content-${safeId}`
            ) as HTMLElement
            if (conversationContent) {
              conversationContent.scrollTop = 0
            }
          })
        }, 200) // Delay to ensure DOM is fully rendered
      })

      // Track this conversation as currently visible so it shows as active in history dropdown
      setCurrentVisibleComparisonId(String(summary.id))
    } catch (e) {
      console.error('Failed to load conversation:', e)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Load history on mount
  useEffect(() => {
    // Clear currently visible comparison ID on mount/login/logout (page refresh or auth change)
    // This ensures saved comparisons appear in history after refresh/login
    setCurrentVisibleComparisonId(null)

    if (isAuthenticated) {
      loadHistoryFromAPI()
    } else {
      const history = loadHistoryFromLocalStorage()
      setConversationHistory(history)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, loadHistoryFromAPI, loadHistoryFromLocalStorage])

  // Refresh history when dropdown is opened for authenticated users
  useEffect(() => {
    if (showHistoryDropdown) {
      if (isAuthenticated) {
        loadHistoryFromAPI()
      } else {
        const history = loadHistoryFromLocalStorage()
        setConversationHistory(history)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistoryDropdown, isAuthenticated, loadHistoryFromAPI, loadHistoryFromLocalStorage])

  // Listen for anonymous usage cleared event from AdminPanel and refresh history
  useEffect(() => {
    const handleAnonymousUsageCleared = () => {
      // Clear conversation history state for anonymous users
      if (!isAuthenticated) {
        const history = loadHistoryFromLocalStorage()
        setConversationHistory(history)
        // Also clear any currently displayed conversations if they exist
        setConversations([])
        setCurrentVisibleComparisonId(null)
      }
    }

    window.addEventListener('anonymousUsageCleared', handleAnonymousUsageCleared)
    return () => {
      window.removeEventListener('anonymousUsageCleared', handleAnonymousUsageCleared)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, loadHistoryFromLocalStorage])

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

  // Helper function to create a conversation message
  const createMessage = (
    type: 'user' | 'assistant',
    content: string,
    customTimestamp?: string
  ): ConversationMessage => ({
    id: createMessageId(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
    type,
    content,
    timestamp: customTimestamp || new Date().toISOString(),
  })

  // Helper function to switch tabs for a specific conversation
  const switchResultTab = (modelId: string, tab: ResultTab) => {
    setActiveResultTabs((prev: ActiveResultTabs) => ({
      ...prev,
      [modelId]: tab,
    }))
  }

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
    if (response && !isFollowUpMode && !hasScrolledToResultsRef.current) {
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
  }, [response, isFollowUpMode])

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
    if (conversations.length > 0 && isFollowUpMode && !followUpJustActivatedRef.current) {
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
  }, [conversations, isFollowUpMode])

  // Immediately hide card when all models are deselected
  useEffect(() => {
    if (selectedModels.length === 0) {
      setShowDoneSelectingCard(false)
    }
  }, [selectedModels.length])

  // Trigger card visibility check when models are selected (especially for mobile)
  useEffect(() => {
    if (selectedModels.length > 0 && !isModelsHidden && !isFollowUpMode) {
      // Simply show the card when models are selected and section is visible and not in follow-up mode
      setShowDoneSelectingCard(true)
    } else if (isFollowUpMode || selectedModels.length === 0) {
      // Hide the card when entering follow-up mode or when no models are selected
      setShowDoneSelectingCard(false)
    }
  }, [selectedModels.length, isModelsHidden, isFollowUpMode])

  // Refresh usage count when models are selected to ensure renderUsagePreview shows accurate remaining count
  useEffect(() => {
    // Only refresh if we have models selected and we're not loading
    if (selectedModels.length > 0 && !isLoading) {
      // Debounce the refresh to avoid too many API calls when user is rapidly selecting models
      const timeoutId = setTimeout(() => {
        if (!isAuthenticated && browserFingerprint) {
          // For anonymous users, refresh rate limit status (which updates usageCount)
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
  useEffect(() => {
    let lastPageScrollTop = window.scrollY || document.documentElement.scrollTop
    let scrollTimeout: number | null = null

    const handlePageScroll = () => {
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop

      // Only mark as page scrolling if there's actual scroll movement
      // This prevents false positives from programmatic scrolls
      if (Math.abs(currentScrollTop - lastPageScrollTop) > 1) {
        isPageScrollingRef.current = true

        // Clear any existing timeout
        if (scrollTimeout !== null) {
          clearTimeout(scrollTimeout)
        }

        // Reset flag after scrolling stops (150ms of no scroll activity)
        scrollTimeout = window.setTimeout(() => {
          isPageScrollingRef.current = false
          scrollTimeout = null
        }, 150)
      }

      lastPageScrollTop = currentScrollTop
    }

    // Use passive listener for better performance
    window.addEventListener('scroll', handlePageScroll, { passive: true })
    window.addEventListener('wheel', handlePageScroll, { passive: true })
    window.addEventListener('touchmove', handlePageScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handlePageScroll)
      window.removeEventListener('wheel', handlePageScroll)
      window.removeEventListener('touchmove', handlePageScroll)
      if (scrollTimeout !== null) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [])

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

  // Track mouse position over models section with throttling for better performance
  useEffect(() => {
    let rafId: number | null = null
    let scrollRafId: number | null = null
    let lastShowState = false
    let lastMouseY = 0
    let lastMouseX = 0
    let keepVisibleTimeout: number | null = null
    let isKeepingVisible = false
    let previousIsOver = false

    const checkCardVisibility = (mouseY: number, mouseX: number, fromScroll: boolean = false) => {
      if (!modelsSectionRef.current) return

      const rect = modelsSectionRef.current.getBoundingClientRect()

      // Check if mouse is over the section
      const isOver =
        mouseY >= rect.top && mouseY <= rect.bottom && mouseX >= rect.left && mouseX <= rect.right

      // Detect transition from "over section" to "not over section"
      const justLeftSection = previousIsOver && !isOver
      if (!fromScroll) {
        previousIsOver = isOver
      }

      // Check if card is positioned below the models section
      // Card is at 80% of viewport height (top: 80%), so card center is at 80% of viewport
      const cardCenterY = window.innerHeight * 0.8
      const cardHeight = 150 // Approximate height of the card
      const cardTop = cardCenterY - cardHeight / 2
      const isCardBelowSection = cardTop > rect.bottom

      // Check if page is scrolled near the bottom
      // Consider "near bottom" if we're within 500px of the bottom or if scroll position
      // is close to the maximum scroll (accounting for viewport height)
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollHeight = document.documentElement.scrollHeight
      const viewportHeight = window.innerHeight
      const distanceFromBottom = scrollHeight - (scrollTop + viewportHeight)
      // More lenient: within 500px of bottom, at least 80% scrolled, or in bottom 30% of page
      const scrollPercentage = (scrollTop + viewportHeight) / scrollHeight
      const isNearBottom =
        distanceFromBottom < 500 ||
        scrollPercentage >= 0.8 ||
        scrollTop + viewportHeight >= scrollHeight - 200 ||
        scrollPercentage >= 0.7

      // Check if models section is visible (any part of it is in the viewport)
      const isSectionVisible = rect.top < viewportHeight && rect.bottom > 0
      // When scrolled near bottom, if section is visible, consider it "lowest visible"
      // This is a simple check: if section is visible when near bottom, show the card
      const isSectionLowestVisible = isSectionVisible

      // Base conditions for showing card
      const baseConditionsMet = selectedModels.length > 0 && !isModelsHidden && !isFollowUpMode

      // Check if any result cards have their top visible in the viewport
      // Don't show card if the top of any result card appears (card should not appear over results)
      const resultCards = document.querySelectorAll('.result-card.conversation-card')
      const resultCardsTopVisible =
        resultCards.length > 0 &&
        Array.from(resultCards).some(card => {
          const cardRect = card.getBoundingClientRect()
          // Check if the top of the card is visible (top is in viewport)
          return cardRect.top >= 0 && cardRect.top < viewportHeight
        })

      // Check if cursor is in the left or right margins (between screen edge and section borders)
      // Hide card when cursor is in these margin areas
      const viewportWidth = window.innerWidth
      const isInLeftMargin = mouseX >= 0 && mouseX < rect.left
      const isInRightMargin = mouseX > rect.right && mouseX <= viewportWidth
      const isInSideMargins = isInLeftMargin || isInRightMargin

      // Priority 1: Auto-show when scrolled near bottom and section is visible/lowest visible
      // This takes priority over mouse hover to ensure card is always visible in this case
      // BUT don't show if result cards top is visible OR cursor is in side margins
      const autoShowCondition =
        baseConditionsMet &&
        isNearBottom &&
        isSectionVisible &&
        isSectionLowestVisible &&
        !resultCardsTopVisible &&
        !isInSideMargins

      // Priority 2: Normal hover case - mouse is over section
      // Don't show if result cards top is visible OR cursor is in side margins
      const hoverCondition =
        isOver && baseConditionsMet && !resultCardsTopVisible && !isInSideMargins

      // Priority 3: Keep visible when mouse leaves section and card is below
      // Don't show if result cards top is visible OR cursor is in side margins
      const keepVisibleCondition =
        !isOver &&
        isCardBelowSection &&
        baseConditionsMet &&
        (justLeftSection || isKeepingVisible) &&
        !resultCardsTopVisible &&
        !isInSideMargins

      let shouldShow = false

      if (autoShowCondition) {
        // Auto-show case: page is scrolled near bottom, section is visible/lowest visible
        // Show card regardless of mouse position or whether card is "below" section
        shouldShow = true
        isKeepingVisible = true

        // Clear any existing timeout
        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else if (hoverCondition) {
        // Normal case: mouse is over section
        shouldShow = true
        // If we were keeping it visible, stop that since we're back in normal mode
        if (isKeepingVisible) {
          isKeepingVisible = false
        }
        // Clear any timeout since we're back in normal mode
        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else if (keepVisibleCondition) {
        // Edge case: mouse is outside section and card is below section
        // Show card if we're keeping it visible (from mouse leaving)
        shouldShow = true
        isKeepingVisible = true

        // Clear any existing timeout - we'll keep it visible as long as card is below section
        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else {
        // Not showing - check if we should stop keeping visible
        if (isKeepingVisible) {
          // Only stop if we're not in auto-show condition and card is no longer below section
          // Also stop if result cards top is now visible OR cursor is in side margins
          if (
            resultCardsTopVisible ||
            isInSideMargins ||
            (!autoShowCondition && (!isCardBelowSection || !baseConditionsMet))
          ) {
            isKeepingVisible = false
            if (keepVisibleTimeout) {
              window.clearTimeout(keepVisibleTimeout)
              keepVisibleTimeout = null
            }
            shouldShow = false
          } else if (autoShowCondition) {
            // Still in auto-show condition, keep showing
            shouldShow = true
          } else {
            // Transition state - keep showing for now if card is still below
            shouldShow =
              isCardBelowSection && baseConditionsMet && !resultCardsTopVisible && !isInSideMargins
          }
        } else {
          shouldShow = false
        }
      }

      // Only update state if it changed to avoid unnecessary re-renders
      if (shouldShow !== lastShowState) {
        lastShowState = shouldShow
        setShowDoneSelectingCard(shouldShow)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseY = e.clientY
      lastMouseX = e.clientX

      // Use requestAnimationFrame for smoother updates
      if (rafId) return

      rafId = window.requestAnimationFrame(() => {
        rafId = null
        checkCardVisibility(lastMouseY, lastMouseX)
      })
    }

    const handleTouchMove = (e: TouchEvent) => {
      // Handle touch events for mobile devices
      if (e.touches.length > 0) {
        const touch = e.touches[0]
        lastMouseY = touch.clientY
        lastMouseX = touch.clientX

        // Use requestAnimationFrame for smoother updates
        if (rafId) return

        rafId = window.requestAnimationFrame(() => {
          rafId = null
          checkCardVisibility(lastMouseY, lastMouseX)
        })
      }
    }

    const handleScroll = () => {
      // Check card visibility on scroll to handle auto-show when near bottom
      if (scrollRafId) return

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null
        checkCardVisibility(lastMouseY, lastMouseX, true)
      })
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })

    // Initial check on mount and when dependencies change
    checkCardVisibility(lastMouseY, lastMouseX)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('scroll', handleScroll)
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      if (scrollRafId) {
        window.cancelAnimationFrame(scrollRafId)
      }
      if (keepVisibleTimeout) {
        window.clearTimeout(keepVisibleTimeout)
      }
    }
  }, [selectedModels.length, isModelsHidden, isFollowUpMode])

  // Hide Done Selecting?" card when switching modes
  useEffect(() => {
    setShowDoneSelectingCard(false)
  }, [isFollowUpMode])

  // Hide "Done Selecting?" card when models section is collapsed
  useEffect(() => {
    if (isModelsHidden) {
      setShowDoneSelectingCard(false)
    }
  }, [isModelsHidden])

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

  // Load usage data and fetch models on component mount
  useEffect(() => {
    // Generate browser fingerprint for anti-abuse tracking
    const initFingerprint = async () => {
      const fingerprint = await generateBrowserFingerprint()
      setBrowserFingerprint(fingerprint)

      // Sync usage count with backend (only for anonymous users)
      try {
        if (isAuthenticated && user) {
          // For authenticated users, use credits instead of daily_usage_count
          setUsageCount(user.credits_used_this_period || 0)
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
              console.log('[DEBUG] Fetching credit balance on page load with fingerprint:', fingerprint?.substring(0, 20))
              const creditBalance = await getCreditBalance(fingerprint)
              console.log('[DEBUG] Received credit balance:', creditBalance.credits_remaining)
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- Initializes on mount; auth changes handled separately

  // Refetch credit balance when browserFingerprint becomes available (backup for timing issues)
  useEffect(() => {
    if (!isAuthenticated && browserFingerprint && !user) {
      // Only refetch if we don't already have a credit balance set, or if it's the default 50
      const shouldRefetch = anonymousCreditsRemaining === null || anonymousCreditsRemaining === 50
      if (shouldRefetch) {
        console.log('[DEBUG] Refetching credit balance when fingerprint becomes available:', browserFingerprint.substring(0, 20))
        getCreditBalance(browserFingerprint)
          .then(balance => {
            console.log('[DEBUG] Refetched credit balance:', balance.credits_remaining)
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

  // Handle authentication state changes (logout and sign-in from anonymous)
  useEffect(() => {
    // Only process transitions if we have a previous state (not initial mount)
    if (prevIsAuthenticatedRef.current === null) {
      // Initial mount - just record the current state and don't clear anything
      prevIsAuthenticatedRef.current = isAuthenticated
      return
    }

    const wasAnonymous = prevIsAuthenticatedRef.current === false
    const isNowAuthenticated = isAuthenticated === true
    const wasAuthenticated = prevIsAuthenticatedRef.current === true
    const isNowAnonymous = isAuthenticated === false

    // Clear all state when signing in from anonymous mode
    if (wasAnonymous && isNowAuthenticated) {
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
      // Clear any ongoing requests
      if (currentAbortController) {
        currentAbortController.abort()
        setCurrentAbortController(null)
      }
      // Clear scroll refs
      hasScrolledToResultsRef.current = false
      shouldScrollToTopAfterFormattingRef.current = false
    }

    // Reset page state when user logs out
    if (wasAuthenticated && isNowAnonymous) {
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
      // Don't reset selectedModels or usage count - let them keep their selections
    }

    // Update the ref to track current state for next render
    prevIsAuthenticatedRef.current = isAuthenticated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentAbortController])

  const toggleDropdown = (provider: string) => {
    setOpenDropdowns(prev => {
      const newSet = new Set(prev)
      if (newSet.has(provider)) {
        newSet.delete(provider)
      } else {
        newSet.add(provider)
      }
      return newSet
    })
  }

  // Helper function to check extended interaction limits

  const collapseAllDropdowns = () => {
    setOpenDropdowns(new Set())
  }

  const toggleAllForProvider = async (provider: string) => {
    const providerModels = modelsByProvider[provider] || []
    
    // Determine user tier and filter out restricted models
    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'
    const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)
    
    // Filter out unavailable models (where available === false) and restricted models based on tier
    const availableProviderModels = providerModels.filter(model => {
      // Filter out unavailable models
      if (model.available === false) {
        return false
      }
      
      // Filter out restricted models based on tier access
      if (isPaidTier) {
        // Paid tiers have access to all models
        return true
      } else if (userTier === 'anonymous') {
        // Anonymous tier only has access to anonymous-tier models
        return model.tier_access === 'anonymous'
      } else if (userTier === 'free') {
        // Free tier has access to anonymous and free-tier models
        return model.tier_access !== 'paid'
      }
      
      return true
    })
    
    const providerModelIds = availableProviderModels.map(model => model.id)

    // Check if all provider models are currently selected
    const allProviderModelsSelected = providerModelIds.every(id =>
      selectedModels.includes(String(id))
    )

    if (allProviderModelsSelected) {
      // Deselecting - check if this would leave us with no models
      const providerModelIdsStrings = providerModelIds.map(id => String(id))
      const modelsAfterDeselect = selectedModels.filter(id => !providerModelIdsStrings.includes(id))

      // In follow-up mode, show error if deselecting would leave zero models total
      if (isFollowUpMode && modelsAfterDeselect.length === 0) {
        setError('Must have at least one model to process')
        setTimeout(() => {
          setError(null)
        }, 5000)
        return
      }
    }

    // Track if we couldn't select all models for the provider
    let couldNotSelectAll = false

    if (!allProviderModelsSelected && !isFollowUpMode) {
      // Calculate how many models we can actually add
      const alreadySelectedFromProvider = providerModelIds.filter(id =>
        selectedModels.includes(String(id))
      ).length
      const remainingSlots = maxModelsLimit - (selectedModels.length - alreadySelectedFromProvider)
      const modelsToAdd = providerModelIds.slice(0, remainingSlots)
      couldNotSelectAll = modelsToAdd.length < providerModelIds.length
    }

    setSelectedModels(prev => {
      const newSelection = new Set(prev)

      if (allProviderModelsSelected) {
        // Deselect all provider models
        providerModelIds.forEach(id => newSelection.delete(id))
      } else {
        // In follow-up mode, only allow selecting models that were originally selected
        if (isFollowUpMode) {
          const modelsToAdd = providerModelIds.filter(
            id => originalSelectedModels.includes(id) && !prev.includes(id)
          )
          modelsToAdd.forEach(id => newSelection.add(id))
        } else {
          // Select all provider models, but respect the limit
          // Count how many models from this provider are already selected
          const alreadySelectedFromProvider = providerModelIds.filter(id =>
            prev.includes(id)
          ).length
          // Calculate remaining slots excluding already selected models from this provider
          const remainingSlots = maxModelsLimit - (prev.length - alreadySelectedFromProvider)
          const modelsToAdd = providerModelIds.slice(0, remainingSlots)

          modelsToAdd.forEach(id => newSelection.add(id))
        }
      }

      return Array.from(newSelection)
    })

    // Show warning if not all models could be selected due to tier limit
    if (couldNotSelectAll && !allProviderModelsSelected && !isFollowUpMode) {
      const tierName = !isAuthenticated ? 'Anonymous' : user?.subscription_tier || 'free'
      setError(
        `Your ${tierName} tier allows a maximum of ${maxModelsLimit} models per comparison. Not all models from ${provider} could be selected.`
      )
      setTimeout(() => {
        setError(null)
      }, 10000)
      return
    }

    // Clear any previous error when successfully adding models (only when selecting, not deselecting)
    if (
      !allProviderModelsSelected &&
      error &&
      (error.includes('Maximum') ||
        error.includes('Must have at least one model') ||
        error.includes('Please select at least one model'))
    ) {
      setError(null)
    }
  }


  const handleModelToggle = async (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      // Check if this is the last selected model - only prevent in follow-up mode
      if (selectedModels.length === 1 && isFollowUpMode) {
        setError('Must have at least one model to process')
        // Clear the error after 5 seconds
        setTimeout(() => {
          setError(null)
        }, 5000)
        return
      }

      // Allow deselection in both normal and follow-up mode
      setSelectedModels(prev => prev.filter(id => id !== modelId))
      // Clear any previous error when deselecting a model
      if (error && error.includes('Maximum')) {
        setError(null)
      }
    } else {
      // In follow-up mode, only allow reselecting models that were originally selected
      if (isFollowUpMode) {
        if (originalSelectedModels.includes(modelId)) {
          // Allow reselection of previously selected model
          setSelectedModels(prev => [...prev, modelId])
          // Clear any previous error when successfully adding a model
          if (
            error &&
            (error.includes('Maximum') ||
              error.includes('Must have at least one model') ||
              error.includes('Please select at least one model'))
          ) {
            setError(null)
          }
        } else {
          // Prevent adding new models during follow-up mode
          setError(
            'Cannot add new models during follow-up. Please start a new comparison to select different models.'
          )
          // Clear the error after 5 seconds
          setTimeout(() => {
            setError(null)
          }, 5000)
        }
        return
      }

      // Check limit before adding (only in normal mode)
      if (selectedModels.length >= maxModelsLimit) {
        const tierName = !isAuthenticated ? 'Anonymous' : user?.subscription_tier || 'free'
        const upgradeMsg =
          tierName === 'Anonymous'
            ? ' Sign up for a free account to get 3 models.'
            : tierName === 'free'
              ? ' Upgrade to Starter for 6 models or Pro for 9 models.'
              : tierName === 'starter' || tierName === 'starter_plus'
                ? ' Upgrade to Pro for 9 models or Pro+ for 12 models.'
                : tierName === 'pro'
                  ? ' Upgrade to Pro+ for 12 models.'
                  : ''
        setError(
          `Your ${tierName} tier allows maximum ${maxModelsLimit} models per comparison.${upgradeMsg}`
        )
        return
      }


      setSelectedModels(prev => [...prev, modelId])
      // Clear any previous error when successfully adding a model
      if (
        error &&
        (error.includes('Maximum') ||
          error.includes('Must have at least one model') ||
          error.includes('Please select at least one model'))
      ) {
        setError(null)
      }
    }
  }

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

  // Helper function to check if follow-up should be disabled based on model selection changes
  const isFollowUpDisabled = () => {
    if (originalSelectedModels.length === 0) {
      return false // No original comparison yet, so follow-up is not applicable
    }

    // Check if any new models have been added (models in selectedModels that weren't in originalSelectedModels)
    const hasNewModels = selectedModels.some(model => !originalSelectedModels.includes(model))

    // If new models were added, disable follow-up
    // If only models were deselected (subset of original), allow follow-up
    return hasNewModels
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

  // Handler for "Done Selecting" button click
  const handleDoneSelecting = () => {
    // Hide the card
    setShowDoneSelectingCard(false)

    // Collapse all expanded model-provider dropdowns
    collapseAllDropdowns()

    // Collapse the models section
    setIsModelsHidden(true)

    // Scroll to the very top
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })

    // Wait for scroll to complete, then focus
    window.setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    }, 800) // Wait for scroll animation to complete
  }

  // Handler for submit button that provides helpful validation messages
  const handleSubmitClick = () => {
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

    if (selectedModels.length === 0) {
      setError('Please select at least one model below to compare responses')
      // Scroll to the models section to help the user
      window.setTimeout(() => {
        const modelsSection = document.querySelector('.models-section')
        if (modelsSection) {
          modelsSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
      }, 100)
      return
    }

    if (!input.trim()) {
      setError('Please enter some text to compare')
      return
    }

    handleSubmit()
  }

  const handleSubmit = async () => {
    // Check if user is logged in but not verified
    if (user && !user.is_verified) {
      setError(
        'Please verify your email address before making comparisons. Check your inbox for a verification link from CompareIntel.'
      )
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    // Check input length against selected models' limits
    const messageCount = conversations.length > 0 ? conversations[0]?.messages.length || 0 : 0
    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'

    // Check input length against selected models' limits
    if (selectedModels.length > 0) {
      // Find the minimum max input length across all selected models
      const modelLimits = selectedModels
        .map(modelId => {
          // Find model in modelsByProvider
          for (const providerModels of Object.values(modelsByProvider)) {
            const model = providerModels.find(m => m.id === modelId)
            if (model && model.max_input_chars) {
              return model.max_input_chars
            }
          }
          return null
        })
        .filter((limit): limit is number => limit !== null)

      if (modelLimits.length > 0) {
        const minMaxInput = Math.min(...modelLimits)
        if (input.length > minMaxInput) {
          setError(
            `Your input is too long for one or more of the selected models. The maximum input length is approximately ${formatNumber(minMaxInput)} characters, but your input is ${formatNumber(input.length)} characters. Please shorten your input or select different models that support longer inputs.`
          )
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
      }
    }

    // Hard limit: Prevent submissions when input capacity is fully used (but allow when exceeded with warning)
    // Industry best practice 2025: Enforce maximum context window to protect costs and maintain quality
    if (isFollowUpMode && conversations.length > 0 && selectedModels.length > 0) {
      // Calculate token usage
      const inputTokens = Math.ceil(input.length / 4)
      const conversationHistoryMessages = conversations
        .filter(conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0)
      
      if (conversationHistoryMessages.length > 0) {
        const messages = conversationHistoryMessages[0].messages
        const conversationHistoryTokens = messages.reduce((sum, msg) => {
          const content = msg.content || ''
          return sum + Math.ceil(content.length / 4)
        }, 0)
        const totalInputTokens = inputTokens + conversationHistoryTokens

        // Get min max input tokens from selected models
        const modelLimits = selectedModels
          .map(modelId => {
            for (const providerModels of Object.values(modelsByProvider)) {
              const model = providerModels.find(m => m.id === modelId)
              if (model && model.max_input_chars) {
                return model.max_input_chars / 4 // Convert chars to tokens
              }
            }
            return null
          })
          .filter((limit): limit is number => limit !== null)

        // Note: We no longer block submissions at 0% remaining - allow with warnings
        // Backend will handle truncation if needed
      }
    }

    // Check credit balance before submitting
    // Use the same calculation logic as renderUsagePreview for consistency
    const creditsAllocated = creditBalance?.credits_allocated ?? (isAuthenticated && user 
      ? (user.monthly_credits_allocated || getCreditAllocation(userTier))
      : getDailyCreditLimit(userTier) || getCreditAllocation(userTier))
    
    // Calculate credits remaining using the same logic as renderUsagePreview
    let creditsRemaining: number
    if (!isAuthenticated && anonymousCreditsRemaining !== null) {
      // Use anonymousCreditsRemaining state if available (most up-to-date for anonymous users)
      creditsRemaining = anonymousCreditsRemaining
    } else if (creditBalance?.credits_remaining !== undefined) {
      // Use creditBalance if available
      creditsRemaining = creditBalance.credits_remaining
    } else {
      // Fallback: calculate from allocated and used
      const creditsUsed = creditBalance?.credits_used_this_period ?? creditBalance?.credits_used_today ?? (isAuthenticated && user 
        ? (user.credits_used_this_period || 0)
        : 0)
      creditsRemaining = Math.max(0, creditsAllocated - creditsUsed)
    }

    // Calculate estimated credits for this request using the same logic as renderUsagePreview
    const modelsNeeded = selectedModels.length
    const inputTokens = Math.ceil(input.length / 4) // Rough estimate: 4 chars per token
    // Build conversation history from conversations prop (not from hook's conversationHistory)
    const conversationHistoryMessages = isFollowUpMode && conversations.length > 0
      ? (() => {
          // Get the first conversation that has messages and is for a selected model
          const selectedConversations = conversations.filter(
            conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
          )
          if (selectedConversations.length === 0) return []
          // Use the first selected conversation's messages
          return selectedConversations[0].messages
        })()
      : []
    const conversationHistoryTokens = conversationHistoryMessages.length > 0
      ? conversationHistoryMessages.reduce((sum, msg) => {
          // Safely handle messages that might not have content
          const content = msg.content || ''
          return sum + Math.ceil(content.length / 4)
        }, 0)
      : 0
    const totalInputTokens = inputTokens + conversationHistoryTokens
    
    // Estimate output tokens: ~500-1500 tokens per model response (use 1000 as average)
    // Effective tokens = input_tokens + (output_tokens × 2.5)
    // Credits = effective_tokens / 1000
    const outputTokensPerModel = 1000
    const effectiveTokensPerModel = totalInputTokens + (outputTokensPerModel * 2.5)
    const creditsPerModel = effectiveTokensPerModel / 1000
    
    // Total estimated credits
    const estimatedCredits = Math.ceil(creditsPerModel * modelsNeeded)

    // Credit blocking removed - allow comparisons to proceed regardless of credit balance
    // Credits will be capped at allocated amount during deduction, then blocked on next request if at 0


    if (!input.trim()) {
      setError('Please enter some text to compare')
      return
    }

    if (selectedModels.length === 0) {
      setError('Please select at least one model')
      return
    }

    // Store original selected models for follow-up comparison logic (only for new comparisons, not follow-ups)
    if (!isFollowUpMode) {
      // Clear the currently visible comparison ID so the previous one will appear in history
      // This allows the previously visible comparison to show in the dropdown when user starts a new one
      setCurrentVisibleComparisonId(null)

      setOriginalSelectedModels([...selectedModels])

      // If there's an active conversation and we're starting a new one, save the previous one first
      // This ensures when user has A & B, runs C, then starts D, we save C and show B & C in history
      if (!isAuthenticated && conversations.length > 0) {
        // Use originalSelectedModels for the previous conversation, or fall back to current conversations' models
        const previousModels =
          originalSelectedModels.length > 0
            ? originalSelectedModels
            : [...new Set(conversations.map(conv => conv.modelId))]

        const conversationsWithMessages = conversations.filter(
          conv => previousModels.includes(conv.modelId) && conv.messages.length > 0
        )

        // Only save if we have conversations with complete assistant messages
        const hasCompleteMessages = conversationsWithMessages.some(conv => {
          const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
          return (
            assistantMessages.length > 0 &&
            assistantMessages.some(msg => msg.content.trim().length > 0)
          )
        })

        if (hasCompleteMessages && conversationsWithMessages.length > 0) {
          // Get the FIRST user message from the conversation
          const allUserMessages = conversationsWithMessages
            .flatMap(conv => conv.messages)
            .filter(msg => msg.type === 'user')
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

          const firstUserMessage = allUserMessages[0]

          if (firstUserMessage) {
            const inputData = firstUserMessage.content
            // Save the previous conversation before starting the new one
            // Use isUpdate=false since this is the first time saving this conversation
            saveConversationToLocalStorage(
              inputData,
              previousModels,
              conversationsWithMessages,
              false
            )
          }
        }
      }
    }

    // Prepare conversation history for the API (needed for credit estimation)
    // For follow-up mode, we send the complete conversation history (both user and assistant messages)
    // This matches how official AI chat interfaces work and provides proper context
    const apiConversationHistory =
      isFollowUpMode && conversations.length > 0
        ? (() => {
            // Get the first conversation that has messages and is for a selected model
            const selectedConversations = conversations.filter(
              conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
            )
            if (selectedConversations.length === 0) return []

            // Use the first selected conversation's messages
            return selectedConversations[0].messages.map(msg => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content,
            }))
          })()
        : []

    // Credit warnings removed - comparisons proceed regardless of credit balance
    // No need to re-estimate here - just proceed with submission

    setIsLoading(true)
    setError(null)
    // Clear insufficient/low credit warnings on submission (submission is allowed with reduced tokens)
    // "No credits" warning will be set after submission if credits are actually 0
    if (creditWarningType === 'insufficient' || creditWarningType === 'low') {
      setCreditWarningMessage(null)
      setCreditWarningType(null)
      setCreditWarningDismissible(false)
    }
    setIsModelsHidden(true) // Hide models section after clicking Compare
    setShowDoneSelectingCard(false) // Hide "Done Selecting" card after clicking Compare

    // Capture user timestamp when they actually submit
    const userTimestamp = new Date().toISOString()
    setUserMessageTimestamp(userTimestamp)

    // Original input functionality removed - not needed

    setResponse(null) // Clear previous results
    setClosedCards(new Set()) // Clear closed cards for new results
    setProcessingTime(null)
    userCancelledRef.current = false
    hasScrolledToResultsRef.current = false // Reset scroll tracking for new comparison
    scrolledToTopRef.current.clear() // Reset per-card scroll tracking for new comparison
    shouldScrollToTopAfterFormattingRef.current = false // Reset scroll-to-top-after-formatting flag for new comparison
    autoScrollPausedRef.current.clear() // Clear auto-scroll pause ref
    userInteractingRef.current.clear() // Clear user interaction tracking
    lastScrollTopRef.current.clear() // Clear scroll position tracking
    lastAlignedRoundRef.current = 0 // Reset round alignment tracking
    setIsScrollLocked(false) // Reset scroll lock for new comparison

    // Clean up any existing scroll listeners from previous comparison
    scrollListenersRef.current.forEach((_listener, modelId) => {
      cleanupScrollListener(modelId)
    })

    const startTime = Date.now()

    // Dynamic timeout based on request complexity
    // Models run concurrently, so timeout is based on slowest model + overhead, not sum
    const baseTimeout = 180000 // 3 minutes base (covers slowest model + network overhead)
    const maxTimeout = 480000 // 8 min max
    const dynamicTimeout = Math.min(baseTimeout, maxTimeout)

    // Declare streaming variables outside try block so they're accessible in catch block for timeout handling
    const streamingResults: { [key: string]: string } = {}
    const completedModels = new Set<string>() // Track which models have finished
    const localModelErrors: { [key: string]: boolean } = {} // Track which models have errors (local during streaming)
    const modelStartTimes: { [key: string]: string } = {} // Track when each model starts
    const modelCompletionTimes: { [key: string]: string } = {} // Track when each model completes
    let streamingMetadata: CompareResponse['metadata'] | null = null

    try {
      const controller = new AbortController()
      setCurrentAbortController(controller)

      const timeoutId = setTimeout(() => controller.abort(), dynamicTimeout)

      // Use streaming endpoint for faster perceived response time
      // Include conversation_id if available (for authenticated users) to ensure correct conversation matching
      const conversationId =
        isAuthenticated && currentVisibleComparisonId
          ? typeof currentVisibleComparisonId === 'string'
            ? parseInt(currentVisibleComparisonId, 10)
            : currentVisibleComparisonId
          : null

      clearTimeout(timeoutId)

      // Use service for streaming request
      const stream = await compareStream({
        input_data: input,
        models: selectedModels,
        conversation_history: apiConversationHistory,
        browser_fingerprint: browserFingerprint,
        conversation_id: conversationId || undefined, // Only include if not null
      })

      if (!stream) {
        throw new Error('Failed to start streaming comparison')
      }

      // Handle streaming response with Server-Sent Events
      const reader = stream.getReader()
      const decoder = new TextDecoder()

      // Streaming variables are declared outside try block for timeout handling
      let lastUpdateTime = Date.now()
      const UPDATE_THROTTLE_MS = 50 // Update UI every 50ms max for smooth streaming

      // Clear previous model errors at start of new comparison
      setModelErrors({})

      // Set all selected models to 'raw' tab to show streaming content immediately
      const rawTabs: ActiveResultTabs = {} as ActiveResultTabs
      selectedModels.forEach(modelId => {
        rawTabs[createModelId(modelId)] = RESULT_TAB.RAW
      })
      setActiveResultTabs(rawTabs)

      // Initialize empty conversations immediately so cards appear during streaming
      if (!isFollowUpMode) {
        const emptyConversations: ModelConversation[] = selectedModels.map(modelId => ({
          modelId: createModelId(modelId),
          messages: [
            createMessage('user', input, userTimestamp), // Placeholder user timestamp, will be updated when model starts
            createMessage('assistant', '', userTimestamp), // Placeholder AI timestamp, will be updated when model completes
          ],
        }))
        setConversations(emptyConversations)
      }

      // Track which models have had listeners set up (to avoid duplicates)
      const listenersSetUp = new Set<string>()

      if (reader) {
        try {
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()

            if (done) break

            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true })

            // Process complete SSE messages (separated by \n\n)
            const messages = buffer.split('\n\n')
            buffer = messages.pop() || '' // Keep incomplete message in buffer

            let shouldUpdate = false

            for (const message of messages) {
              if (!message.trim() || !message.startsWith('data: ')) continue

              try {
                const jsonStr = message.replace(/^data: /, '')
                const event = JSON.parse(jsonStr)

                if (event.type === 'start') {
                  // Model starting - initialize empty result and track start time
                  if (!streamingResults[event.model]) {
                    streamingResults[event.model] = ''
                  }
                  // Record when this specific model started processing (when query was sent to OpenRouter)
                  modelStartTimes[event.model] = new Date().toISOString()
                  shouldUpdate = true
                } else if (event.type === 'chunk') {
                  // Content chunk arrived - append to result
                  streamingResults[event.model] =
                    (streamingResults[event.model] || '') + event.content
                  shouldUpdate = true

                  // Set up scroll listener on first chunk (DOM should be ready by now)
                  if (!listenersSetUp.has(event.model)) {
                    listenersSetUp.add(event.model)

                    // Retry setup with increasing delays until successful
                    const trySetup = (attempt: number, maxAttempts: number) => {
                      const delay = attempt * 50 // 50ms, 100ms, 150ms, 200ms
                      requestAnimationFrame(() => {
                        setTimeout(() => {
                          const success = setupScrollListener(event.model)
                          if (!success && attempt < maxAttempts) {
                            trySetup(attempt + 1, maxAttempts)
                          }
                        }, delay)
                      })
                    }

                    // Try up to 4 times with increasing delays
                    trySetup(1, 4)
                  }
                } else if (event.type === 'done') {
                  // Model completed - track it and record completion time
                  completedModels.add(event.model)
                  modelCompletionTimes[event.model] = new Date().toISOString()
                  // Store error flag from backend (both locally and in state)
                  // Set to false if not explicitly true, so we can distinguish "completed" from "still streaming"
                  const hasError = event.error === true
                  localModelErrors[event.model] = hasError
                  setModelErrors(prev => ({ ...prev, [event.model]: hasError }))
                  shouldUpdate = true

                  // Clean up pause state for this model (but keep scroll listeners for scroll lock feature)
                  autoScrollPausedRef.current.delete(event.model)

                  // Switch completed successful models to formatted view immediately
                  // Don't wait for all models - successful models should be formatted even if others timeout
                  const modelContent = streamingResults[event.model] || ''
                  const isModelError = hasError || isErrorMessage(modelContent)
                  if (!isModelError) {
                    // Switch this successful model to formatted view
                    setActiveResultTabs(prev => ({
                      ...prev,
                      [event.model]: RESULT_TAB.FORMATTED,
                    }))
                  }

                  // Also check if ALL models are done - if so, switch all to formatted view
                  if (completedModels.size === selectedModels.length) {
                    const formattedTabs: ActiveResultTabs = {} as ActiveResultTabs
                    selectedModels.forEach(modelId => {
                      formattedTabs[createModelId(modelId)] = RESULT_TAB.FORMATTED
                    })
                    setActiveResultTabs(formattedTabs)

                    // For initial comparison only, set flag to scroll to top after formatting is applied
                    if (!isFollowUpMode) {
                      shouldScrollToTopAfterFormattingRef.current = true
                    }
                  }
                } else if (event.type === 'complete') {
                  // All models complete - save metadata
                  streamingMetadata = event.metadata
                  const endTime = Date.now()
                  setProcessingTime(endTime - startTime)
                  shouldUpdate = true

                  // Debug: Log metadata for anonymous users
                  if (!isAuthenticated && streamingMetadata) {
                    console.log('[DEBUG] Received streaming metadata:', {
                      credits_used: streamingMetadata.credits_used,
                      credits_remaining: streamingMetadata.credits_remaining,
                      metadata: streamingMetadata
                    })
                  }

                  // Refresh credit balance if credits were used OR if credits_remaining is provided
                  // Check for credits_remaining first (more reliable indicator)
                  if (streamingMetadata?.credits_remaining !== undefined || streamingMetadata?.credits_used !== undefined) {
                    if (isAuthenticated) {
                      // Use credits_remaining from metadata for immediate update (like anonymous users)
                      if (streamingMetadata.credits_remaining !== undefined) {
                        // Update creditBalance immediately with metadata value
                        if (creditBalance) {
                          setCreditBalance({
                            ...creditBalance,
                            credits_remaining: streamingMetadata.credits_remaining,
                            credits_used_this_period: creditBalance.credits_allocated - streamingMetadata.credits_remaining,
                          })
                        } else if (user) {
                          // If creditBalance is not yet loaded, create a temporary one from user data
                          const allocated = user.monthly_credits_allocated || getCreditAllocation(user.subscription_tier || 'free')
                          setCreditBalance({
                            credits_allocated: allocated,
                            credits_used_this_period: allocated - streamingMetadata.credits_remaining,
                            credits_remaining: streamingMetadata.credits_remaining,
                            period_type: user.billing_period_start ? 'monthly' : 'daily',
                            subscription_tier: user.subscription_tier || 'free',
                            credits_reset_at: user.credits_reset_at,
                            billing_period_start: user.billing_period_start,
                            billing_period_end: user.billing_period_end,
                            total_credits_used: user.total_credits_used,
                          })
                        }
                      }
                      // Refresh user data to get updated credit balance
                      refreshUser()
                        .then(() => getCreditBalance()) // Authenticated users don't need fingerprint
                        .then(balance => {
                          setCreditBalance(balance)
                          // Update credit warnings based on new balance
                          const userTier = user?.subscription_tier || 'free'
                          const remainingPercent = balance.credits_allocated > 0
                            ? (balance.credits_remaining / balance.credits_allocated) * 100
                            : 100
                          const periodType = userTier === 'anonymous' || userTier === 'free' ? 'daily' : 'monthly'
                          const lowCreditThreshold = (userTier === 'anonymous' || userTier === 'free') ? 20 : 10
                          
                          if (balance.credits_remaining <= 0) {
                            const message = getCreditWarningMessage('none', userTier, balance.credits_remaining, undefined, balance.credits_reset_at)
                            setCreditWarningMessage(message)
                            setCreditWarningType('none')
                            setCreditWarningDismissible(false)
                          } else if (remainingPercent <= lowCreditThreshold && remainingPercent > 0) {
                            if (!isLowCreditWarningDismissed(userTier, periodType, balance.credits_reset_at)) {
                              const message = getCreditWarningMessage('low', userTier, balance.credits_remaining, undefined, balance.credits_reset_at)
                              setCreditWarningMessage(message)
                              setCreditWarningType('low')
                              setCreditWarningDismissible(true)
                            } else {
                              setCreditWarningMessage(null)
                              setCreditWarningType(null)
                              setCreditWarningDismissible(false)
                            }
                          } else {
                            setCreditWarningMessage(null)
                            setCreditWarningType(null)
                            setCreditWarningDismissible(false)
                          }
                        })
                        .catch(error => console.error('Failed to refresh user credit balance:', error))
                    } else {
                      // For anonymous users, refresh credit balance from API
                      // Use credits_remaining from metadata for immediate update (most accurate - calculated right after deduction)
                      if (streamingMetadata.credits_remaining !== undefined) {
                        console.log('[DEBUG] Updating anonymous credits from metadata:', streamingMetadata.credits_remaining)
                        const metadataCreditsRemaining = streamingMetadata.credits_remaining
                        // Update anonymousCreditsRemaining state immediately - this is the primary source for anonymous users
                        setAnonymousCreditsRemaining(metadataCreditsRemaining)
                        
                        // Update creditBalance immediately with metadata value to keep them in sync
                        const allocated = creditBalance?.credits_allocated ?? getDailyCreditLimit('anonymous')
                        setCreditBalance({
                          credits_allocated: allocated,
                          credits_used_today: allocated - metadataCreditsRemaining,
                          credits_remaining: metadataCreditsRemaining,
                          period_type: 'daily',
                          subscription_tier: 'anonymous',
                        })
                        
                        console.log('[DEBUG] State updated - anonymousCreditsRemaining:', metadataCreditsRemaining, 'creditBalance.credits_remaining:', metadataCreditsRemaining)
                        
                        const remainingPercent = allocated > 0
                          ? (metadataCreditsRemaining / allocated) * 100
                          : 100
                        // Update credit warnings based on new balance
                        const userTier = 'anonymous'
                        const periodType = 'daily'
                        const lowCreditThreshold = 20
                        
                        if (metadataCreditsRemaining <= 0) {
                          const message = getCreditWarningMessage('none', userTier, metadataCreditsRemaining)
                          setCreditWarningMessage(message)
                          setCreditWarningType('none')
                          setCreditWarningDismissible(false)
                        } else if (remainingPercent <= lowCreditThreshold && remainingPercent > 0) {
                          if (!isLowCreditWarningDismissed(userTier, periodType)) {
                            const message = getCreditWarningMessage('low', userTier, metadataCreditsRemaining)
                            setCreditWarningMessage(message)
                            setCreditWarningType('low')
                            setCreditWarningDismissible(true)
                          } else {
                            setCreditWarningMessage(null)
                            setCreditWarningType(null)
                            setCreditWarningDismissible(false)
                          }
                        } else {
                          setCreditWarningMessage(null)
                          setCreditWarningType(null)
                          setCreditWarningDismissible(false)
                        }
                        
                        // Optionally refresh from API, but don't overwrite if metadata value is more recent
                        // Now API has fingerprint info, so it should match metadata
                        getCreditBalance(browserFingerprint)
                          .then(balance => {
                            // Only update if API value matches metadata (to sync other fields)
                            // But keep the metadata credits_remaining value as it's more accurate
                            if (Math.abs(balance.credits_remaining - metadataCreditsRemaining) <= 1) {
                              setCreditBalance({
                                ...balance,
                                credits_remaining: metadataCreditsRemaining, // Keep metadata value
                              })
                            } else {
                              console.log('[DEBUG] API credits_remaining differs from metadata, keeping metadata value:', {
                                api: balance.credits_remaining,
                                metadata: metadataCreditsRemaining
                              })
                            }
                          })
                          .catch(error => console.error('Failed to refresh anonymous credit balance:', error))
                      } else {
                        console.warn('[DEBUG] streamingMetadata.credits_remaining is undefined!', streamingMetadata)
                        // Fallback: get from API if metadata not available
                        getCreditBalance(browserFingerprint)
                          .then(balance => {
                            setAnonymousCreditsRemaining(balance.credits_remaining)
                            setCreditBalance(balance)
                            // Update credit warnings based on new balance
                            const userTier = 'anonymous'
                            const periodType = 'daily'
                            const remainingPercent = balance.credits_allocated > 0
                              ? (balance.credits_remaining / balance.credits_allocated) * 100
                              : 100
                            const lowCreditThreshold = 20
                            
                            if (balance.credits_remaining <= 0) {
                              const message = getCreditWarningMessage('none', userTier, balance.credits_remaining)
                              setCreditWarningMessage(message)
                              setCreditWarningType('none')
                              setCreditWarningDismissible(false)
                            } else if (remainingPercent <= lowCreditThreshold && remainingPercent > 0) {
                              if (!isLowCreditWarningDismissed(userTier, periodType)) {
                                const message = getCreditWarningMessage('low', userTier, balance.credits_remaining)
                                setCreditWarningMessage(message)
                                setCreditWarningType('low')
                                setCreditWarningDismissible(true)
                              } else {
                                setCreditWarningMessage(null)
                                setCreditWarningType(null)
                                setCreditWarningDismissible(false)
                              }
                            } else {
                              setCreditWarningMessage(null)
                              setCreditWarningType(null)
                              setCreditWarningDismissible(false)
                            }
                          })
                          .catch(error => console.error('Failed to refresh anonymous credit balance:', error))
                      }
                    }
                  }

                  // Note: Conversation saving will happen after final state update
                  // For authenticated users: backend handles it, refresh history after a delay
                  if (isAuthenticated && !isFollowUpMode) {
                    // Refresh history from API after a short delay to allow backend to save
                    setTimeout(() => {
                      // Clear cache for conversations endpoint to force fresh data
                      apiClient.deleteCache('GET:/conversations')
                      loadHistoryFromAPI()
                    }, 1000)
                  }
                } else if (event.type === 'error') {
                  throw new Error(event.message || 'Streaming error occurred')
                }
              } catch (parseError) {
                console.error('Error parsing SSE message:', parseError, message)
              }
            }

            // Throttled UI update - update at most every 50ms for smooth streaming
            const now = Date.now()
            if (shouldUpdate && now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
              lastUpdateTime = now

              // Use regular state update instead of flushSync to allow smooth scrolling
              // React 18 will batch these updates automatically for better performance
              // Update response state
              setResponse({
                results: { ...streamingResults },
                metadata: {
                  input_length: input.length,
                  models_requested: selectedModels.length,
                  models_successful: 0, // Will be updated on complete
                  models_failed: 0,
                  timestamp: new Date().toISOString(),
                  processing_time_ms: Date.now() - startTime,
                },
              })

              // Update conversations to show streaming text in cards
              if (!isFollowUpMode) {
                setConversations(prevConversations =>
                  prevConversations.map(conv => {
                    const content = streamingResults[conv.modelId] || ''
                    const startTime = modelStartTimes[conv.modelId]
                    const completionTime = modelCompletionTimes[conv.modelId]

                    // Update both user and assistant message timestamps with individual model times

                    return {
                      ...conv,
                      messages: conv.messages.map((msg, idx) => {
                        if (idx === 0 && msg.type === 'user') {
                          // Update user timestamp with model start time if available
                          const newTimestamp = startTime || msg.timestamp
                          return {
                            ...msg,
                            timestamp: newTimestamp,
                          }
                        } else if (idx === 1 && msg.type === 'assistant') {
                          // Update assistant message content and timestamp
                          const newTimestamp = completionTime || msg.timestamp
                          return {
                            ...msg,
                            content,
                            timestamp: newTimestamp,
                          }
                        }
                        return msg
                      }),
                    }
                  })
                )
              } else {
                // For follow-up mode, append streaming content to existing conversations
                setConversations(prevConversations =>
                  prevConversations.map(conv => {
                    const content = streamingResults[conv.modelId]
                    if (content === undefined) return conv

                    // Check if we already added the new user message
                    // Look for the most recent user message that matches the current input
                    const hasNewUserMessage = conv.messages.some(
                      (msg, idx) =>
                        msg.type === 'user' &&
                        msg.content === input &&
                        idx >= conv.messages.length - 2 // Check last 2 messages (user + assistant)
                    )

                    if (!hasNewUserMessage) {
                      // Add user message and empty assistant message
                      const startTime = modelStartTimes[conv.modelId]
                      const completionTime = modelCompletionTimes[conv.modelId]
                      return {
                        ...conv,
                        messages: [
                          ...conv.messages,
                          createMessage('user', input, startTime || userTimestamp), // Use model start time if available
                          createMessage(
                            'assistant',
                            content,
                            completionTime || new Date().toISOString()
                          ),
                        ],
                      }
                    } else {
                      // Update the last assistant message with completion time if available
                      const completionTime = modelCompletionTimes[conv.modelId]
                      return {
                        ...conv,
                        messages: conv.messages.map((msg, idx) =>
                          idx === conv.messages.length - 1 && msg.type === 'assistant'
                            ? {
                                ...msg,
                                content,
                                timestamp: completionTime || msg.timestamp,
                              }
                            : msg
                        ),
                      }
                    }
                  })
                )
              }

              // Auto-scroll each conversation card to bottom as content streams in
              // BUT only for models that are still streaming (not completed yet)
              // AND respect user's manual scroll position (pause if user scrolled up)
              // AND pause if user is scrolling the page to prevent interference
              // Use requestAnimationFrame for smooth scrolling
              requestAnimationFrame(() => {
                // Don't auto-scroll cards if user is actively scrolling the page
                if (isPageScrollingRef.current) return

                Object.keys(streamingResults).forEach(modelId => {
                  // Skip auto-scrolling for completed models so users can scroll through them
                  if (completedModels.has(modelId)) return

                  // Skip auto-scrolling if user has manually scrolled away from bottom
                  // Use REF for immediate check without state update delay
                  if (autoScrollPausedRef.current.has(modelId)) return

                  const safeId = modelId.replace(/[^a-zA-Z0-9_-]/g, '-')
                  const conversationContent = document.querySelector(
                    `#conversation-content-${safeId}`
                  ) as HTMLElement
                  if (conversationContent) {
                    // Use scrollTop assignment without triggering events that interfere with page scroll
                    conversationContent.scrollTop = conversationContent.scrollHeight
                  }
                })
              })
            }
          }

          // Final update to ensure all content is displayed
          // Mark incomplete models as failed if they have empty content
          const finalModelErrors: { [key: string]: boolean } = { ...localModelErrors }
          selectedModels.forEach(modelId => {
            const createdModelId = createModelId(modelId)
            // If model hasn't completed and has empty content, mark as failed
            if (!completedModels.has(createdModelId)) {
              const content = streamingResults[createdModelId] || ''
              if (content.trim().length === 0) {
                finalModelErrors[createdModelId] = true
              }
            }
          })
          setModelErrors(finalModelErrors)

          // Switch successful models to formatted view (even if some timed out)
          const formattedTabs: ActiveResultTabs = {} as ActiveResultTabs
          selectedModels.forEach(modelId => {
            const createdModelId = createModelId(modelId)
            const content = streamingResults[createdModelId] || ''
            const hasError = finalModelErrors[createdModelId] === true || isErrorMessage(content)
            if (!hasError && content.trim().length > 0) {
              formattedTabs[createdModelId] = RESULT_TAB.FORMATTED
            }
          })
          setActiveResultTabs(prev => ({ ...prev, ...formattedTabs }))

          setResponse({
            results: { ...streamingResults },
            metadata: {
              input_length: input.length,
              models_requested: selectedModels.length,
              models_successful: Object.keys(streamingResults).filter(
                modelId =>
                  !isErrorMessage(streamingResults[modelId]) &&
                  (streamingResults[modelId] || '').trim().length > 0
              ).length,
              models_failed: Object.keys(streamingResults).filter(
                modelId =>
                  isErrorMessage(streamingResults[modelId]) ||
                  (streamingResults[modelId] || '').trim().length === 0
              ).length,
              timestamp: new Date().toISOString(),
              processing_time_ms: Date.now() - startTime,
            },
          })

          // Final conversations update with complete content
          if (!isFollowUpMode) {
            setConversations(prevConversations => {
              const updated = prevConversations.map(conv => {
                const content = streamingResults[conv.modelId] || ''
                const startTime = modelStartTimes[conv.modelId]
                const completionTime = modelCompletionTimes[conv.modelId]

                return {
                  ...conv,
                  messages: conv.messages.map((msg, idx) => {
                    if (idx === 0 && msg.type === 'user') {
                      // Update user message timestamp with model start time
                      return { ...msg, timestamp: startTime || msg.timestamp }
                    } else if (idx === 1 && msg.type === 'assistant') {
                      // Update assistant message timestamp with model completion time
                      return {
                        ...msg,
                        content,
                        timestamp: completionTime || msg.timestamp,
                      }
                    }
                    return msg
                  }),
                }
              })

              // Don't save here - will save after stream completes (see below)
              return updated
            })
          } else {
            // For follow-up mode, ensure messages are added and update with final content
            setConversations(prevConversations => {
              const updated = prevConversations.map(conv => {
                const content = streamingResults[conv.modelId] || ''
                const completionTime = modelCompletionTimes[conv.modelId]

                // Check if we already added the new user message
                const hasNewUserMessage = conv.messages.some(
                  (msg, idx) =>
                    msg.type === 'user' && msg.content === input && idx >= conv.messages.length - 2 // Check last 2 messages (user + assistant)
                )

                if (!hasNewUserMessage) {
                  // Add user message and assistant message if they weren't added during streaming
                  const startTime = modelStartTimes[conv.modelId]
                  return {
                    ...conv,
                    messages: [
                      ...conv.messages,
                      createMessage('user', input, startTime || userTimestamp),
                      createMessage(
                        'assistant',
                        content,
                        completionTime || new Date().toISOString()
                      ),
                    ],
                  }
                } else {
                  // Update the last assistant message with final content and timestamp
                  return {
                    ...conv,
                    messages: conv.messages.map((msg, idx) => {
                      if (idx === conv.messages.length - 1 && msg.type === 'assistant') {
                        return {
                          ...msg,
                          content: content || msg.content, // Ensure content is set
                          timestamp: completionTime || msg.timestamp,
                        }
                      }
                      return msg
                    }),
                  }
                }
              })

              // Don't save here - will save after stream completes (see below)
              return updated
            })
          }

          // Tab switching happens automatically when each model completes (see 'done' event handler above)
          // No need to switch here - it's already been done dynamically as models finished
        } finally {
          reader.releaseLock()

          // Save conversation to history AFTER stream completes
          // For anonymous users: save to localStorage
          // For registered users: reload from API (backend already saved it)
          if (!isAuthenticated && !isFollowUpMode) {
            // Use a small delay to ensure state is fully updated
            setTimeout(() => {
              // Get current conversations state (should be fully updated by now)
              setConversations(currentConversations => {
                const conversationsWithMessages = currentConversations.filter(
                  conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
                )

                // Only save if we have conversations with complete assistant messages (not empty)
                const hasCompleteMessages = conversationsWithMessages.some(conv => {
                  const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
                  return (
                    assistantMessages.length > 0 &&
                    assistantMessages.some(msg => msg.content.trim().length > 0)
                  )
                })

                if (hasCompleteMessages && conversationsWithMessages.length > 0) {
                  // Get the FIRST user message from the conversation (not follow-ups)
                  const allUserMessages = conversationsWithMessages
                    .flatMap(conv => conv.messages)
                    .filter(msg => msg.type === 'user')
                    .sort(
                      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    )

                  const firstUserMessage = allUserMessages[0]

                  if (firstUserMessage) {
                    const inputData = firstUserMessage.content
                    // Always save the conversation - saveConversationToLocalStorage handles the 2-conversation limit
                    // by keeping only the 2 most recent conversations
                    const savedId = saveConversationToLocalStorage(
                      inputData,
                      selectedModels,
                      conversationsWithMessages
                    )
                    // Set currentVisibleComparisonId to the saved comparison ID so it shows as active in the dropdown
                    // This allows users to see their saved comparison highlighted in the dropdown right after streaming completes
                    if (savedId) {
                      setCurrentVisibleComparisonId(savedId)
                    }
                  }
                }

                return currentConversations // Return unchanged
              })
            }, 200)
          } else if (isAuthenticated && !isFollowUpMode) {
            // For registered users, reload history from API after stream completes
            // Backend already saved the conversation, we just need to refresh the list
            setTimeout(async () => {
              // Get the first user message to find the matching conversation
              const firstUserMessage = getFirstUserMessage()
              if (firstUserMessage) {
                await syncHistoryAfterComparison(firstUserMessage.content, selectedModels)
              }
            }, 1500) // Give backend more time to finish saving (background task
          } else if (!isAuthenticated && isFollowUpMode) {
            // Save follow-up updates after stream completes (anonymous users)
            setTimeout(() => {
              setConversations(currentConversations => {
                const conversationsWithMessages = currentConversations.filter(
                  conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
                )

                // Only save if we have conversations with complete assistant messages (not empty)
                const hasCompleteMessages = conversationsWithMessages.some(conv => {
                  const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
                  return (
                    assistantMessages.length > 0 &&
                    assistantMessages.some(msg => msg.content.trim().length > 0)
                  )
                })

                if (hasCompleteMessages && conversationsWithMessages.length > 0) {
                  // Get the first user message (original query) to identify the conversation
                  const firstUserMessage = conversationsWithMessages
                    .flatMap(conv => conv.messages)
                    .filter(msg => msg.type === 'user')
                    .sort(
                      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    )[0]

                  if (firstUserMessage) {
                    const inputData = firstUserMessage.content
                    // Update existing conversation (isUpdate = true)
                    const savedId = saveConversationToLocalStorage(
                      inputData,
                      selectedModels,
                      conversationsWithMessages,
                      true
                    )
                    // Set currentVisibleComparisonId to the saved comparison ID so it shows as active in the dropdown
                    // This allows users to see their saved comparison highlighted in the dropdown right after streaming completes
                    if (savedId) {
                      setCurrentVisibleComparisonId(savedId)
                    }
                  }
                }

                return currentConversations // Return unchanged
              })
            }, 200)
          } else if (isAuthenticated && isFollowUpMode) {
            // For registered users, reload history from API after follow-up completes
            // Backend already saved the conversation update, we just need to refresh the list
            setTimeout(async () => {
              // Get the first user message to find the matching conversation
              const firstUserMessage = getFirstUserMessage()
              if (firstUserMessage) {
                await syncHistoryAfterComparison(firstUserMessage.content, selectedModels)
              }
            }, 1500) // Give backend more time to finish saving (background task)
          }
        }
      }

      // Set final response with metadata
      const filteredData = {
        results: streamingResults,
        metadata: streamingMetadata || {
          input_length: input.length,
          models_requested: selectedModels.length,
          models_successful: Object.keys(streamingResults).filter(
            modelId => !isErrorMessage(streamingResults[modelId])
          ).length,
          models_failed: Object.keys(streamingResults).filter(modelId =>
            isErrorMessage(streamingResults[modelId])
          ).length,
          timestamp: new Date().toISOString(),
          processing_time_ms: Date.now() - startTime,
        },
      }

      setResponse(filteredData)

      // Clear input field only if at least one model succeeded
      // Keep input if all models failed so user can retry without retyping
      if (filteredData.metadata.models_successful > 0) {
        setInput('')

      }

      // Track usage only if at least one model succeeded
      // Don't count failed comparisons where all models had errors
      if (filteredData.metadata.models_successful > 0) {
        // Refresh user data if authenticated to update usage count
        if (isAuthenticated) {
          try {
            await refreshUser()
          } catch (error) {
            console.error('Failed to refresh user data:', error)
          }
        }

        // Sync with backend to get the actual count (backend now counts after success)
        try {
          // Clear cache to ensure we get fresh data after the comparison
          const cacheKey = browserFingerprint
            ? `GET:/rate-limit-status?fingerprint=${encodeURIComponent(browserFingerprint)}`
            : 'GET:/rate-limit-status'
          apiClient.deleteCache(cacheKey)

          const data = await getRateLimitStatus(browserFingerprint)
          // Backend returns 'fingerprint_usage' or 'daily_usage' for anonymous users
          const newCount = data.fingerprint_usage || data.daily_usage || 0
          setUsageCount(newCount)

          // Update localStorage to match backend
          const today = new Date().toDateString()
          localStorage.setItem(
            'compareintel_usage',
            JSON.stringify({
              count: newCount,
              date: today,
            })
          )

        } catch (error) {
          // Silently handle cancellation errors (expected when component unmounts)
          if (error instanceof Error && error.name === 'CancellationError') {
            // Fallback to local increment silently
          } else {
            // Fallback to local increment if backend sync fails
            console.error('Failed to sync usage count after comparison:', error)
          }
          const newUsageCount = usageCount + selectedModels.length
          setUsageCount(newUsageCount)

          const today = new Date().toDateString()
          localStorage.setItem(
            'compareintel_usage',
            JSON.stringify({
              count: newUsageCount,
              date: today,
            })
          )
        }
      } else {
        // All models failed - show a message but don't count it
        setError(
          'All models failed to respond. This comparison did not count towards your daily limit. Please try again in a moment.'
        )
        // Clear the error after 8 seconds
        setTimeout(() => {
          setError(null)
        }, 8000)
        // Note: Input is NOT cleared when all models fail - user can retry without retyping
      }

      // Initialize or update conversations
      if (isFollowUpMode) {
        // For follow-up mode, messages were already added during streaming
        // Just scroll to show the results

        // Scroll conversations to show the last user message
        setTimeout(() => {
          scrollConversationsToBottom()
        }, 600)
      } else {
        // For initial comparison (non-follow-up), conversations were already initialized during streaming
        // with individual model timestamps. Don't reinitialize here as it would override them!

        // Scroll conversations to show the last user message for initial conversations too
        setTimeout(() => {
          scrollConversationsToBottom()
        }, 500)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Handle timeout: mark incomplete models as failed and format successful ones
        const timeoutModelErrors: { [key: string]: boolean } = { ...localModelErrors }
        selectedModels.forEach(modelId => {
          const createdModelId = createModelId(modelId)
          // If model hasn't completed, it should be marked as failed (timeout = failure)
          // This handles cases where response was cut short with partial content
          if (!completedModels.has(createdModelId)) {
            timeoutModelErrors[createdModelId] = true
          }
        })
        setModelErrors(timeoutModelErrors)

        // Switch successful models to formatted view even on timeout
        const formattedTabs: ActiveResultTabs = {} as ActiveResultTabs
        selectedModels.forEach(modelId => {
          const createdModelId = createModelId(modelId)
          const content = streamingResults[createdModelId] || ''
          const hasError = timeoutModelErrors[createdModelId] === true || isErrorMessage(content)
          if (!hasError && content.trim().length > 0) {
            formattedTabs[createdModelId] = RESULT_TAB.FORMATTED
          }
        })
        setActiveResultTabs(prev => ({ ...prev, ...formattedTabs }))

        // Final state update for conversations with timeout handling
        if (!isFollowUpMode) {
          setConversations(prevConversations => {
            return prevConversations.map(conv => {
              const content = streamingResults[conv.modelId] || ''
              const startTime = modelStartTimes[conv.modelId]
              const completionTime = modelCompletionTimes[conv.modelId]

              return {
                ...conv,
                messages: conv.messages.map((msg, idx) => {
                  if (idx === 0 && msg.type === 'user') {
                    return { ...msg, timestamp: startTime || msg.timestamp }
                  } else if (idx === 1 && msg.type === 'assistant') {
                    return {
                      ...msg,
                      content,
                      timestamp: completionTime || msg.timestamp,
                    }
                  }
                  return msg
                }),
              }
            })
          })
        }

        // Refresh credits if any models completed successfully before timeout
        // The backend should have deducted credits for successful models even if the client disconnected
        const successfulModelsCount = selectedModels.filter(modelId => {
          const createdModelId = createModelId(modelId)
          const hasCompleted = completedModels.has(createdModelId)
          const hasError = timeoutModelErrors[createdModelId] === true
          const content = streamingResults[createdModelId] || ''
          const isError = isErrorMessage(content)
          return hasCompleted && !hasError && !isError && content.trim().length > 0
        }).length

        if (successfulModelsCount > 0) {
          // Refresh credits from API since we didn't receive the complete event with metadata
          if (isAuthenticated) {
            // For authenticated users, refresh user data and credit balance
            refreshUser()
              .then(() => getCreditBalance())
              .then(balance => {
                setCreditBalance(balance)
              })
              .catch(error => console.error('Failed to refresh credit balance after timeout:', error))
          } else {
            // For anonymous users, refresh credit balance from API
            getCreditBalance(browserFingerprint)
              .then(balance => {
                setAnonymousCreditsRemaining(balance.credits_remaining)
                setCreditBalance(balance)
              })
              .catch(error => console.error('Failed to refresh anonymous credit balance after timeout:', error))
          }
        }

        if (userCancelledRef.current) {
          const elapsedTime = Date.now() - startTime
          const elapsedSeconds = (elapsedTime / 1000).toFixed(1)
          setError(`Comparison cancelled by user after ${elapsedSeconds} seconds`)
        } else {
          const timeoutMinutes = Math.floor(dynamicTimeout / 60000)
          const timeoutSeconds = Math.floor((dynamicTimeout % 60000) / 1000)
          const modelText = selectedModels.length === 1 ? 'model' : 'models'
          const suggestionText =
            selectedModels.length === 1
              ? 'Please wait a moment and try again.'
              : 'Try selecting fewer models, or wait a moment and try again.'
          setError(
            `Request timed out after ${timeoutMinutes}:${timeoutSeconds.toString().padStart(2, '0')} (${selectedModels.length} ${modelText}). ${suggestionText}`
          )
        }
      } else if (err instanceof PaymentRequiredError) {
        // Handle insufficient credits error (402 Payment Required)
        // Don't show error banner if credit warning banner is already showing (credits are 0)
        if (creditWarningType !== 'none') {
          setError(err.message || 'Insufficient credits for this request. Please upgrade your plan or wait for credits to reset.')
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (err instanceof ApiError && err.status === 402) {
        // Handle 402 Payment Required (insufficient credits)
        // Don't show error banner if credit warning banner is already showing (credits are 0)
        if (creditWarningType !== 'none') {
          const errorMessage = err.response?.detail || err.message || 'Insufficient credits for this request.'
          setError(errorMessage)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (err instanceof Error && err.message.includes('Failed to fetch')) {
        setError('Unable to connect to the server. Please check if the backend is running.')
      } else if (err instanceof Error) {
        setError(err.message || 'An unexpected error occurred')
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setCurrentAbortController(null)
      userCancelledRef.current = false
      setIsLoading(false)
      
      // NOTE: We don't need to refresh credit balance here because the streaming metadata
      // already provides the most up-to-date credits_remaining value (calculated right after deduction).
      // Adding a delayed refresh here would actually overwrite the correct value with potentially stale data
      // from the database due to timing/caching issues.
    }
  }

  // Helper function to render usage preview (used in both regular and follow-up modes)
  // Wrapped in useCallback with dependencies so ComparisonForm (memoized) re-renders when credits change
  const renderUsagePreview = useCallback(() => {
    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'

    // Get credit information (if available)
    // Prefer creditBalance if available (more up-to-date after model calls)
    const creditsAllocated = creditBalance?.credits_allocated ?? (isAuthenticated && user 
      ? (user.monthly_credits_allocated || getCreditAllocation(userTier))
      : getDailyCreditLimit(userTier) || getCreditAllocation(userTier))
    
    // For anonymous users, prefer anonymousCreditsRemaining if available, then creditBalance
    let creditsRemaining: number
    if (!isAuthenticated && anonymousCreditsRemaining !== null) {
      // Use anonymousCreditsRemaining state if available (most up-to-date for anonymous users)
      creditsRemaining = anonymousCreditsRemaining
    } else if (creditBalance?.credits_remaining !== undefined) {
      // Use creditBalance if available
      creditsRemaining = creditBalance.credits_remaining
    } else {
      // Fallback: calculate from allocated and used
      const creditsUsed = creditBalance?.credits_used_this_period ?? creditBalance?.credits_used_today ?? (isAuthenticated && user 
        ? (user.credits_used_this_period || 0)
        : 0)
      creditsRemaining = Math.max(0, creditsAllocated - creditsUsed)
    }

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
  }, [
    isAuthenticated,
    user,
    creditBalance,
    anonymousCreditsRemaining,
    selectedModels,
    isFollowUpMode,
    conversations,
  ])

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

          <main className="app-main">
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
                />
              </ErrorBoundary>
            </Hero>

            {/* Credit Warning Messages */}
            {creditWarningMessage && (
              <div className="error-message">
                <span>⚠️ {creditWarningMessage}</span>
                {creditWarningDismissible && creditBalance && (
                  <button
                    onClick={() => {
                      const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'
                      const periodType = userTier === 'anonymous' || userTier === 'free' ? 'daily' : 'monthly'
                      dismissLowCreditWarning(userTier, periodType, creditBalance.credits_reset_at)
                    }}
                    style={{
                      marginLeft: 'auto',
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '1.2rem',
                      padding: '0 0.5rem',
                      lineHeight: 1,
                    }}
                    aria-label="Dismiss warning"
                    title="Dismiss warning"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="error-message">
                <span>⚠️ {error}</span>
              </div>
            )}

            <ErrorBoundary>
              <section className="models-section" ref={modelsSectionRef}>
                <div
                  className="models-section-header"
                  data-has-models={selectedModels.length > 0 && isWideLayout ? 'true' : undefined}
                  onClick={() => setIsModelsHidden(!isModelsHidden)}
                  style={{
                    // On wide layout, reserve space for the selected models column (and external toggle only when shown outside)
                    // Keep padding consistent whether collapsed or not when models are selected
                    // Force the padding-right value to ensure it overrides CSS media query
                    ...(isWideLayout && selectedModels.length > 0
                      ? {
                          paddingRight: 'calc(340px + 2rem + 2.5rem)',
                        }
                      : {}),
                    ...(isWideLayout && selectedModels.length === 0
                      ? {
                          paddingRight: isModelsHidden ? 'calc(36px + 2rem)' : '0',
                        }
                      : {}),
                    // Always center items vertically
                    alignItems: 'center',
                  }}
                >
                  <div className="models-header-title">
                    <h2 style={{ margin: 0 }}>
                      {isFollowUpMode
                        ? 'Selected Models (Follow-up Mode)'
                        : 'Select Models to Compare'}
                    </h2>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                      {isFollowUpMode
                        ? 'You can deselect models or reselect previously selected ones (minimum 1 model required)'
                        : `Choose up to ${maxModelsLimit} models${
                            !isAuthenticated
                              ? ' (Anonymous Tier)'
                              : user?.subscription_tier
                                ? (() => {
                                    const parts = user.subscription_tier
                                      .split('_')
                                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    // Replace "Plus" with "+" when it appears after another word
                                    const formatted =
                                      parts.length > 1 && parts[1] === 'Plus'
                                        ? parts[0] + '+'
                                        : parts.join(' ')
                                    return ` (${formatted} Tier)`
                                  })()
                                : ''
                          }`}
                    </p>
                  </div>
                  <div
                    className="models-header-controls"
                    style={{
                      justifyContent: isWideLayout ? 'flex-end' : undefined,
                      alignSelf: isWideLayout ? 'center' : undefined,
                      marginLeft: isWideLayout ? 'auto' : undefined,
                      marginTop: 0,
                      position: isWideLayout ? 'absolute' : undefined,
                      top: isWideLayout ? '50%' : undefined,
                      right: isWideLayout ? '1rem' : undefined,
                      transform: isWideLayout ? 'translateY(-50%)' : undefined,
                    }}
                  >
                    <div className="models-header-buttons">
                      <button
                        className="collapse-all-button"
                        onClick={e => {
                          e.stopPropagation()
                          collapseAllDropdowns()
                        }}
                        disabled={openDropdowns.size === 0}
                        title={'Collapse all model providers'}
                        aria-label={'Collapse all model providers'}
                      >
                        {/* Double chevrons up icon (collapse all) */}
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                          preserveAspectRatio="xMidYMid meet"
                        >
                          <path
                            d="M7 13l5-5 5 5M7 18l5-5 5 5"
                            strokeWidth="1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        className="clear-all-button"
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedModels([])
                          // Clear comparison results if they exist
                          if (response || conversations.length > 0) {
                            setConversations([])
                            setResponse(null)
                          }
                          // Expand the models section
                          setIsModelsHidden(false)
                        }}
                        disabled={selectedModels.length === 0 || isFollowUpMode}
                        title={
                          isFollowUpMode
                            ? 'Cannot clear models during follow-up'
                            : 'Clear all selections'
                        }
                        aria-label={
                          isFollowUpMode
                            ? 'Cannot clear models during follow-up'
                            : 'Clear all selections'
                        }
                      >
                        {/* Square with X icon (deselect all) */}
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                          preserveAspectRatio="xMidYMid meet"
                        >
                          <rect
                            x="5"
                            y="5"
                            width="14"
                            height="14"
                            strokeWidth="1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9 9l6 6M15 9l-6 6"
                            strokeWidth="1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="models-header-right">
                      <div
                        className={`models-count-indicator ${selectedModels.length > 0 ? 'has-selected' : 'empty'}`}
                        title="Total selections"
                        onClick={e => e.stopPropagation()}
                      >
                        {selectedModels.length} of {maxModelsLimit} selected
                      </div>
                      <button
                        className="models-toggle-arrow"
                        onClick={e => {
                          e.stopPropagation()
                          setIsModelsHidden(!isModelsHidden)
                        }}
                        style={{
                          padding: '0.5rem',
                          fontSize: '1.25rem',
                          border: 'none',
                          outline: 'none',
                          boxShadow: 'none',
                          background: 'var(--bg-primary)',
                          color: 'var(--primary-color)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '36px',
                          height: '36px',
                          fontWeight: 'bold',
                        }}
                        title={isModelsHidden ? 'Show model selection' : 'Hide model selection'}
                      >
                        {isModelsHidden ? '▼' : '▲'}
                      </button>
                    </div>
                  </div>
                </div>

                {!isModelsHidden && (
                  <>
                    {isLoadingModels ? (
                      <div className="loading-message">Loading available models...</div>
                    ) : Object.keys(modelsByProvider).length === 0 ? (
                      <div className="error-message">
                        <p>No models available. Please check the server connection.</p>
                      </div>
                    ) : (
                      <div className="models-selection-layout">
                        <div className="provider-dropdowns">
                          {Object.entries(modelsByProvider).map(([provider, models]) => {
                            const hasSelectedModels = models.some(model =>
                              selectedModels.includes(model.id)
                            )
                            return (
                              <div
                                key={provider}
                                className={`provider-dropdown ${hasSelectedModels ? 'has-selected-models' : ''}`}
                              >
                                <button
                                  className="provider-header"
                                  onClick={() => toggleDropdown(provider)}
                                  aria-expanded={openDropdowns.has(provider)}
                                >
                                  <div className="provider-left">
                                    <span className="provider-name">{provider}</span>
                                  </div>
                                  <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                  >
                                    {(() => {
                                      const selectedCount = models.filter(model =>
                                        selectedModels.includes(model.id)
                                      ).length
                                      return (
                                        <span
                                          className={`provider-count ${selectedCount > 0 ? 'has-selected' : 'empty'}`}
                                        >
                                          {selectedCount} of {models.length} selected
                                        </span>
                                      )
                                    })()}
                                    {(() => {
                                      const providerModels = modelsByProvider[provider] || []
                                      // Filter out unavailable models (where available === false)
                                      const availableProviderModels = providerModels.filter(
                                        model => model.available !== false
                                      )
                                      const providerModelIds = availableProviderModels.map(
                                        model => model.id
                                      )
                                      const allProviderModelsSelected =
                                        providerModelIds.every(id => selectedModels.includes(id)) &&
                                        providerModelIds.length > 0
                                      const hasAnySelected = providerModelIds.some(id =>
                                        selectedModels.includes(id)
                                      )
                                      const hasAnyOriginallySelected = providerModelIds.some(id =>
                                        originalSelectedModels.includes(id)
                                      )
                                      const isDisabled =
                                        (selectedModels.length >= maxModelsLimit &&
                                          !hasAnySelected) ||
                                        (isFollowUpMode &&
                                          !hasAnySelected &&
                                          !hasAnyOriginallySelected)

                                      return (
                                        <div
                                          className={`provider-select-all ${isDisabled ? 'disabled' : ''} ${allProviderModelsSelected ? 'all-selected' : ''}`}
                                          onClick={e => {
                                            e.stopPropagation()
                                            if (!isDisabled) {
                                              toggleAllForProvider(provider)
                                            }
                                          }}
                                          title={
                                            isDisabled
                                              ? isFollowUpMode
                                                ? 'Cannot add new models during follow-up'
                                                : `Cannot select more models (max ${maxModelsLimit} for your tier)`
                                              : allProviderModelsSelected
                                                ? `Deselect All`
                                                : `Select All`
                                          }
                                        >
                                          ✱
                                        </div>
                                      )
                                    })()}
                                    <span
                                      className={`dropdown-arrow ${openDropdowns.has(provider) ? 'open' : ''}`}
                                    >
                                      ▼
                                    </span>
                                  </div>
                                </button>

                                {openDropdowns.has(provider) && (
                                  <div className="provider-models">
                                    {models.map(model => {
                                      const isSelected = selectedModels.includes(model.id)
                                      const wasOriginallySelected = originalSelectedModels.includes(
                                        model.id
                                      )
                                      const isUnavailable = model.available === false
                                      
                                      // Check if model is restricted for current user tier
                                      const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'
                                      const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)
                                      
                                      // Determine if model is restricted based on user tier
                                      // Anonymous tier: only models with tier_access === 'anonymous' are available
                                      // Free tier: models with tier_access === 'anonymous' or 'free' are available
                                      // Paid tiers: all models are available
                                      let isRestricted = false
                                      if (isPaidTier) {
                                        // Paid tiers have access to all models
                                        isRestricted = false
                                      } else if (userTier === 'anonymous') {
                                        // Anonymous tier only has access to anonymous-tier models
                                        isRestricted = model.tier_access !== 'anonymous'
                                      } else if (userTier === 'free') {
                                        // Free tier has access to anonymous and free-tier models
                                        isRestricted = model.tier_access === 'paid'
                                      }
                                      
                                      const requiresUpgrade = isRestricted && (userTier === 'anonymous' || userTier === 'free')
                                      
                                      const isDisabled =
                                        isUnavailable ||
                                        isRestricted ||
                                        (selectedModels.length >= maxModelsLimit && !isSelected) ||
                                        (isFollowUpMode && !isSelected && !wasOriginallySelected)
                                      
                                      const handleModelClick = () => {
                                        if (isRestricted && requiresUpgrade) {
                                          // Open upgrade modal or show upgrade message
                                          setError(`This model requires a paid subscription. Upgrade to access premium models like ${model.name}.`)
                                          window.scrollTo({ top: 0, behavior: 'smooth' })
                                          return
                                        }
                                        if (!isDisabled) {
                                          handleModelToggle(model.id)
                                        }
                                      }
                                      
                                      return (
                                        <label
                                          key={model.id}
                                          className={`model-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''} ${isRestricted ? 'restricted' : ''}`}
                                          title={isRestricted ? `Upgrade to ${userTier === 'anonymous' ? 'a free account' : 'a paid tier'} to access this model` : undefined}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            disabled={isDisabled}
                                            onChange={handleModelClick}
                                            className={`model-checkbox ${isFollowUpMode && !isSelected && wasOriginallySelected ? 'follow-up-deselected' : ''}`}
                                          />
                                          <div className="model-info">
                                            <h4>
                                              {model.name}
                                              {isRestricted && (
                                                <span className="model-badge premium" title="Premium model - upgrade required">
                                                  <svg
                                                    width="12"
                                                    height="12"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '0.25rem' }}
                                                  >
                                                    <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                  </svg>
                                                  Premium
                                                </span>
                                              )}
                                              {isFollowUpMode &&
                                                !isSelected &&
                                                !wasOriginallySelected && (
                                                  <span className="model-badge not-in-conversation">
                                                    Not in conversation
                                                  </span>
                                                )}
                                              {isUnavailable && (
                                                <span className="model-badge coming-soon">
                                                  Coming Soon
                                                </span>
                                              )}
                                            </h4>
                                            <p>{model.description}</p>
                                          </div>
                                        </label>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Selected Models Cards */}
                        {selectedModels.length > 0 && (
                          <div className="selected-models-section">
                            <div ref={selectedModelsGridRef} className="selected-models-grid">
                              {selectedModels.map(modelId => {
                                const model = allModels.find(m => m.id === modelId)
                                if (!model) return null

                                return (
                                  <div key={modelId} className="selected-model-card">
                                    <div className="selected-model-header">
                                      <h4>{model.name}</h4>
                                      <button
                                        className="remove-model-btn"
                                        onClick={() => handleModelToggle(modelId)}
                                        aria-label={`Remove ${model.name}`}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                    <p className="selected-model-description">
                                      {model.description}
                                    </p>
                                  </div>
                                )
                              })}
                              {/* Spacer to push cards to bottom when they don't fill the space */}
                              <div className="selected-models-spacer"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            </ErrorBoundary>

            {isLoading && (
              <div className="loading-section">
                <div className="loading-content">
                  <p>
                    Processing{' '}
                    {selectedModels.length === 1
                      ? 'response from 1 AI model'
                      : `responses from ${selectedModels.length} AI models`}
                    ...
                  </p>
                  <div className="comparison-animation">
                    <svg
                      width="200"
                      height="80"
                      viewBox="0 0 200 80"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Left arrow - single path combining shaft and head */}
                      <g className="arrow-left">
                        <path
                          d="M 5 34 L 90 34 L 90 28 L 99.5 40 L 90 52 L 90 46 L 5 46 Z"
                          fill="#3b82f6"
                        />
                      </g>
                      {/* Right arrow - single path combining shaft and head */}
                      <g className="arrow-right">
                        <path
                          d="M 195 34 L 110 34 L 110 28 L 100.5 40 L 110 52 L 110 46 L 195 46 Z"
                          fill="#87CEEB"
                        />
                      </g>
                      {/* Spark effect flowing from meeting point - 12 particles in circular formation */}
                      <g className="spark-effect">
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                        <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
                      </g>
                    </svg>
                  </div>
                  <button
                    onClick={handleCancel}
                    className="cancel-button"
                    aria-label="Stop comparison"
                  >
                    <span className="cancel-x">✕</span>
                    <span className="cancel-text">Cancel</span>
                  </button>
                </div>
              </div>
            )}

            {(response || conversations.length > 0) && (
              <ErrorBoundary>
                <section className="results-section">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <h2 style={{ margin: 0 }}>Comparison Results</h2>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      {/* Scroll Lock Toggle - Only show when multiple models are running */}
                      {conversations.length > 1 && (
                        <button
                          onClick={() => {
                            setIsScrollLocked(!isScrollLocked)
                          }}
                          style={{
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.875rem',
                            border:
                              '1px solid ' + (isScrollLocked ? 'var(--primary-color)' : '#cccccc'),
                            background: isScrollLocked ? 'var(--primary-color)' : 'transparent',
                            color: isScrollLocked ? 'white' : '#666',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            outline: 'none',
                          }}
                          title={
                            isScrollLocked
                              ? 'Unlock scrolling - Each card scrolls independently'
                              : 'Lock scrolling - All cards scroll together'
                          }
                          onMouseOver={e => {
                            if (!isScrollLocked) {
                              e.currentTarget.style.borderColor = '#999'
                              e.currentTarget.style.color = '#333'
                            }
                          }}
                          onMouseOut={e => {
                            if (!isScrollLocked) {
                              e.currentTarget.style.borderColor = '#cccccc'
                              e.currentTarget.style.color = '#666'
                            }
                          }}
                        >
                          <span>Scroll</span>
                          {isScrollLocked ? (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          ) : (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                              <line x1="7" y1="11" x2="7" y2="7" />
                            </svg>
                          )}
                        </button>
                      )}
                      {!isFollowUpMode && (
                        <button
                          onClick={handleFollowUp}
                          className="follow-up-button"
                          title={
                            isFollowUpDisabled()
                              ? 'Cannot follow up when new models are selected. You can follow up if you only deselect models from the original comparison.'
                              : 'Ask a follow-up question'
                          }
                          disabled={isFollowUpDisabled()}
                        >
                          Follow up
                        </button>
                      )}
                      {closedCards.size > 0 && (
                        <button
                          onClick={showAllResults}
                          style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.875rem',
                            border: '1px solid var(--primary-color)',
                            background: 'var(--primary-color)',
                            color: 'white',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            fontWeight: '500',
                          }}
                          onMouseOver={e => {
                            e.currentTarget.style.background = 'var(--primary-hover)'
                            e.currentTarget.style.borderColor = 'var(--primary-hover)'
                          }}
                          onMouseOut={e => {
                            e.currentTarget.style.background = 'var(--primary-color)'
                            e.currentTarget.style.borderColor = 'var(--primary-color)'
                          }}
                        >
                          Show All Results ({closedCards.size} hidden)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  {response && (
                    <div className={`results-metadata ${isMetadataCollapsed ? 'collapsed' : ''}`}>
                      <div className="metadata-header">
                        {isMetadataCollapsed && (
                          <span className="metadata-details-text" style={{ marginRight: 'auto' }}>
                            Details...
                          </span>
                        )}
                        <button
                          className="metadata-toggle-arrow"
                          onClick={e => {
                            e.stopPropagation()
                            setIsMetadataCollapsed(!isMetadataCollapsed)
                          }}
                          style={{
                            padding: '0.5rem',
                            fontSize: '1.25rem',
                            border: 'none',
                            outline: 'none',
                            boxShadow: 'none',
                            background: 'transparent',
                            color: 'var(--primary-color)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '36px',
                            height: '36px',
                            fontWeight: 'bold',
                          }}
                          title={isMetadataCollapsed ? 'Show details' : 'Hide details'}
                        >
                          {isMetadataCollapsed ? '▼' : '▲'}
                        </button>
                      </div>
                      {!isMetadataCollapsed && (
                        <div className="metadata-items">
                          <div className="metadata-item">
                            <span className="metadata-label">Input Length:</span>
                            <span className="metadata-value">
                              {response.metadata.input_length} characters
                            </span>
                          </div>
                          <div className="metadata-item">
                            <span className="metadata-label">Models Successful:</span>
                            <span
                              className={`metadata-value ${response.metadata.models_successful > 0 ? 'successful' : ''}`}
                            >
                              {response.metadata.models_successful}/
                              {response.metadata.models_requested}
                            </span>
                          </div>
                          {Object.keys(response.results).length > 0 && (
                            <div className="metadata-item">
                              <span className="metadata-label">Results Visible:</span>
                              <span className="metadata-value">
                                {Object.keys(response.results).length - closedCards.size}/
                                {Object.keys(response.results).length}
                              </span>
                            </div>
                          )}
                          {response.metadata.models_failed > 0 && (
                            <div className="metadata-item">
                              <span className="metadata-label">Models Failed:</span>
                              <span className="metadata-value failed">
                                {response.metadata.models_failed}
                              </span>
                            </div>
                          )}
                          {processingTime && (
                            <div className="metadata-item">
                              <span className="metadata-label">Processing Time:</span>
                              <span className="metadata-value">
                                {(() => {
                                  if (processingTime < 1000) {
                                    return `${processingTime}ms`
                                  } else if (processingTime < 60000) {
                                    return `${(processingTime / 1000).toFixed(1)}s`
                                  } else {
                                    const minutes = Math.floor(processingTime / 60000)
                                    const seconds = Math.floor((processingTime % 60000) / 1000)
                                    return `${minutes}m ${seconds}s`
                                  }
                                })()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="results-grid">
                    {conversations
                      .filter(
                        conv =>
                          selectedModels.includes(conv.modelId) && !closedCards.has(conv.modelId)
                      )
                      .map(conversation => {
                        const model = allModels.find(m => m.id === conversation.modelId)
                        const latestMessage =
                          conversation.messages[conversation.messages.length - 1]
                        const content = latestMessage?.content || ''
                        // Check for error: backend error flag OR error message in content OR empty content after completion (timeout)
                        const hasBackendError = modelErrors[conversation.modelId] === true
                        const hasErrorMessage = isErrorMessage(content)
                        // Consider empty content an error if:
                        // 1. Model has completed (has entry in modelErrors) - normal completion case
                        // 2. Model hasn't completed but loading is done (timeout case) - mark as failed
                        const modelHasCompleted = conversation.modelId in modelErrors
                        const isLoadingDone = !isLoading // If not loading, stream has ended (either completed or timed out)
                        const isEmptyContent =
                          content.trim().length === 0 &&
                          latestMessage?.type === 'assistant' &&
                          (modelHasCompleted || isLoadingDone)
                        const isError = hasBackendError || hasErrorMessage || isEmptyContent
                        const safeId = getSafeId(conversation.modelId)

                        return (
                          <div key={conversation.modelId} className="result-card conversation-card">
                            <div className="result-header">
                              <div className="result-header-top">
                                <h3>{model?.name || conversation.modelId}</h3>
                                <div className="header-buttons-container">
                                  <button
                                    className="screenshot-card-btn"
                                    onClick={e => {
                                      handleScreenshot(conversation.modelId)
                                      e.currentTarget.blur()
                                    }}
                                    title="Copy formatted chat history"
                                    aria-label={`Copy formatted chat history for ${model?.name || conversation.modelId}`}
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <rect x="2" y="3" width="20" height="14" rx="2" />
                                      <path d="M8 21h8" />
                                      <path d="M12 17v4" />
                                    </svg>
                                  </button>
                                  <button
                                    className="copy-response-btn"
                                    onClick={() => handleCopyResponse(conversation.modelId)}
                                    title="Copy raw chat history"
                                    aria-label={`Copy raw chat history from ${model?.name || conversation.modelId}`}
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                  </button>
                                  <button
                                    className="hide-others-btn"
                                    onClick={() => hideAllOtherModels(conversation.modelId)}
                                    title="Hide all other results"
                                    aria-label={`Hide all other results except ${model?.name || conversation.modelId}`}
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <rect
                                        x="3"
                                        y="3"
                                        width="7"
                                        height="7"
                                        fill="currentColor"
                                        opacity="0.8"
                                      />
                                      <rect x="14" y="3" width="7" height="7" />
                                      <rect x="14" y="14" width="7" height="7" />
                                      <rect x="3" y="14" width="7" height="7" />
                                    </svg>
                                  </button>
                                  <button
                                    className="close-card-btn"
                                    onClick={() => closeResultCard(conversation.modelId)}
                                    title="Hide this result"
                                    aria-label={`Hide result for ${model?.name || conversation.modelId}`}
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                      <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                              <div className="result-header-bottom">
                                <span className="output-length">
                                  {latestMessage?.content.length || 0} chars
                                </span>
                                <div className="result-tabs">
                                  <button
                                    className={`tab-button ${(activeResultTabs[conversation.modelId] || RESULT_TAB.FORMATTED) === RESULT_TAB.FORMATTED ? 'active' : ''}`}
                                    onClick={() =>
                                      switchResultTab(conversation.modelId, RESULT_TAB.FORMATTED)
                                    }
                                  >
                                    Formatted
                                  </button>
                                  <button
                                    className={`tab-button ${(activeResultTabs[conversation.modelId] || RESULT_TAB.FORMATTED) === RESULT_TAB.RAW ? 'active' : ''}`}
                                    onClick={() =>
                                      switchResultTab(conversation.modelId, RESULT_TAB.RAW)
                                    }
                                  >
                                    Raw
                                  </button>
                                </div>
                                <span className={`status ${isError ? 'error' : 'success'}`}>
                                  {isError ? 'Failed' : 'Success'}
                                </span>
                              </div>
                            </div>
                            <div
                              className="conversation-content"
                              id={`conversation-content-${safeId}`}
                            >
                              {conversation.messages.map(message => {
                                const messageSafeId = getSafeId(message.id)
                                const messageContentId = `message-content-${safeId}-${messageSafeId}`
                                return (
                                  <div
                                    key={message.id}
                                    className={`conversation-message ${message.type}`}
                                  >
                                    <div className="message-header">
                                      <span
                                        className="message-type"
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}
                                      >
                                        {message.type === 'user' ? (
                                          <>
                                            <svg
                                              width="14"
                                              height="14"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            >
                                              <circle cx="12" cy="8" r="4" />
                                              <path d="M20 21a8 8 0 1 0-16 0" />
                                            </svg>
                                            <span>You</span>
                                          </>
                                        ) : (
                                          <>
                                            <svg
                                              width="14"
                                              height="14"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            >
                                              <rect x="4" y="4" width="16" height="16" rx="2" />
                                              <rect x="9" y="9" width="6" height="6" />
                                              <line x1="9" y1="2" x2="9" y2="4" />
                                              <line x1="15" y1="2" x2="15" y2="4" />
                                              <line x1="9" y1="20" x2="9" y2="22" />
                                              <line x1="15" y1="20" x2="15" y2="22" />
                                              <line x1="20" y1="9" x2="22" y2="9" />
                                              <line x1="20" y1="15" x2="22" y2="15" />
                                              <line x1="2" y1="9" x2="4" y2="9" />
                                              <line x1="2" y1="15" x2="4" y2="15" />
                                            </svg>
                                            <span>AI</span>
                                          </>
                                        )}
                                      </span>
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                        }}
                                      >
                                        <span className="message-time">
                                          {formatTime(message.timestamp)}
                                        </span>
                                        <button
                                          className="copy-message-btn"
                                          onClick={e => {
                                            handleCopyMessage(
                                              conversation.modelId,
                                              message.id,
                                              message.content
                                            )
                                            e.currentTarget.blur()
                                          }}
                                          title={
                                            (activeResultTabs[conversation.modelId] ||
                                              RESULT_TAB.FORMATTED) === RESULT_TAB.FORMATTED
                                              ? 'Copy formatted message'
                                              : 'Copy raw message'
                                          }
                                          aria-label={`Copy ${(activeResultTabs[conversation.modelId] || RESULT_TAB.FORMATTED) === RESULT_TAB.FORMATTED ? 'formatted' : 'raw'} message`}
                                        >
                                          <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          >
                                            <rect
                                              x="9"
                                              y="9"
                                              width="13"
                                              height="13"
                                              rx="2"
                                              ry="2"
                                            />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                    <div className="message-content" id={messageContentId}>
                                      {(activeResultTabs[conversation.modelId] ||
                                        RESULT_TAB.FORMATTED) === RESULT_TAB.FORMATTED ? (
                                        /* Full LaTeX rendering for formatted view */
                                        <Suspense
                                          fallback={
                                            <pre className="result-output raw-output">
                                              {message.content}
                                            </pre>
                                          }
                                        >
                                          <LatexRenderer
                                            className="result-output"
                                            modelId={conversation.modelId}
                                          >
                                            {message.content}
                                          </LatexRenderer>
                                        </Suspense>
                                      ) : (
                                        /* Raw text for immediate streaming display */
                                        <pre className="result-output raw-output">
                                          {message.content}
                                        </pre>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </section>
              </ErrorBoundary>
            )}
          </main>

          {/* Footer */}
          <Footer />

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
        </>
      )}
    </div>
  )
}

// Wrap AppContent with AuthProvider
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="*" element={<AppContent />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
