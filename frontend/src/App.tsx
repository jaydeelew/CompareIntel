import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from 'react'
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
import { Layout } from './components'
import { AuthModal, VerifyEmail, VerificationBanner, ResetPassword } from './components/auth'
import { ComparisonForm, type AttachedFile, type StoredAttachedFile } from './components/comparison'
import { Navigation, Hero, MockModeBanner, InstallPrompt } from './components/layout'
import { About, Features, FAQ, PrivacyPolicy, HowItWorks } from './components/pages'
import { DoneSelectingCard, ErrorBoundary, LoadingSpinner } from './components/shared'
import { TermsOfService } from './components/TermsOfService'
import { getCreditAllocation, getDailyCreditLimit } from './config/constants'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import {
  useConversationHistory,
  useBrowserFingerprint,
  useRateLimitStatus,
  useModelSelection,
  useModelComparison,
  useSavedModelSelections,
} from './hooks'
import { apiClient } from './services/api/client'
import { ApiError, PaymentRequiredError } from './services/api/errors'
import {
  getAnonymousMockModeStatus,
  getRateLimitStatus,
  resetRateLimit,
  compareStream,
} from './services/compareService'
import { getConversation, createBreakoutConversation } from './services/conversationService'
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
  exportToPDF,
  downloadMarkdown,
  downloadJSON,
  downloadHTML,
} from './utils'
import type { ComparisonExportData } from './utils'
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

  // Custom hooks for state management
  const browserFingerprintHook = useBrowserFingerprint()
  const { browserFingerprint, setBrowserFingerprint } = browserFingerprintHook

  const rateLimitHook = useRateLimitStatus({ isAuthenticated, browserFingerprint })
  const { usageCount, setUsageCount, fetchRateLimitStatus } = rateLimitHook

  const modelSelectionHook = useModelSelection({ isAuthenticated, user })
  const {
    selectedModels,
    setSelectedModels,
    originalSelectedModels,
    setOriginalSelectedModels,
    maxModelsLimit,
  } = modelSelectionHook

  // Saved model selections hook for storing/loading named model selection groups
  // Pass user ID to store selections per user (registered users use their ID, anonymous users get a generated ID)
  // Pass subscription tier to enforce tier-based limits on saved selections
  const savedSelectionsHook = useSavedModelSelections(
    user?.id,
    user?.subscription_tier ?? 'anonymous'
  )
  const {
    savedSelections: savedModelSelections,
    saveSelection: saveModelSelection,
    loadSelection: loadModelSelectionFromStorage,
    deleteSelection: deleteModelSelection,
    canSaveMore: canSaveMoreSelections,
    maxSelections: maxSavedSelections,
  } = savedSelectionsHook

  // Store accurate token count from ComparisonForm (from /estimate-tokens endpoint)
  const [accurateInputTokens, setAccurateInputTokens] = useState<number | null>(null)

  // File attachments state (can be AttachedFile for new uploads or StoredAttachedFile for loaded history)
  const [attachedFiles, setAttachedFilesState] = useState<(AttachedFile | StoredAttachedFile)[]>([])
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)

  // User location state (for accurate location context)
  const [userLocation, _setUserLocation] = useState<string | null>(null)

  // Wrapper function to match ComparisonForm's expected signature
  const setAttachedFiles = useCallback((files: (AttachedFile | StoredAttachedFile)[]) => {
    setAttachedFilesState(files)
  }, [])

  // Configure PDF.js worker
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
  }, [])

  // Extract text from PDF file
  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .filter(item => 'str' in item)
          .map(item => (item as { str: string }).str)
          .join(' ')
        fullText += pageText + '\n\n'
      }

      return fullText.trim()
    } catch (error) {
      console.error('Error extracting text from PDF:', error)
      throw new Error('Failed to extract text from PDF file')
    }
  }, [])

  // Extract text from DOCX file
  const extractTextFromDOCX = useCallback(async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      return result.value
    } catch (error) {
      console.error('Error extracting text from DOCX:', error)
      throw new Error('Failed to extract text from DOCX file')
    }
  }, [])

  // Expand file contents - replaces placeholders with actual file contents
  // Structures the message similar to Cursor IDE: user input separated from file contents
  const expandFiles = useCallback(
    async (files: (AttachedFile | StoredAttachedFile)[], userInput: string): Promise<string> => {
      if (files.length === 0) {
        return userInput
      }

      // Extract content from all files
      // Handle both AttachedFile (with File object) and StoredAttachedFile (with stored content)
      const fileContents: Array<{ name: string; content: string }> = []

      for (const attachedFile of files) {
        try {
          let content = ''

          // Check if this is a StoredAttachedFile (has content property)
          if ('content' in attachedFile && attachedFile.content) {
            // Use stored content directly
            content = attachedFile.content
          } else if ('file' in attachedFile && attachedFile.file) {
            // Extract content from File object (AttachedFile)
            const fileName = attachedFile.file.name.toLowerCase()

            // Handle PDF files
            if (fileName.endsWith('.pdf')) {
              content = await extractTextFromPDF(attachedFile.file)
            }
            // Handle DOCX files
            else if (fileName.endsWith('.docx')) {
              content = await extractTextFromDOCX(attachedFile.file)
            }
            // Handle other document types (DOC, ODT) - try as text first
            else if (fileName.endsWith('.doc') || fileName.endsWith('.odt')) {
              try {
                content = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader()
                  reader.onload = e => resolve(e.target?.result as string)
                  reader.onerror = reject
                  reader.readAsText(attachedFile.file)
                })
              } catch {
                throw new Error(`Failed to extract text from ${attachedFile.name}`)
              }
            }
            // Handle text/code files
            else {
              content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = e => resolve(e.target?.result as string)
                reader.onerror = reject
                reader.readAsText(attachedFile.file)
              })
            }
          }

          if (content && content.trim()) {
            fileContents.push({ name: attachedFile.name, content: content.trim() })
          }
        } catch (error) {
          console.error(`Error extracting content from ${attachedFile.name}:`, error)
          // Continue with other files even if one fails
        }
      }

      // Create a map of placeholder -> file content for quick lookup
      const fileContentMap = new Map<string, string>()
      fileContents.forEach(({ name, content }) => {
        // Find the matching attached file by name
        const attachedFile = files.find(f => f.name === name)
        if (attachedFile) {
          fileContentMap.set(attachedFile.placeholder, content)
        }
      })

      // Preserve the order of user input and files as they appear in the textarea
      // This handles any combination:
      // - Files before user input: [file: test.txt] Please review this
      // - User input before files: Please review [file: test.txt]
      // - Mixed: [file: file1.txt] Review this [file: file2.txt] and this
      // - Multiple files: [file: file1.txt] [file: file2.txt]

      // Replace each placeholder with explicit file markers and content
      // Format: [FILE: filename] followed by content, then [/FILE: filename]
      // This makes it very clear to the model what is file content vs user input
      let result = userInput

      // Process files in the order they appear in the input (by finding placeholders)
      // Use a more robust replacement that handles multiple occurrences
      files.forEach(attachedFile => {
        const placeholder = attachedFile.placeholder
        const content = fileContentMap.get(placeholder)

        if (content) {
          // Replace placeholder with explicit file markers and content
          // Use clear markers that the model can easily distinguish:
          // [FILE: filename] marks the start of file content
          // [/FILE: filename] marks the end of file content
          const fileSection = `\n\n[FILE: ${attachedFile.name}]\n${content}\n[/FILE: ${attachedFile.name}]\n\n`
          // Replace all occurrences of this placeholder (in case user pasted it multiple times)
          result = result.split(placeholder).join(fileSection)
        } else {
          // File extraction failed, remove placeholder but add a note
          const errorSection = `\n\n[FILE: ${attachedFile.name} - extraction failed]\n\n`
          result = result.split(placeholder).join(errorSection)
        }
      })

      // Clean up excessive newlines (more than 2 consecutive) while preserving structure
      result = result.replace(/\n{3,}/g, '\n\n')

      return result.trim()
    },
    [extractTextFromPDF, extractTextFromDOCX]
  )

  // Helper function to extract file content from AttachedFile[] for storage
  const extractFileContentForStorage = useCallback(
    async (
      files: AttachedFile[]
    ): Promise<Array<{ name: string; content: string; placeholder: string }>> => {
      const extractedFiles: Array<{ name: string; content: string; placeholder: string }> = []

      for (const attachedFile of files) {
        try {
          const fileName = attachedFile.file.name.toLowerCase()
          let content = ''

          // Handle PDF files
          if (fileName.endsWith('.pdf')) {
            content = await extractTextFromPDF(attachedFile.file)
          }
          // Handle DOCX files
          else if (fileName.endsWith('.docx')) {
            content = await extractTextFromDOCX(attachedFile.file)
          }
          // Handle other document types (DOC, ODT) - try as text first
          else if (fileName.endsWith('.doc') || fileName.endsWith('.odt')) {
            try {
              content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = e => resolve(e.target?.result as string)
                reader.onerror = reject
                reader.readAsText(attachedFile.file)
              })
            } catch {
              throw new Error(`Failed to extract text from ${attachedFile.name}`)
            }
          }
          // Handle text/code files
          else {
            content = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = e => resolve(e.target?.result as string)
              reader.onerror = reject
              reader.readAsText(attachedFile.file)
            })
          }

          if (content && content.trim()) {
            extractedFiles.push({
              name: attachedFile.name,
              content: content.trim(),
              placeholder: attachedFile.placeholder,
            })
          }
        } catch (error) {
          console.error(`Error extracting content from ${attachedFile.name} for storage:`, error)
          // Continue with other files even if one fails
        }
      }

      return extractedFiles
    },
    [extractTextFromPDF, extractTextFromDOCX]
  )

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

  // State not covered by hooks (declare before callbacks that use them)
  const selectedModelsGridRef = useRef<HTMLDivElement>(null)
  const scrolledToTopRef = useRef<Set<string>>(new Set()) // Track which model cards have been scrolled to top
  const shouldScrollToTopAfterFormattingRef = useRef<boolean>(false) // Track if we should scroll to top after all models format (initial comparison only)
  const isPageScrollingRef = useRef<boolean>(false) // Track if user is scrolling the page
  const hasScrolledToResultsOnFirstChunkRef = useRef<boolean>(false) // Track if we've scrolled to results section on first streaming chunk
  const justLoadedFromHistoryRef = useRef<boolean>(false) // Track if we just loaded conversations from history
  const isScrollingToTopFromHistoryRef = useRef<boolean>(false) // Track if we're currently scrolling to top from history (prevents scroll sync)
  const lastSubmittedInputRef = useRef<string>('') // Store the expanded input that was sent to backend for matching
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
  const [hidePremiumModels, setHidePremiumModels] = useState(false)
  const [modelErrors, setModelErrors] = useState<{ [key: string]: boolean }>({})
  const [anonymousCreditsRemaining, setAnonymousCreditsRemaining] = useState<number | null>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [creditWarningMessage, setCreditWarningMessage] = useState<string | null>(null)
  const [creditWarningType, setCreditWarningType] = useState<
    'low' | 'insufficient' | 'none' | null
  >(null)
  const [creditWarningDismissible, setCreditWarningDismissible] = useState(false)

  // Track which models have already been broken out from the current conversation
  const [_alreadyBrokenOutModels, setAlreadyBrokenOutModels] = useState<Set<string>>(new Set())

  // Track breakout transition phase for smooth animations
  // 'idle' = normal state, 'fading-out' = old cards fading out, 'hidden' = waiting to show new card, 'fading-in' = new card fading in
  const [breakoutPhase, setBreakoutPhase] = useState<
    'idle' | 'fading-out' | 'hidden' | 'fading-in'
  >('idle')

  // Export functionality state
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Handler to save current model selection
  const handleSaveModelSelection = useCallback(
    (name: string) => {
      return saveModelSelection(name, selectedModels)
    },
    [saveModelSelection, selectedModels]
  )

  // Handler to load a saved model selection
  const handleLoadModelSelection = useCallback(
    (id: string) => {
      const modelIds = loadModelSelectionFromStorage(id)
      if (modelIds) {
        // Filter to only include models that still exist and are within the current tier limit
        const validModelIds = modelIds.filter(modelId => {
          for (const providerModels of Object.values(modelsByProvider)) {
            if (providerModels.some(m => String(m.id) === modelId)) {
              return true
            }
          }
          return false
        })

        // Limit to maxModelsLimit
        const limitedModelIds = validModelIds.slice(0, maxModelsLimit)

        if (limitedModelIds.length === 0) {
          showNotification('None of the saved models are available anymore', 'error')
          return
        }

        if (limitedModelIds.length < modelIds.length) {
          showNotification(
            `Some models were removed (not available or tier limit exceeded)`,
            'success'
          )
        }

        setSelectedModels(limitedModelIds)

        // Update dropdown states: collapse dropdowns without selections, expand dropdowns with selections
        setOpenDropdowns(prev => {
          const newSet = new Set(prev)
          let hasChanges = false

          // First, collapse any open dropdowns that don't have selected models
          for (const provider of prev) {
            const providerModels = modelsByProvider[provider]
            if (providerModels) {
              // Check if this provider has any selected models
              const hasSelectedModels = providerModels.some(model =>
                limitedModelIds.includes(String(model.id))
              )

              // If dropdown is open but provider has no selected models, collapse it
              if (!hasSelectedModels) {
                newSet.delete(provider)
                hasChanges = true
              }
            }
          }

          // Then, expand dropdowns for providers that have selected models
          for (const [provider, providerModels] of Object.entries(modelsByProvider)) {
            if (providerModels) {
              // Check if this provider has any selected models
              const hasSelectedModels = providerModels.some(model =>
                limitedModelIds.includes(String(model.id))
              )

              // If provider has selected models and dropdown is not already open, expand it
              if (hasSelectedModels && !newSet.has(provider)) {
                newSet.add(provider)
                hasChanges = true
              }
            }
          }

          return hasChanges ? newSet : prev
        })

        // Clear any existing comparison results when loading a saved selection
        if (response || conversations.length > 0) {
          setConversations([])
          setResponse(null)
        }
      }
    },
    [
      loadModelSelectionFromStorage,
      modelsByProvider,
      maxModelsLimit,
      setSelectedModels,
      setOpenDropdowns,
      response,
      conversations.length,
      setConversations,
      setResponse,
    ]
  )

  // Refs for error message elements to enable scrolling
  const creditWarningMessageRef = useRef<HTMLDivElement>(null)
  const errorMessageRef = useRef<HTMLDivElement>(null)
  const prevCreditWarningMessageRef = useRef<string | null>(null)
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

  // Scroll to credit warning message when it first appears and center it vertically
  useEffect(() => {
    // Check if credit warning message just appeared
    if (creditWarningMessage && !prevCreditWarningMessageRef.current) {
      scrollToCenterElement(creditWarningMessageRef.current)
    }
    prevCreditWarningMessageRef.current = creditWarningMessage
  }, [creditWarningMessage, scrollToCenterElement])

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
  ])

  const conversationHistoryHook = useConversationHistory({
    isAuthenticated,
    user,
    onDeleteActiveConversation: handleDeleteActiveConversation,
  })

  // Helper function to get credit warning message based on tier and scenario
  const getCreditWarningMessage = useCallback(
    (
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
          const resetDate = creditsResetAt
            ? new Date(creditsResetAt).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
              })
            : 'N/A'
          return `You've run out of credits which will reset on ${resetDate}. Wait until your reset, or sign-up for model comparison overages.`
        } else {
          // starter, starter_plus, pro
          const resetDate = creditsResetAt
            ? new Date(creditsResetAt).toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
              })
            : 'N/A'
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
    },
    []
  )

  // Helper function to check if low credit warning was dismissed for current period
  const isLowCreditWarningDismissed = useCallback(
    (tier: string, periodType: 'daily' | 'monthly', creditsResetAt?: string): boolean => {
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
    },
    []
  )

  // Helper function to dismiss low credit warning for current period
  const dismissLowCreditWarning = useCallback(
    (tier: string, periodType: 'daily' | 'monthly', creditsResetAt?: string) => {
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
    },
    []
  )

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

  // Detect when screen is small enough to show tabs (same breakpoint as CSS: 768px)
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 768
  })

  useEffect(() => {
    const handleResize = () => setIsMobileLayout(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  // Reset active tab index if it's out of bounds
  useEffect(() => {
    if (activeTabIndex >= visibleConversations.length && visibleConversations.length > 0) {
      setActiveTabIndex(0)
    }
  }, [activeTabIndex, visibleConversations.length])

  // Detect when screen is small enough that "chars" would wrap in result cards
  const [isSmallLayout, setIsSmallLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 640 // Breakpoint where "N chars" would wrap
  })

  useEffect(() => {
    const handleResize = () => setIsSmallLayout(window.innerWidth <= 640)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // State for character count tooltip visibility (per modelId)
  const [visibleCharTooltip, setVisibleCharTooltip] = useState<string | null>(null)

  // Handle tap/click to show character count tooltip on mobile
  const handleCharCountClick = (modelId: string) => {
    if (isSmallLayout) {
      setVisibleCharTooltip(modelId)
      // Auto-hide after 2 seconds
      setTimeout(() => {
        setVisibleCharTooltip(null)
      }, 2000)
    }
  }

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

      // If we're scrolling to top from history, don't sync to prevent interference
      if (isScrollingToTopFromHistoryRef.current) {
        return
      }

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

  // Scroll all conversations to top when loaded from history
  // Use useLayoutEffect to run synchronously before browser paint
  useLayoutEffect(() => {
    if (justLoadedFromHistoryRef.current && conversations.length > 0 && !isLoadingHistory) {
      // Set flag to prevent scroll syncing from interfering
      isScrollingToTopFromHistoryRef.current = true
      // Temporarily disable scroll syncing immediately
      syncingFromElementRef.current = null

      // Try to scroll immediately
      const scrollImmediately = () => {
        conversations.forEach(conversation => {
          const safeId = getSafeId(conversation.modelId)
          const conversationContent = document.querySelector(
            `#conversation-content-${safeId}`
          ) as HTMLElement
          if (conversationContent) {
            conversationContent.scrollTop = 0
          }
        })
      }

      scrollImmediately()

      // Also use a retry mechanism in case elements aren't rendered yet
      const scrollToTop = (attempts = 0) => {
        const maxAttempts = 25
        const delay = attempts === 0 ? 100 : attempts < 10 ? 50 : 25

        setTimeout(() => {
          const elementsToScroll: HTMLElement[] = []
          let allFound = true

          // Collect all conversation content elements
          conversations.forEach(conversation => {
            const safeId = getSafeId(conversation.modelId)
            const conversationContent = document.querySelector(
              `#conversation-content-${safeId}`
            ) as HTMLElement
            if (conversationContent) {
              // Verify element has content and is visible
              if (conversationContent.scrollHeight > 0 && conversationContent.offsetHeight > 0) {
                elementsToScroll.push(conversationContent)
                // Scroll to top
                conversationContent.scrollTop = 0
              } else {
                allFound = false
              }
            } else {
              allFound = false
            }
          })

          // Retry if not all elements were found
          if (!allFound && attempts < maxAttempts) {
            scrollToTop(attempts + 1)
          } else {
            // Verify all are scrolled to top
            const allScrolledToTop =
              elementsToScroll.length === conversations.length &&
              elementsToScroll.every(el => Math.abs(el.scrollTop) < 1)

            if (!allScrolledToTop && attempts < maxAttempts) {
              scrollToTop(attempts + 1)
            } else {
              // Keep flags set for longer to prevent scroll sync from interfering
              setTimeout(() => {
                justLoadedFromHistoryRef.current = false
                // Keep scroll prevention flag set longer to ensure no sync happens
                setTimeout(() => {
                  isScrollingToTopFromHistoryRef.current = false
                }, 1000) // Keep it set for 1 second total to prevent any sync interference
              }, 600)
            }
          }
        }, delay)
      }

      // Start retry mechanism after a brief delay
      requestAnimationFrame(() => {
        scrollToTop()
      })
    }
    // syncingFromElementRef is a ref (stable reference), but ESLint requires it in deps
  }, [conversations, isLoadingHistory, syncingFromElementRef])

  // Keep ref in sync with state
  useEffect(() => {
    isScrollLockedRef.current = isScrollLocked

    // When scroll lock is enabled, align all cards to the first card's scroll position
    // But skip if we just loaded from history (to prevent interference)
    if (isScrollLocked && conversations.length > 0 && !justLoadedFromHistoryRef.current) {
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
  const loadConversationFromLocalStorage = useCallback(
    (
      id: string
    ): {
      input_data: string
      models_used: string[]
      messages: StoredMessage[]
      file_contents?: Array<{ name: string; content: string; placeholder: string }>
      conversation_type?: 'comparison' | 'breakout'
      parent_conversation_id?: string | null
      breakout_model_id?: string | null
      already_broken_out_models?: string[]
    } | null => {
      try {
        const stored = localStorage.getItem(`compareintel_conversation_${id}`)
        if (stored) {
          const parsed = JSON.parse(stored)

          // Calculate already_broken_out_models for anonymous users
          // Only check if this is a comparison (not a breakout itself)
          const already_broken_out_models: string[] = []
          if (parsed.conversation_type !== 'breakout') {
            // Load all conversations from history to find breakouts
            const historyJson = localStorage.getItem('compareintel_conversation_history')
            if (historyJson) {
              const history = JSON.parse(historyJson) as ConversationSummary[]
              // Compare parent_conversation_id (number) with conversation id (string timestamp)
              const conversationIdNum = parseInt(id, 10)
              const existingBreakouts = history.filter(
                conv =>
                  conv.parent_conversation_id === conversationIdNum &&
                  conv.conversation_type === 'breakout' &&
                  conv.breakout_model_id
              )
              already_broken_out_models.push(
                ...existingBreakouts.map(conv => String(conv.breakout_model_id)).filter(Boolean)
              )
            }
          }

          return {
            ...parsed,
            already_broken_out_models,
          }
        } else {
          console.warn('No conversation found in localStorage for id:', id)
        }
      } catch (e) {
        console.error('Failed to load conversation from localStorage:', e, { id })
      }
      return null
    },
    []
  )

  // Load full conversation from API (authenticated users)
  const loadConversationFromAPI = useCallback(
    async (
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
            // Preserve token fields from API response
            if (msg.input_tokens !== undefined && msg.input_tokens !== null) {
              storedMessage.input_tokens = msg.input_tokens
            }
            if (msg.output_tokens !== undefined && msg.output_tokens !== null) {
              storedMessage.output_tokens = msg.output_tokens
            }
            // Preserve success field from API response
            if (msg.success !== undefined) {
              storedMessage.success = msg.success
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
    },
    [isAuthenticated]
  )

  // Load a conversation from history
  const loadConversation = async (summary: ConversationSummary) => {
    setIsLoadingHistory(true)
    try {
      let conversationData: {
        input_data: string
        models_used: string[]
        messages: StoredMessage[]
        file_contents?: Array<{ name: string; content: string; placeholder: string }>
        already_broken_out_models?: string[]
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

      // Store already broken out models (only for authenticated users, from API)
      if (conversationData.already_broken_out_models) {
        setAlreadyBrokenOutModels(new Set(conversationData.already_broken_out_models))
      } else {
        setAlreadyBrokenOutModels(new Set())
      }

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
            // Preserve token fields from stored message
            input_tokens: round.user.input_tokens,
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
              // Preserve token fields from stored message
              output_tokens: modelAssistant.output_tokens,
            })
          }
        })
      })

      // Convert to ModelConversation format
      const loadedConversations: ModelConversation[] = modelsUsed.map((modelId: string) => ({
        modelId: createModelId(modelId),
        messages: messagesByModel[modelId] || [],
      }))

      // Detect and mark failed models when loading from history
      // This ensures the status indicator shows "FAIL" for failed models
      const loadedModelErrors: { [key: string]: boolean } = {}

      // Check each model that was used in the conversation
      modelsUsed.forEach((modelId: string) => {
        const createdModelId = createModelId(modelId)
        const conv = loadedConversations.find(c => c.modelId === createdModelId)

        if (!conv) {
          // Model was in models_used but has no conversation - it failed
          loadedModelErrors[createdModelId] = true
          return
        }

        // Check if model has any assistant messages
        const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')

        // For authenticated users: if model is in models_used but has no assistant messages, it failed
        // (failed messages are not saved to database for authenticated users)
        if (assistantMessages.length === 0) {
          loadedModelErrors[createdModelId] = true
          return
        }

        // Check the latest assistant message for errors
        const latestMessage = assistantMessages[assistantMessages.length - 1]
        if (latestMessage) {
          // Check if message content is an error message
          if (isErrorMessage(latestMessage.content)) {
            loadedModelErrors[createdModelId] = true
            return
          }

          // Also check success field from stored messages if available (from API)
          const modelStoredMessages =
            conversationData?.messages?.filter(
              msg =>
                msg.role === 'assistant' && msg.model_id && String(msg.model_id) === String(modelId)
            ) || []
          if (modelStoredMessages.length > 0) {
            const latestStoredMessage = modelStoredMessages[modelStoredMessages.length - 1]
            // If success field exists and is false, mark as failed
            if (latestStoredMessage.success === false) {
              loadedModelErrors[createdModelId] = true
            }
          }
        }
      })
      setModelErrors(loadedModelErrors)

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
      // Clear "input too long" error when selecting from history
      if (
        error &&
        error.includes('Your input is too long for one or more of the selected models')
      ) {
        setError(null)
      }
      setShowHistoryDropdown(false)
      setIsModelsHidden(true) // Collapse the models section when selecting from history
      collapseAllDropdowns() // Collapse all provider dropdowns when selecting from history

      // Mark that we just loaded from history - this will trigger scrolling to top
      justLoadedFromHistoryRef.current = true

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

  // Listen for anonymous credits reset event from AdminPanel and refresh credit display
  useEffect(() => {
    const handleAnonymousCreditsReset = async () => {
      // Refresh credit balance for anonymous users (history is not affected)
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

      // For anonymous users, reload from localStorage and estimate tokens if missing
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

  // Simple token estimation function (1 token ≈ 4 chars)
  // Used for estimating output tokens when not provided by API
  const estimateTokensSimple = (text: string): number => {
    if (!text || !text.trim()) {
      return 0
    }
    return Math.max(1, Math.ceil(text.length / 4))
  }

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
    // Don't scroll to results if there's an error (e.g., all models failed)
    // The error message scroll will handle centering the error instead
    if (response && !isFollowUpMode && !hasScrolledToResultsRef.current && !error) {
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
  }, [response, isFollowUpMode, error])

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- Initializes on mount; auth changes handled separately

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
      // Clear credit state from anonymous session - authenticated users have separate credit tracking
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
      // Clear credit state from authenticated session - anonymous users have separate credit tracking
      setCreditBalance(null)
      setAnonymousCreditsRemaining(null)
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
        `Your ${tierName} tier allows a maximum of ${maxModelsLimit} models per comparison. Not all available models from ${provider} could be selected.`
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
      const updatedSelectedModels = selectedModels.filter(id => id !== modelId)
      setSelectedModels(updatedSelectedModels)

      // Clear "input too long" error only if all problematic models are deselected
      if (
        error &&
        error.includes('Your input is too long for one or more of the selected models')
      ) {
        // Check if any problematic models are still selected
        if (accurateInputTokens !== null && updatedSelectedModels.length > 0) {
          // Get model info for remaining selected models
          const remainingModelInfo = updatedSelectedModels
            .map(id => {
              for (const providerModels of Object.values(modelsByProvider)) {
                const model = providerModels.find(m => m.id === id)
                if (model && model.max_input_tokens) {
                  return { id, maxInputTokens: model.max_input_tokens }
                }
              }
              return null
            })
            .filter((info): info is { id: string; maxInputTokens: number } => info !== null)

          // Check if any remaining models are still problematic
          const stillHasProblemModels = remainingModelInfo.some(
            m => m.maxInputTokens < accurateInputTokens
          )

          // Only clear error if no problematic models remain
          if (!stillHasProblemModels) {
            setError(null)
          }
        } else {
          // No models selected or no token count, clear error
          setError(null)
        }
      }
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

  // Handle export functionality
  const handleExport = async (format: 'pdf' | 'markdown' | 'json' | 'html') => {
    setShowExportMenu(false)

    // Build export data from current conversations
    const exportData: ComparisonExportData = {
      prompt: getFirstUserMessage()?.content || input || 'Comparison',
      timestamp: new Date().toISOString(),
      conversations: conversations,
      models: Object.fromEntries(
        Object.values(modelsByProvider)
          .flat()
          .map(model => [model.id, model])
      ),
      metadata: response?.metadata,
    }

    try {
      if (format === 'pdf') {
        const notification = showNotification('Generating PDF...', 'success')
        notification.setIcon(
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
        )
        await exportToPDF(exportData)
        showNotification('PDF downloaded successfully!', 'success')
      } else if (format === 'markdown') {
        downloadMarkdown(exportData)
        showNotification('Markdown downloaded successfully!', 'success')
      } else if (format === 'json') {
        downloadJSON(exportData)
        showNotification('JSON downloaded successfully!', 'success')
      } else if (format === 'html') {
        downloadHTML(exportData)
        showNotification('HTML downloaded successfully!', 'success')
      }
    } catch (err) {
      console.error('Export error:', err)
      showNotification('Failed to export. Please try again.', 'error')
    }
  }

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false)
      }
    }

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExportMenu])

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
        // Anonymous users: create breakout in localStorage
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

    // Check if user has credits before submitting
    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'
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
      if (tierName === 'anonymous' || tierName === 'free') {
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

    // Check input tokens against selected models' limits (token-based validation)
    if (selectedModels.length > 0) {
      // Get model info with token limits
      const modelInfo = selectedModels
        .map(modelId => {
          // Find model in modelsByProvider
          for (const providerModels of Object.values(modelsByProvider)) {
            const model = providerModels.find(m => m.id === modelId)
            if (model && model.max_input_tokens) {
              return { id: modelId, name: model.name, maxInputTokens: model.max_input_tokens }
            }
          }
          return null
        })
        .filter(
          (info): info is { id: string; name: string; maxInputTokens: number } => info !== null
        )

      if (modelInfo.length > 0) {
        const minMaxInputTokens = Math.min(...modelInfo.map(m => m.maxInputTokens))

        // Use accurate token count if available (from ComparisonForm), otherwise validate on submit
        if (accurateInputTokens !== null && accurateInputTokens > minMaxInputTokens) {
          // Find problem models (those with max_input_tokens < accurateInputTokens)
          const problemModels = modelInfo
            .filter(m => m.maxInputTokens < accurateInputTokens)
            .map(m => m.name)

          // Convert tokens to approximate characters for user-friendly error message
          const approxMaxChars = minMaxInputTokens * 4
          const approxInputChars = accurateInputTokens * 4

          const problemModelsText =
            problemModels.length > 0 ? ` Problem model(s): ${problemModels.join(', ')}.` : ''

          setError(
            `Your input is too long for one or more of the selected models. The maximum input length is approximately ${formatNumber(approxMaxChars)} characters, but your input is approximately ${formatNumber(approxInputChars)} characters.${problemModelsText} Please shorten your input or select different models that support longer inputs.`
          )
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        // If accurateInputTokens not available yet, backend will validate on submit
      }
    }

    // Check credit balance before submitting
    // Credit blocking removed - comparisons proceed regardless of credit balance
    // Credits will be capped at allocated amount during deduction if needed

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
      // Clear already broken out models for new comparison
      setAlreadyBrokenOutModels(new Set())

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
    // with model_id tags so the backend can filter per-model histories.
    // Each model will receive: all user messages + only its own assistant messages
    // IMPORTANT: Expand file placeholders in user messages so models can see file content in history
    let apiConversationHistory: Array<{
      role: 'user' | 'assistant'
      content: string
      model_id?: string
    }> = []

    if (isFollowUpMode && conversations.length > 0) {
      // Filter out failed models from selectedModels for follow-up requests
      // Failed models should not participate in follow-up conversations
      const successfulSelectedModels = getSuccessfulModels(selectedModels)

      // Get all conversations for successful selected models, excluding failed models
      const selectedConversations = conversations.filter(conv => {
        // Must be in successful selected models (failed models already filtered out)
        if (!successfulSelectedModels.includes(conv.modelId)) return false

        // Double-check using helper function (should already be filtered, but be safe)
        if (isModelFailed(conv.modelId)) {
          return false // Exclude failed models
        }

        return true
      })

      if (selectedConversations.length > 0) {
        // Collect all messages from all selected conversations
        const allMessages: Array<{
          role: 'user' | 'assistant'
          content: string
          model_id?: string
          timestamp: string
        }> = []

        // Collect all messages with their timestamps
        selectedConversations.forEach(conv => {
          conv.messages.forEach(msg => {
            allMessages.push({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content,
              model_id: msg.type === 'assistant' ? conv.modelId : undefined, // Include model_id for assistant messages
              timestamp: msg.timestamp,
            })
          })
        })

        // Deduplicate user messages (same content and timestamp within 1 second)
        const seenUserMessages = new Set<string>()
        const deduplicatedMessages: typeof allMessages = []

        // Sort all messages by timestamp to maintain chronological order
        const sortedMessages = [...allMessages].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )

        sortedMessages.forEach(msg => {
          if (msg.role === 'user') {
            // Deduplicate user messages
            const key = `${msg.content}-${Math.floor(new Date(msg.timestamp).getTime() / 1000)}`
            if (!seenUserMessages.has(key)) {
              seenUserMessages.add(key)
              deduplicatedMessages.push(msg)
            }
          } else {
            // Always include assistant messages (they're already per-model)
            deduplicatedMessages.push(msg)
          }
        })

        // Expand file placeholders in user messages using stored file contents
        // This ensures models can see file content in conversation history for follow-ups
        const expandedMessages = await Promise.all(
          deduplicatedMessages.map(async msg => {
            if (msg.role === 'user' && attachedFiles.length > 0) {
              // Check if message contains file placeholders
              const hasPlaceholder = attachedFiles.some(f => msg.content.includes(f.placeholder))
              if (hasPlaceholder) {
                // Expand placeholders using stored file contents
                const expandedContent = await expandFiles(attachedFiles, msg.content)
                return {
                  role: msg.role,
                  content: expandedContent,
                  model_id: msg.model_id,
                }
              }
            }
            // Return message as-is (assistant messages or user messages without placeholders)
            return {
              role: msg.role,
              content: msg.content,
              model_id: msg.model_id,
            }
          })
        )

        apiConversationHistory = expandedMessages
      }
    }

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
    hasScrolledToResultsOnFirstChunkRef.current = false // Reset scroll tracking for first chunk
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

    // Timeout configuration
    const TIMEOUT_DURATION = 60000 // 1 minute - actual timeout duration
    const ACTIVE_STREAMING_WINDOW = 5000 // 5 seconds - window to determine if model is actively streaming

    // Declare streaming variables outside try block so they're accessible in catch block for timeout handling
    const streamingResults: { [key: string]: string } = {}
    const completedModels = new Set<string>() // Track which models have finished
    const localModelErrors: { [key: string]: boolean } = {} // Track which models have errors (local during streaming)
    const modelStartTimes: { [key: string]: string } = {} // Track when each model starts
    const modelCompletionTimes: { [key: string]: string } = {} // Track when each model completes
    let streamingMetadata: CompareResponse['metadata'] | null = null

    // Track timeout state for streaming (declared outside try block for access in catch/finally)
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const modelLastChunkTimes: { [key: string]: number } = {} // Track when each model last received a chunk

    try {
      const controller = new AbortController()
      setCurrentAbortController(controller)

      // Use streaming endpoint for faster perceived response time
      // Include conversation_id if available (for authenticated users) to ensure correct conversation matching
      const conversationId =
        isAuthenticated && currentVisibleComparisonId
          ? typeof currentVisibleComparisonId === 'string'
            ? parseInt(currentVisibleComparisonId, 10)
            : currentVisibleComparisonId
          : null

      // Timeout function: timer only runs when there's no streaming activity
      // Rules:
      // 1. If no models respond at all for a minute, show error message
      // 2. While any model is streaming, timer is at 0 and is not started
      // 3. If all models have not completed and streaming stops on all incomplete models, start the 1 minute timer
      // 4. If any model resumes streaming, set the timer back to 0
      const resetStreamingTimeout = () => {
        // Clear existing timeout
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        // Safety check: ensure selectedModels is valid
        if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
          return
        }

        const now = Date.now()

        // Check if any models are actively streaming (have received chunks recently and not completed)
        // Use a short window (ACTIVE_STREAMING_WINDOW) to determine if model is currently streaming
        // Note: event.model from backend uses raw model ID format, same as selectedModels
        const hasActiveStreaming = selectedModels.some(modelId => {
          if (!modelId || completedModels.has(modelId)) return false
          // Check both raw model ID and formatted model ID to handle any format differences
          const lastChunkTime =
            modelLastChunkTimes[modelId] || modelLastChunkTimes[createModelId(modelId)]
          // Model is actively streaming if it has received a chunk within the active streaming window
          return lastChunkTime !== undefined && now - lastChunkTime < ACTIVE_STREAMING_WINDOW
        })

        // Check if all models are completed
        const allModelsCompleted = completedModels.size === selectedModels.length

        // If all models are completed, no need for timeout
        if (allModelsCompleted) {
          return
        }

        // If there's active streaming, don't set timeout (timer is not running during activity)
        if (hasActiveStreaming) {
          return
        }

        // No streaming activity and there are unfinished models - start 1 minute timer
        timeoutId = setTimeout(() => {
          try {
            // Safety check: ensure selectedModels is still valid
            if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
              return
            }

            const checkNow = Date.now()
            // Check again if any models are actively streaming (using the short window)
            // Note: event.model from backend uses raw model ID format, same as selectedModels
            const stillHasActiveStreaming = selectedModels.some(modelId => {
              if (!modelId || completedModels.has(modelId)) return false
              // Check both raw model ID and formatted model ID to handle any format differences
              const lastChunkTime =
                modelLastChunkTimes[modelId] || modelLastChunkTimes[createModelId(modelId)]
              // Model is actively streaming if it has received a chunk within the active streaming window
              return (
                lastChunkTime !== undefined && checkNow - lastChunkTime < ACTIVE_STREAMING_WINDOW
              )
            })

            const allModelsCompletedNow = completedModels.size === selectedModels.length

            if (allModelsCompletedNow) {
              // All models completed - no need to abort
              return
            }

            if (stillHasActiveStreaming) {
              // Activity detected - reset timer (this handles case where model resumes streaming)
              resetStreamingTimeout()
            } else {
              // No activity and unfinished models - timeout
              controller.abort()
            }
          } catch (error) {
            // Catch any errors in timeout callback to prevent white screen
            console.error('Error in streaming timeout callback:', error)
            // Still abort on error to prevent hanging
            controller.abort()
          }
        }, TIMEOUT_DURATION)
      }

      // Start initial timeout (will be reset when first chunk arrives)
      resetStreamingTimeout()

      // Expand file contents before submission
      let expandedInput = input
      if (attachedFiles.length > 0) {
        try {
          expandedInput = await expandFiles(attachedFiles, input)
        } catch (error) {
          console.error('Error expanding files:', error)
          setError('Failed to process attached files. Please try again.')
          setIsLoading(false)
          return
        }
      }

      // Store the expanded input for later use in history matching
      lastSubmittedInputRef.current = expandedInput

      // Use service for streaming request
      // Include accurate token count from frontend if available (avoids duplicate calculation on backend)
      // Include timezone for credit reset timing (auto-detect from browser)
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      // For follow-ups, filter out failed models - they should not participate
      const modelsToUse = isFollowUpMode ? getSuccessfulModels(selectedModels) : selectedModels

      const stream = await compareStream(
        {
          input_data: expandedInput, // Use expanded input with file contents
          models: modelsToUse,
          conversation_history: apiConversationHistory,
          browser_fingerprint: browserFingerprint,
          conversation_id: conversationId || undefined, // Only include if not null
          estimated_input_tokens: accurateInputTokens || undefined, // Include accurate count if available
          timezone: userTimezone, // Auto-detect timezone from browser
          location: userLocation || undefined, // User-provided location (browser geolocation) - most accurate
          enable_web_search: webSearchEnabled || false, // Enable web search if toggle is on
        },
        controller.signal
      )

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

      // Track if we received an error event (but continue processing to save partial results)
      let streamError: Error | null = null

      if (reader) {
        try {
          let buffer = ''

          while (true) {
            // Check if request was cancelled - stop processing immediately
            if (controller.signal.aborted || userCancelledRef.current) {
              // Cancel the reader to stop the stream
              reader.cancel()
              break
            }

            const { done, value } = await reader.read()

            if (done) break

            // If we already have an error, stop processing new chunks but continue to save what we have
            if (streamError) {
              break
            }

            // Check cancellation again after read (in case it was cancelled during the read)
            if (controller.signal.aborted || userCancelledRef.current) {
              reader.cancel()
              break
            }

            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true })

            // Reset timeout when we receive any data (indicates active streaming)
            resetStreamingTimeout()

            // Process complete SSE messages (separated by \n\n)
            const messages = buffer.split('\n\n')
            buffer = messages.pop() || '' // Keep incomplete message in buffer

            let shouldUpdate = false

            for (const message of messages) {
              // Check cancellation before processing each message
              if (controller.signal.aborted || userCancelledRef.current) {
                reader.cancel()
                break
              }

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
                  // Update per-model chunk time to track which models are actively streaming
                  modelLastChunkTimes[event.model] = Date.now()
                  resetStreamingTimeout() // Reset timeout since this model is actively streaming
                  shouldUpdate = true

                  // Scroll to Comparison Results section on first chunk from first model
                  if (!hasScrolledToResultsOnFirstChunkRef.current) {
                    hasScrolledToResultsOnFirstChunkRef.current = true
                    // Use requestAnimationFrame and a small delay to ensure DOM is ready
                    requestAnimationFrame(() => {
                      setTimeout(() => {
                        const resultsSection = document.querySelector('.results-section')
                        if (resultsSection) {
                          resultsSection.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          })
                        }
                      }, 100) // Small delay to ensure section is rendered
                    })
                  }

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
                } else if (event.type === 'keepalive') {
                  // Keepalive event - reset timeout but don't add to content
                  // This prevents timeout during long operations (like web search) without
                  // incrementing the character counter
                  if (event.model) {
                    modelLastChunkTimes[event.model] = Date.now()
                    resetStreamingTimeout()
                    // Don't set shouldUpdate - no UI change needed for keepalive
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

                  // Reset timeout when a model completes - this recalculates timeout based on remaining active models
                  resetStreamingTimeout()

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

                    // Refresh credits when all models complete (in case "complete" event isn't received)
                    // This ensures credits are updated even if the stream is aborted before "complete" event
                    // Check if any models completed successfully (not just the last one)
                    const hasSuccessfulModels = selectedModels.some(modelId => {
                      const createdModelId = createModelId(modelId)
                      const hasCompleted = completedModels.has(createdModelId)
                      const hasError = localModelErrors[createdModelId] === true
                      const content = streamingResults[createdModelId] || ''
                      const isError = isErrorMessage(content)
                      return hasCompleted && !hasError && !isError && content.trim().length > 0
                    })

                    if (hasSuccessfulModels) {
                      // Refresh credit balance when all models complete and at least one was successful
                      // Use a small delay to ensure backend has finished processing
                      setTimeout(() => {
                        if (isAuthenticated) {
                          // For authenticated users, refresh user data and credit balance
                          refreshUser()
                            .then(() => getCreditBalance())
                            .then(balance => {
                              setCreditBalance(balance)
                            })
                            .catch(error =>
                              console.error(
                                'Failed to refresh authenticated credit balance after all models completed:',
                                error
                              )
                            )
                        } else {
                          // For anonymous users, ONLY refresh if we haven't already received valid credits from 'complete' event
                          // The 'complete' event provides the most accurate credits_remaining value calculated right after deduction
                          // This fallback refresh is only needed if the stream was aborted before 'complete' event arrived
                          if (
                            streamingMetadata?.credits_remaining === undefined ||
                            streamingMetadata?.credits_remaining === null
                          ) {
                            getCreditBalance(browserFingerprint)
                              .then(balance => {
                                setAnonymousCreditsRemaining(balance.credits_remaining)
                                setCreditBalance(balance)
                              })
                              .catch(error =>
                                console.error(
                                  'Failed to refresh anonymous credit balance after all models completed:',
                                  error
                                )
                              )
                          }
                          // If streamingMetadata has credits_remaining, the 'complete' event handler already updated credits
                        }
                      }, 500) // Small delay to ensure backend has processed all completions
                    }
                  }
                } else if (event.type === 'complete') {
                  // All models complete - save metadata
                  streamingMetadata = event.metadata
                  const endTime = Date.now()
                  setProcessingTime(endTime - startTime)
                  shouldUpdate = true

                  // Refresh credit balance if credits were used OR if credits_remaining is provided
                  // Check for credits_remaining first (more reliable indicator)
                  if (
                    streamingMetadata?.credits_remaining !== undefined ||
                    streamingMetadata?.credits_used !== undefined
                  ) {
                    if (isAuthenticated) {
                      // Use credits_remaining from metadata for immediate update (like anonymous users)
                      if (streamingMetadata.credits_remaining !== undefined) {
                        // Update creditBalance immediately with metadata value
                        if (creditBalance) {
                          setCreditBalance({
                            ...creditBalance,
                            credits_remaining: streamingMetadata.credits_remaining,
                            credits_used_this_period:
                              creditBalance.credits_allocated - streamingMetadata.credits_remaining,
                          })
                        } else if (user) {
                          // If creditBalance is not yet loaded, create a temporary one from user data
                          const allocated =
                            user.monthly_credits_allocated ||
                            getCreditAllocation(user.subscription_tier || 'free')
                          setCreditBalance({
                            credits_allocated: allocated,
                            credits_used_this_period:
                              allocated - streamingMetadata.credits_remaining,
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
                          const remainingPercent =
                            balance.credits_allocated > 0
                              ? (balance.credits_remaining / balance.credits_allocated) * 100
                              : 100
                          const periodType =
                            userTier === 'anonymous' || userTier === 'free' ? 'daily' : 'monthly'
                          const lowCreditThreshold =
                            userTier === 'anonymous' || userTier === 'free' ? 20 : 10

                          if (balance.credits_remaining <= 0) {
                            // Exit follow-up mode when credits run out
                            if (isFollowUpMode) {
                              setIsFollowUpMode(false)
                            }
                            // Don't set creditWarningMessage here - let the useEffect handle it via setError
                            // This prevents duplicate error messages
                            // The useEffect will set the error message, which is displayed in the same place
                          } else if (
                            remainingPercent <= lowCreditThreshold &&
                            remainingPercent > 0
                          ) {
                            if (
                              !isLowCreditWarningDismissed(
                                userTier,
                                periodType,
                                balance.credits_reset_at
                              )
                            ) {
                              const message = getCreditWarningMessage(
                                'low',
                                userTier,
                                balance.credits_remaining,
                                undefined,
                                balance.credits_reset_at
                              )
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
                        .catch(error =>
                          console.error('Failed to refresh user credit balance:', error)
                        )
                    } else {
                      // For anonymous users, refresh credit balance from API
                      // Use credits_remaining from metadata for immediate update (most accurate - calculated right after deduction)
                      if (streamingMetadata.credits_remaining !== undefined) {
                        const metadataCreditsRemaining = streamingMetadata.credits_remaining
                        // Update anonymousCreditsRemaining state immediately - this is the primary source for anonymous users
                        setAnonymousCreditsRemaining(metadataCreditsRemaining)

                        // Update creditBalance immediately with metadata value to keep them in sync
                        const allocated =
                          creditBalance?.credits_allocated ?? getDailyCreditLimit('anonymous')
                        setCreditBalance({
                          credits_allocated: allocated,
                          credits_used_today: allocated - metadataCreditsRemaining,
                          credits_remaining: metadataCreditsRemaining,
                          period_type: 'daily',
                          subscription_tier: 'anonymous',
                        })

                        const remainingPercent =
                          allocated > 0 ? (metadataCreditsRemaining / allocated) * 100 : 100
                        // Update credit warnings based on new balance
                        const userTier = 'anonymous'
                        const periodType = 'daily'
                        const lowCreditThreshold = 20

                        if (metadataCreditsRemaining <= 0) {
                          // Exit follow-up mode when credits run out
                          if (isFollowUpMode) {
                            setIsFollowUpMode(false)
                          }
                          // Don't set creditWarningMessage here - let the useEffect handle it via setError
                          // This prevents duplicate error messages
                          // The useEffect will set the error message, which is displayed in the same place
                        } else if (remainingPercent <= lowCreditThreshold && remainingPercent > 0) {
                          if (!isLowCreditWarningDismissed(userTier, periodType)) {
                            const message = getCreditWarningMessage(
                              'low',
                              userTier,
                              metadataCreditsRemaining
                            )
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
                            if (
                              Math.abs(balance.credits_remaining - metadataCreditsRemaining) <= 1
                            ) {
                              setCreditBalance({
                                ...balance,
                                credits_remaining: metadataCreditsRemaining, // Keep metadata value
                              })
                            }
                          })
                          .catch(error =>
                            console.error('Failed to refresh anonymous credit balance:', error)
                          )
                      } else {
                        // Fallback: get from API if metadata not available
                        getCreditBalance(browserFingerprint)
                          .then(balance => {
                            setAnonymousCreditsRemaining(balance.credits_remaining)
                            setCreditBalance(balance)
                            // Update credit warnings based on new balance
                            const userTier = 'anonymous'
                            const periodType = 'daily'
                            const remainingPercent =
                              balance.credits_allocated > 0
                                ? (balance.credits_remaining / balance.credits_allocated) * 100
                                : 100
                            const lowCreditThreshold = 20

                            if (balance.credits_remaining <= 0) {
                              // Exit follow-up mode when credits run out
                              if (isFollowUpMode) {
                                setIsFollowUpMode(false)
                              }
                              // Don't set creditWarningMessage here - let the useEffect handle it via setError
                              // This prevents duplicate error messages
                              // The useEffect will set the error message, which is displayed in the same place
                            } else if (
                              remainingPercent <= lowCreditThreshold &&
                              remainingPercent > 0
                            ) {
                              if (!isLowCreditWarningDismissed(userTier, periodType)) {
                                const message = getCreditWarningMessage(
                                  'low',
                                  userTier,
                                  balance.credits_remaining
                                )
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
                          .catch(error =>
                            console.error('Failed to refresh anonymous credit balance:', error)
                          )
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
                  // Store error but don't throw immediately - allow partial results to be saved
                  streamError = new Error(event.message || 'Streaming error occurred')
                  console.error('Streaming error received:', streamError.message)
                  // Mark all incomplete models as failed
                  selectedModels.forEach(modelId => {
                    const createdModelId = createModelId(modelId)
                    if (!completedModels.has(createdModelId)) {
                      localModelErrors[createdModelId] = true
                      setModelErrors(prev => ({ ...prev, [createdModelId]: true }))
                    }
                  })
                  // Break out of message processing loop, but continue to save partial results
                  break
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
                // This check happens first to prevent any card scrolling when page scroll is detected
                // Note: We don't modify autoScrollPausedRef here - that's only for individual card pauses
                // Page scrolling pause is temporary and handled by this check alone
                if (isPageScrollingRef.current) {
                  return
                }

                Object.keys(streamingResults).forEach(modelId => {
                  // Skip auto-scrolling for completed models so users can scroll through them
                  if (completedModels.has(modelId)) return

                  // Skip auto-scrolling if user has manually scrolled away from bottom within this card
                  // Use REF for immediate check without state update delay
                  if (autoScrollPausedRef.current.has(modelId)) return

                  const safeId = modelId.replace(/[^a-zA-Z0-9_-]/g, '-')
                  const conversationContent = document.querySelector(
                    `#conversation-content-${safeId}`
                  ) as HTMLElement
                  if (conversationContent) {
                    // Check again if page scrolling started during this frame
                    // This provides an extra safety check
                    if (isPageScrollingRef.current) return

                    // Use scrollTop assignment without triggering events that interfere with page scroll
                    // This direct assignment is less likely to interfere with page scrolling
                    conversationContent.scrollTop = conversationContent.scrollHeight
                  }
                })
              })
            }
          }

          // Clean up timeout since stream completed (or errored)
          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }

          // If we received an error event, handle it gracefully
          if (streamError) {
            // Mark incomplete models as failed
            const errorModelErrors: { [key: string]: boolean } = { ...localModelErrors }
            selectedModels.forEach(modelId => {
              const createdModelId = createModelId(modelId)
              if (!completedModels.has(createdModelId)) {
                errorModelErrors[createdModelId] = true
              }
            })
            setModelErrors(errorModelErrors)

            // Show error message but don't crash - partial results are still valuable
            setError(`Streaming error: ${streamError.message}. Partial results have been saved.`)
            // Clear error after 10 seconds
            setTimeout(() => {
              setError(null)
            }, 10000)
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
                      // Include output_tokens for token usage calculation
                      return {
                        ...msg,
                        content,
                        timestamp: completionTime || msg.timestamp,
                        output_tokens: msg.output_tokens || estimateTokensSimple(content),
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
                // Estimate output tokens for the assistant message
                const outputTokens = estimateTokensSimple(content)

                // Check if we already added the new user message
                const hasNewUserMessage = conv.messages.some(
                  (msg, idx) =>
                    msg.type === 'user' && msg.content === input && idx >= conv.messages.length - 2 // Check last 2 messages (user + assistant)
                )

                if (!hasNewUserMessage) {
                  // Add user message and assistant message if they weren't added during streaming
                  const startTime = modelStartTimes[conv.modelId]
                  const assistantMessage = createMessage(
                    'assistant',
                    content,
                    completionTime || new Date().toISOString()
                  )
                  // Add output_tokens to assistant message for token usage calculation
                  assistantMessage.output_tokens = outputTokens

                  return {
                    ...conv,
                    messages: [
                      ...conv.messages,
                      createMessage('user', input, startTime || userTimestamp),
                      assistantMessage,
                    ],
                  }
                } else {
                  // Update the last assistant message with final content, timestamp, and output_tokens
                  return {
                    ...conv,
                    messages: conv.messages.map((msg, idx) => {
                      if (idx === conv.messages.length - 1 && msg.type === 'assistant') {
                        return {
                          ...msg,
                          content: content || msg.content, // Ensure content is set
                          timestamp: completionTime || msg.timestamp,
                          // Always update output_tokens with estimated tokens for the new response
                          // This ensures token usage indicator updates immediately after streaming completes
                          output_tokens: outputTokens,
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
                    // Extract file contents for storage if attachedFiles contains AttachedFile objects
                    let fileContentsForSave: Array<{
                      name: string
                      content: string
                      placeholder: string
                    }> = []
                    const attachedFilesToExtract = attachedFiles.filter(
                      (f): f is AttachedFile => 'file' in f
                    )
                    if (attachedFilesToExtract.length > 0) {
                      // Extract from File objects
                      extractFileContentForStorage(attachedFilesToExtract).then(extracted => {
                        fileContentsForSave = extracted
                      })
                    } else {
                      // Use stored content from StoredAttachedFile objects
                      const storedFiles = attachedFiles.filter(
                        (f): f is StoredAttachedFile => 'content' in f
                      )
                      fileContentsForSave = storedFiles.map(f => ({
                        name: f.name,
                        content: f.content,
                        placeholder: f.placeholder,
                      }))
                    }
                    // Always save the conversation - saveConversationToLocalStorage handles the 2-conversation limit
                    // by keeping only the 2 most recent conversations
                    const savedId = saveConversationToLocalStorage(
                      inputData,
                      selectedModels,
                      conversationsWithMessages,
                      false,
                      fileContentsForSave
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
            // Use a shorter delay since syncHistoryAfterComparison has retry logic
            setTimeout(async () => {
              // Use the expanded input that was actually sent to the backend for matching
              // This ensures we match against exactly what was stored in the database
              const inputToMatch =
                lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
              if (inputToMatch) {
                await syncHistoryAfterComparison(inputToMatch, selectedModels)
              }
            }, 500) // Initial delay - syncHistoryAfterComparison will retry if needed
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
                    // Extract file contents for storage if attachedFiles contains AttachedFile objects
                    ;(async () => {
                      let fileContentsForSave: Array<{
                        name: string
                        content: string
                        placeholder: string
                      }> = []
                      const attachedFilesToExtract = attachedFiles.filter(
                        (f): f is AttachedFile => 'file' in f
                      )
                      if (attachedFilesToExtract.length > 0) {
                        // Extract from File objects (async)
                        fileContentsForSave =
                          await extractFileContentForStorage(attachedFilesToExtract)
                      } else {
                        // Use stored content from StoredAttachedFile objects (synchronous)
                        const storedFiles = attachedFiles.filter(
                          (f): f is StoredAttachedFile => 'content' in f
                        )
                        fileContentsForSave = storedFiles.map(f => ({
                          name: f.name,
                          content: f.content,
                          placeholder: f.placeholder,
                        }))
                      }
                      // Update existing conversation (isUpdate = true)
                      const savedId = saveConversationToLocalStorage(
                        inputData,
                        selectedModels,
                        conversationsWithMessages,
                        true,
                        fileContentsForSave
                      )
                      // Set currentVisibleComparisonId to the saved comparison ID so it shows as active in the dropdown
                      // This allows users to see their saved comparison highlighted in the dropdown right after streaming completes
                      if (savedId) {
                        setCurrentVisibleComparisonId(savedId)
                      }
                    })()
                  }
                }

                return currentConversations // Return unchanged
              })
            }, 200)
          } else if (isAuthenticated && isFollowUpMode) {
            // For registered users, reload history from API after follow-up completes
            // Backend already saved the conversation update, we just need to refresh the list
            // Use a shorter delay since syncHistoryAfterComparison has retry logic
            setTimeout(async () => {
              // Use the expanded input that was actually sent to the backend for matching
              // This ensures we match against exactly what was stored in the database
              const inputToMatch =
                lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
              if (inputToMatch) {
                await syncHistoryAfterComparison(inputToMatch, selectedModels)
              }
            }, 500) // Initial delay - syncHistoryAfterComparison will retry if needed
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
      // Helper function to save partial results when an error occurs
      const savePartialResultsOnError = () => {
        // Ensure we have at least some results before trying to save
        const hasAnyResults = Object.keys(streamingResults).some(
          modelId => (streamingResults[modelId] || '').trim().length > 0
        )

        if (!hasAnyResults) {
          return // No results to save
        }

        // Mark incomplete models as failed
        // Note: event.model uses raw model ID format (same as selectedModels)
        const errorModelErrors: { [key: string]: boolean } = { ...(localModelErrors || {}) }
        if (selectedModels && Array.isArray(selectedModels)) {
          selectedModels.forEach(modelId => {
            try {
              const rawModelId = modelId
              const formattedModelId = createModelId(modelId)
              // Check both formats - if model hasn't completed in either format, mark as failed
              if (!completedModels.has(rawModelId) && !completedModels.has(formattedModelId)) {
                errorModelErrors[rawModelId] = true
                errorModelErrors[formattedModelId] = true
              }
            } catch (error) {
              console.error('Error processing model in savePartialResultsOnError:', error)
            }
          })
        }
        setModelErrors(errorModelErrors)

        // Update response with partial results
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

        // Update conversations with partial results
        if (!isFollowUpMode) {
          setConversations(prevConversations => {
            return prevConversations.map(conv => {
              // conv.modelId is already formatted (from createModelId)
              // Find the raw model ID to look up streaming results
              const rawModelId =
                selectedModels && Array.isArray(selectedModels)
                  ? selectedModels.find(m => createModelId(m) === conv.modelId) || conv.modelId
                  : conv.modelId
              const content =
                (streamingResults &&
                  (streamingResults[rawModelId] || streamingResults[conv.modelId])) ||
                ''
              const startTime =
                (modelStartTimes &&
                  (modelStartTimes[rawModelId] || modelStartTimes[conv.modelId])) ||
                undefined
              const completionTime =
                (modelCompletionTimes &&
                  (modelCompletionTimes[rawModelId] || modelCompletionTimes[conv.modelId])) ||
                undefined

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

        // Save to history (same logic as in finally block)
        setTimeout(() => {
          if (!isAuthenticated && !isFollowUpMode) {
            setConversations(currentConversations => {
              const conversationsWithMessages = currentConversations.filter(
                conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
              )

              const hasCompleteMessages = conversationsWithMessages.some(conv => {
                const assistantMessages = conv.messages.filter(msg => msg.type === 'assistant')
                return (
                  assistantMessages.length > 0 &&
                  assistantMessages.some(msg => msg.content.trim().length > 0)
                )
              })

              if (hasCompleteMessages && conversationsWithMessages.length > 0) {
                const allUserMessages = conversationsWithMessages
                  .flatMap(conv => conv.messages)
                  .filter(msg => msg.type === 'user')
                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

                const firstUserMessage = allUserMessages[0]

                if (firstUserMessage) {
                  const inputData = firstUserMessage.content
                  // Extract file contents for storage if attachedFiles contains AttachedFile objects
                  ;(async () => {
                    let fileContentsForSave: Array<{
                      name: string
                      content: string
                      placeholder: string
                    }> = []
                    const attachedFilesToExtract = attachedFiles.filter(
                      (f): f is AttachedFile => 'file' in f && f.file instanceof File
                    )
                    if (attachedFilesToExtract.length > 0) {
                      // Extract from File objects (async)
                      fileContentsForSave =
                        await extractFileContentForStorage(attachedFilesToExtract)
                    } else {
                      // Use stored content from StoredAttachedFile objects (synchronous)
                      const storedFiles = attachedFiles.filter(
                        (f): f is StoredAttachedFile => 'content' in f && !('file' in f)
                      )
                      fileContentsForSave = storedFiles.map(f => ({
                        name: f.name,
                        content: f.content,
                        placeholder: f.placeholder,
                      }))
                    }
                    const savedId = saveConversationToLocalStorage(
                      inputData,
                      selectedModels,
                      conversationsWithMessages,
                      false,
                      fileContentsForSave
                    )
                    if (savedId) {
                      setCurrentVisibleComparisonId(savedId)
                    }
                  })()
                }
              }

              return currentConversations
            })
          } else if (isAuthenticated && !isFollowUpMode) {
            // For registered users, reload history from API
            // Use a shorter delay since syncHistoryAfterComparison has retry logic
            setTimeout(async () => {
              // Use the expanded input that was actually sent to the backend for matching
              // This ensures we match against exactly what was stored in the database
              const inputToMatch =
                lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
              if (inputToMatch) {
                await syncHistoryAfterComparison(inputToMatch, selectedModels)
              }
            }, 500) // Initial delay - syncHistoryAfterComparison will retry if needed
          }
        }, 200)
      }

      // Handle cancellation errors (both AbortError from fetch and CancellationError from API client)
      if (
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'CancellationError')
      ) {
        // Check if this was a user cancellation (not a timeout)
        if (userCancelledRef.current) {
          // User cancelled - show cancellation message
          setError('Model comparison cancelled by user.')
          return
        }

        // Handle timeout: mark incomplete models as failed and format successful ones
        // Note: event.model uses raw model ID format (same as selectedModels)
        // Add safety checks to prevent crashes
        if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
          setError('Request timed out after 1 minute of inactivity.')
          return
        }

        const timeoutModelErrors: { [key: string]: boolean } = { ...(localModelErrors || {}) }
        selectedModels.forEach(modelId => {
          try {
            // Check both raw and formatted model ID formats for consistency
            const rawModelId = modelId
            const formattedModelId = createModelId(modelId)
            // If model hasn't completed, it should be marked as failed (timeout = failure)
            // This handles cases where response was cut short with partial content
            if (!completedModels.has(rawModelId) && !completedModels.has(formattedModelId)) {
              // Store error for both formats to ensure consistency
              timeoutModelErrors[rawModelId] = true
              timeoutModelErrors[formattedModelId] = true
            }
          } catch (error) {
            console.error('Error processing model in timeout handler:', error)
          }
        })
        setModelErrors(timeoutModelErrors)

        // Switch successful models to formatted view even on timeout
        const formattedTabs: ActiveResultTabs = {} as ActiveResultTabs
        selectedModels.forEach(modelId => {
          try {
            const rawModelId = modelId
            const formattedModelId = createModelId(modelId)
            // Check both formats for content
            const content =
              (streamingResults &&
                (streamingResults[rawModelId] || streamingResults[formattedModelId])) ||
              ''
            const hasError =
              timeoutModelErrors[rawModelId] === true ||
              timeoutModelErrors[formattedModelId] === true ||
              isErrorMessage(content)
            if (!hasError && content.trim().length > 0) {
              formattedTabs[formattedModelId] = RESULT_TAB.FORMATTED
            }
          } catch (error) {
            console.error('Error formatting model tab:', error)
          }
        })
        setActiveResultTabs(prev => ({ ...prev, ...formattedTabs }))

        // Final state update for conversations with timeout handling
        if (!isFollowUpMode) {
          setConversations(prevConversations => {
            return prevConversations.map(conv => {
              // conv.modelId is already formatted (from createModelId)
              const rawModelId =
                selectedModels.find(m => createModelId(m) === conv.modelId) || conv.modelId
              const content = streamingResults[rawModelId] || streamingResults[conv.modelId] || ''
              const startTime = modelStartTimes[rawModelId] || modelStartTimes[conv.modelId]
              const completionTime =
                modelCompletionTimes[rawModelId] || modelCompletionTimes[conv.modelId]

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
        // Note: event.model uses raw model ID format (same as selectedModels)
        // Add safety checks to prevent crashes
        const successfulModelsCount = (
          selectedModels && Array.isArray(selectedModels) ? selectedModels : []
        ).filter(modelId => {
          try {
            const rawModelId = modelId
            const formattedModelId = createModelId(modelId)
            // Check both formats for completion
            const hasCompleted =
              completedModels.has(rawModelId) || completedModels.has(formattedModelId)
            const hasError =
              (timeoutModelErrors &&
                (timeoutModelErrors[rawModelId] === true ||
                  timeoutModelErrors[formattedModelId] === true)) ||
              false
            // Check both formats for content
            const content =
              (streamingResults &&
                (streamingResults[rawModelId] || streamingResults[formattedModelId])) ||
              ''
            const isError = isErrorMessage(content)
            return hasCompleted && !hasError && !isError && content.trim().length > 0
          } catch (error) {
            console.error('Error checking successful model:', error)
            return false
          }
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
              .catch(error =>
                console.error('Failed to refresh credit balance after timeout:', error)
              )
          } else {
            // For anonymous users, refresh credit balance from API
            getCreditBalance(browserFingerprint)
              .then(balance => {
                setAnonymousCreditsRemaining(balance.credits_remaining)
                setCreditBalance(balance)
              })
              .catch(error =>
                console.error('Failed to refresh anonymous credit balance after timeout:', error)
              )
          }
        }

        // Clean up timeout
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        if (userCancelledRef.current) {
          const elapsedTime = Date.now() - startTime
          const elapsedSeconds = (elapsedTime / 1000).toFixed(1)
          setError(`Comparison cancelled by user after ${elapsedSeconds} seconds`)
        } else {
          // Properly count successful, failed, and timed-out models
          // Add safety checks to prevent crashes
          if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
            setError('Request timed out after 1 minute of inactivity.')
            return
          }

          const totalCount = selectedModels.length
          let successfulCount = 0
          let failedCount = 0
          let timedOutCount = 0

          selectedModels.forEach(modelId => {
            try {
              // Check both raw and formatted model ID formats
              const rawModelId = modelId
              const formattedModelId = createModelId(modelId)
              const modelIdToCheck = completedModels.has(rawModelId) ? rawModelId : formattedModelId

              if (completedModels.has(modelIdToCheck)) {
                // Model completed - check if it was successful or failed
                const hasError =
                  (localModelErrors &&
                    (localModelErrors[rawModelId] === true ||
                      localModelErrors[formattedModelId] === true)) ||
                  false
                const content =
                  (streamingResults &&
                    (streamingResults[rawModelId] || streamingResults[formattedModelId])) ||
                  ''
                const isError = hasError || isErrorMessage(content)

                if (isError || content.trim().length === 0) {
                  failedCount++
                } else {
                  successfulCount++
                }
              } else {
                // Model didn't complete - count as timed out
                timedOutCount++
              }
            } catch (modelError) {
              // If there's an error processing a specific model, count it as timed out
              console.error('Error processing model in timeout handler:', modelError)
              timedOutCount++
            }
          })

          let errorMessage: string

          if (successfulCount === 0 && failedCount === 0 && timedOutCount === totalCount) {
            // No models completed - show timeout message
            const modelText = totalCount === 1 ? 'model' : 'models'
            const suggestionText =
              totalCount === 1
                ? 'Please wait a moment and try again.'
                : 'Try selecting fewer models, or wait a moment and try again.'
            errorMessage = `Request timed out after 1 minute with no response (${totalCount} ${modelText}). ${suggestionText}`
          } else {
            // Build detailed error message
            const parts: string[] = []

            if (successfulCount > 0) {
              const text =
                successfulCount === 1
                  ? 'model completed successfully'
                  : 'models completed successfully'
              parts.push(`${successfulCount} ${text}`)
            }

            if (failedCount > 0) {
              const text = failedCount === 1 ? 'model failed' : 'models failed'
              parts.push(`${failedCount} ${text}`)
            }

            if (timedOutCount > 0) {
              const text = timedOutCount === 1 ? 'model timed out' : 'models timed out'
              parts.push(`${timedOutCount} ${text} after 1 minute of inactivity`)
            }

            if (parts.length > 0) {
              errorMessage = parts.join(', ') + '.'
            } else {
              errorMessage = 'Request timed out after 1 minute of inactivity.'
            }
          }

          setError(errorMessage)
        }

        // Save partial results to history even on timeout
        // This ensures history entries are created when credits were used
        try {
          savePartialResultsOnError()
          // Preserve input if all models failed (timeout counts as failure)
          const successfulCount = Object.keys(streamingResults).filter(
            modelId =>
              !isErrorMessage(streamingResults[modelId]) &&
              (streamingResults[modelId] || '').trim().length > 0
          ).length
          // Only clear input if at least one model succeeded before timeout
          if (successfulCount === 0) {
            // Input is preserved - don't clear it so user can retry
          }
        } catch (saveError) {
          console.error('Error saving partial results on timeout:', saveError)
        }
      } else if (err instanceof PaymentRequiredError) {
        // Handle insufficient credits error (402 Payment Required)
        // Exit follow-up mode when user runs out of credits
        if (isFollowUpMode) {
          setIsFollowUpMode(false)
        }
        // Don't show error banner if credit warning banner is already showing (credits are 0)
        if (creditWarningType !== 'none') {
          setError(
            err.message ||
              'Insufficient credits for this request. Please upgrade your plan or wait for credits to reset.'
          )
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (err instanceof ApiError && err.status === 402) {
        // Handle 402 Payment Required (insufficient credits)
        // Exit follow-up mode when user runs out of credits
        if (isFollowUpMode) {
          setIsFollowUpMode(false)
        }
        // Don't show error banner if credit warning banner is already showing (credits are 0)
        if (creditWarningType !== 'none') {
          const errorMessage =
            err.response?.detail || err.message || 'Insufficient credits for this request.'
          setError(errorMessage)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (err instanceof Error && err.message.includes('Failed to fetch')) {
        setError('Unable to connect to the server. Please check if the backend is running.')
        // Save partial results even on connection error
        savePartialResultsOnError()
        // Preserve input if all models failed - input is preserved by default (not cleared)
      } else if (err instanceof Error) {
        setError(err.message || 'An unexpected error occurred')
        // Save partial results even on unexpected error
        savePartialResultsOnError()
        // Preserve input if all models failed - input is preserved by default (not cleared)
      } else {
        setError('An unexpected error occurred')
        // Save partial results even on unknown error
        savePartialResultsOnError()
        // Preserve input if all models failed - input is preserved by default (not cleared)
      }
    } finally {
      // Clean up timeout if it still exists
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      setCurrentAbortController(null)
      userCancelledRef.current = false
      setIsLoading(false)

      // NOTE: We don't need to refresh credit balance here because the streaming metadata
      // already provides the most up-to-date credits_remaining value (calculated right after deduction).
      // Adding a delayed refresh here would actually overwrite the correct value with potentially stale data
      // from the database due to timing/caching issues.
    }
  }

  // Calculate credits remaining (reusable across components)
  // This is used to disable submit button and exit follow-up mode when credits run out
  const creditsRemaining = useMemo(() => {
    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'

    // Get credit information (if available)
    // Prefer creditBalance if available (more up-to-date after model calls)
    const creditsAllocated =
      creditBalance?.credits_allocated ??
      (isAuthenticated && user
        ? user.monthly_credits_allocated || getCreditAllocation(userTier)
        : getDailyCreditLimit(userTier) || getCreditAllocation(userTier))

    // For anonymous users, prefer anonymousCreditsRemaining if available, then creditBalance
    if (!isAuthenticated) {
      if (anonymousCreditsRemaining !== null) {
        // Use anonymousCreditsRemaining state if available (most up-to-date for anonymous users)
        return anonymousCreditsRemaining
      } else if (
        creditBalance?.credits_remaining !== undefined &&
        creditBalance?.subscription_tier === 'anonymous'
      ) {
        // Only use creditBalance if it's for anonymous users (prevent using authenticated user's balance)
        return creditBalance.credits_remaining
      } else {
        // Fallback: calculate from allocated and used
        const creditsUsed = creditBalance?.credits_used_today ?? 0
        return Math.max(0, creditsAllocated - creditsUsed)
      }
    } else {
      // For authenticated users, only use creditBalance if it matches their tier
      if (
        creditBalance?.credits_remaining !== undefined &&
        creditBalance?.subscription_tier === userTier
      ) {
        // Use creditBalance if available and matches current user's tier
        return creditBalance.credits_remaining
      } else {
        // Fallback: calculate from allocated and used
        const creditsUsed =
          creditBalance?.credits_used_this_period ?? (user?.credits_used_this_period || 0)
        return Math.max(0, creditsAllocated - creditsUsed)
      }
    }
  }, [isAuthenticated, user, creditBalance, anonymousCreditsRemaining])

  // Exit follow-up mode when credits run out
  useEffect(() => {
    if (isFollowUpMode && creditsRemaining <= 0) {
      setIsFollowUpMode(false)
    }
  }, [creditsRemaining, isFollowUpMode, setIsFollowUpMode])

  // Check credits and set error message if credits are 0 (persists across page refresh and login/logout)
  useEffect(() => {
    // Only check if we have credit data available
    // Skip if credits are still loading (null/undefined)
    if (creditsRemaining === null || creditsRemaining === undefined) {
      return
    }

    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'

    // Only use creditBalance if it matches the current user's tier to prevent cross-contamination
    const resetDate =
      (creditBalance?.subscription_tier === userTier ? creditBalance?.credits_reset_at : null) ||
      user?.credits_reset_at

    // Verify that creditBalance matches current user type before using it
    // This prevents anonymous user's zero credits from affecting authenticated users
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
          setCreditWarningType(null)
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
                  onAccurateTokenCountChange={setAccurateInputTokens}
                  creditsRemaining={creditsRemaining}
                  savedModelSelections={savedModelSelections}
                  onSaveModelSelection={handleSaveModelSelection}
                  onLoadModelSelection={handleLoadModelSelection}
                  onDeleteModelSelection={deleteModelSelection}
                  canSaveMoreSelections={canSaveMoreSelections}
                  maxSavedSelections={maxSavedSelections}
                  attachedFiles={attachedFiles}
                  setAttachedFiles={setAttachedFiles}
                  onExpandFiles={expandFiles}
                  webSearchEnabled={webSearchEnabled}
                  onWebSearchEnabledChange={setWebSearchEnabled}
                />
              </ErrorBoundary>
            </Hero>

            {/* Credit Warning Messages */}
            {creditWarningMessage && (
              <div className="error-message" ref={creditWarningMessageRef}>
                <span>⚠️ {creditWarningMessage}</span>
                {creditWarningDismissible && creditBalance && (
                  <button
                    onClick={() => {
                      const userTier = isAuthenticated
                        ? user?.subscription_tier || 'free'
                        : 'anonymous'
                      const periodType =
                        userTier === 'anonymous' || userTier === 'free' ? 'daily' : 'monthly'
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
              <div className="error-message" ref={errorMessageRef}>
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
                      {/* Hide Premium Models Toggle - only for anonymous and free tiers */}
                      {(() => {
                        const userTier = isAuthenticated
                          ? user?.subscription_tier || 'free'
                          : 'anonymous'
                        const showHidePremiumToggle =
                          userTier === 'anonymous' || userTier === 'free'
                        if (!showHidePremiumToggle) return null
                        return (
                          <button
                            className={`hide-premium-button ${hidePremiumModels ? 'active' : ''}`}
                            onClick={e => {
                              e.stopPropagation()
                              setHidePremiumModels(!hidePremiumModels)
                            }}
                            title={
                              hidePremiumModels ? 'Show premium models' : 'Hide premium models'
                            }
                            aria-label={
                              hidePremiumModels ? 'Show premium models' : 'Hide premium models'
                            }
                          >
                            {hidePremiumModels ? (
                              /* Eye-off icon (hiding premium models) */
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                                preserveAspectRatio="xMidYMid meet"
                              >
                                <path
                                  d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                                  strokeWidth="1"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <line
                                  x1="1"
                                  y1="1"
                                  x2="23"
                                  y2="23"
                                  strokeWidth="1"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              /* Eye icon (showing all models) */
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                                preserveAspectRatio="xMidYMid meet"
                              >
                                <path
                                  d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                                  strokeWidth="1"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="3"
                                  strokeWidth="1"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        )
                      })()}
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
                            // Determine user tier for filtering
                            const userTier = isAuthenticated
                              ? user?.subscription_tier || 'free'
                              : 'anonymous'
                            const isPaidTier = [
                              'starter',
                              'starter_plus',
                              'pro',
                              'pro_plus',
                            ].includes(userTier)

                            // Filter models based on hidePremiumModels toggle
                            // When toggle is active, hide models that are restricted for the user's tier
                            const visibleModels = hidePremiumModels
                              ? models.filter(model => {
                                  if (isPaidTier) return true // Paid tiers see all
                                  if (userTier === 'anonymous') {
                                    return model.tier_access === 'anonymous'
                                  }
                                  // Free tier
                                  return model.tier_access !== 'paid'
                                })
                              : models

                            // Skip this provider if no visible models after filtering
                            if (visibleModels.length === 0) {
                              return null
                            }

                            const hasSelectedModels = visibleModels.some(model =>
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
                                      const selectedCount = visibleModels.filter(model =>
                                        selectedModels.includes(model.id)
                                      ).length
                                      return (
                                        <span
                                          className={`provider-count ${selectedCount > 0 ? 'has-selected' : 'empty'}`}
                                        >
                                          {selectedCount} of {visibleModels.length} selected
                                        </span>
                                      )
                                    })()}
                                    {(() => {
                                      // Filter out unavailable models (where available === false)
                                      const availableProviderModels = visibleModels.filter(
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

                                      const isAnonymousOrFreeTier = !isPaidTier

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
                                                : isAnonymousOrFreeTier
                                                  ? `Select all Available`
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
                                    {visibleModels.map(model => {
                                      const isSelected = selectedModels.includes(model.id)
                                      const wasOriginallySelected = originalSelectedModels.includes(
                                        model.id
                                      )
                                      const isUnavailable = model.available === false

                                      // Determine if model is restricted based on user tier
                                      // (userTier and isPaidTier are already defined at provider level)
                                      // When hidePremiumModels is true, restricted models are already filtered out
                                      let isRestricted = false
                                      if (!hidePremiumModels) {
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
                                      }

                                      const requiresUpgrade =
                                        isRestricted &&
                                        (userTier === 'anonymous' || userTier === 'free')

                                      const isDisabled =
                                        isUnavailable ||
                                        isRestricted ||
                                        (selectedModels.length >= maxModelsLimit && !isSelected) ||
                                        (isFollowUpMode && !isSelected && !wasOriginallySelected)

                                      const handleModelClick = () => {
                                        if (isRestricted && requiresUpgrade) {
                                          // Open upgrade modal or show upgrade message
                                          setError(
                                            `This model requires a paid subscription. Upgrade to access premium models like ${model.name}.`
                                          )
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
                                        >
                                          <div className="model-info">
                                            <h4>
                                              {model.name}
                                              {isRestricted && (
                                                <span
                                                  className="model-badge premium"
                                                  title={
                                                    userTier === 'anonymous' &&
                                                    model.tier_access === 'free'
                                                      ? "Click 'Sign Up' above"
                                                      : 'Premium model - upgrade after registration'
                                                  }
                                                >
                                                  <svg
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    style={{
                                                      display: 'inline-block',
                                                      verticalAlign: 'middle',
                                                      marginRight: '0.25rem',
                                                    }}
                                                  >
                                                    <rect
                                                      x="5"
                                                      y="11"
                                                      width="14"
                                                      height="10"
                                                      rx="2"
                                                      ry="2"
                                                    />
                                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                  </svg>
                                                  {userTier === 'anonymous' &&
                                                  model.tier_access === 'free'
                                                    ? 'With free registration'
                                                    : 'Premium'}
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
                                          <div
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.375rem',
                                              flexShrink: 0,
                                            }}
                                          >
                                            {model.supports_web_search && (
                                              <span
                                                className="web-search-indicator"
                                                title="This model can access the Internet"
                                                style={{
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  width: '16px',
                                                  height: '16px',
                                                  opacity: isSelected ? 1 : 0.6,
                                                  transition: 'opacity 0.2s',
                                                  margin: 0,
                                                  flexShrink: 0,
                                                }}
                                              >
                                                <svg
                                                  width="16"
                                                  height="16"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke={
                                                    isSelected ? 'currentColor' : 'currentColor'
                                                  }
                                                  strokeWidth="2"
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  style={{
                                                    color: isSelected
                                                      ? 'var(--primary-color, #007bff)'
                                                      : 'var(--text-secondary, #666)',
                                                    display: 'block',
                                                  }}
                                                >
                                                  <circle cx="12" cy="12" r="10" />
                                                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                                </svg>
                                              </span>
                                            )}
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              disabled={isDisabled}
                                              onChange={handleModelClick}
                                              className={`model-checkbox ${isFollowUpMode && !isSelected && wasOriginallySelected ? 'follow-up-deselected' : ''}`}
                                              style={{
                                                margin: 0,
                                                width: '16px',
                                                height: '16px',
                                              }}
                                            />
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
                                      {model.supports_web_search && (
                                        <span
                                          className="web-search-indicator"
                                          title="This model can access the Internet"
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            marginLeft: '0.5rem',
                                            opacity: 1,
                                          }}
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
                                            style={{
                                              color: 'var(--primary-color, #007bff)',
                                            }}
                                          >
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                          </svg>
                                        </span>
                                      )}
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
                      {/* Scroll Lock Toggle - Only show when multiple models are running and not on mobile */}
                      {conversations.length > 1 && !isMobileLayout && (
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

                      {/* Export Dropdown */}
                      <div className="export-dropdown-container" ref={exportMenuRef}>
                        <button
                          onClick={() => setShowExportMenu(!showExportMenu)}
                          className="follow-up-button export-dropdown-trigger"
                          title="Export comparison"
                          aria-expanded={showExportMenu}
                          aria-haspopup="true"
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
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          <span>Export</span>
                          <svg
                            className={`export-dropdown-arrow ${showExportMenu ? 'open' : ''}`}
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        {showExportMenu && (
                          <div className="export-dropdown-menu" role="menu">
                            <button
                              onClick={() => handleExport('pdf')}
                              className="export-dropdown-item"
                              role="menuitem"
                              title="Best for sharing & printing"
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <path d="M9 13h6" />
                                <path d="M9 17h6" />
                              </svg>
                              <div className="export-dropdown-item-content">
                                <span className="export-dropdown-item-title">PDF</span>
                              </div>
                            </button>
                            <button
                              onClick={() => handleExport('markdown')}
                              className="export-dropdown-item"
                              role="menuitem"
                              title="For docs & note apps"
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <path d="M12 18v-6" />
                                <path d="M9 15l3-3 3 3" />
                              </svg>
                              <div className="export-dropdown-item-content">
                                <span className="export-dropdown-item-title">Markdown</span>
                              </div>
                            </button>
                            <button
                              onClick={() => handleExport('html')}
                              className="export-dropdown-item"
                              role="menuitem"
                              title="Standalone web page"
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="16 18 22 12 16 6" />
                                <polyline points="8 6 2 12 8 18" />
                              </svg>
                              <div className="export-dropdown-item-content">
                                <span className="export-dropdown-item-title">HTML</span>
                              </div>
                            </button>
                            <button
                              onClick={() => handleExport('json')}
                              className="export-dropdown-item"
                              role="menuitem"
                              title="For developers & APIs"
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <path d="M8 13h2" />
                                <path d="M8 17h2" />
                                <path d="M14 13h2" />
                                <path d="M14 17h2" />
                              </svg>
                              <div className="export-dropdown-item-content">
                                <span className="export-dropdown-item-title">JSON</span>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>

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
                            whiteSpace: 'normal',
                            lineHeight: '1.4',
                            textAlign: 'center',
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
                          <span style={{ whiteSpace: 'nowrap' }}>Show All Results</span>{' '}
                          <span style={{ whiteSpace: 'nowrap' }}>({closedCards.size} hidden)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tabbed layout for mobile with multiple cards */}
                  {isMobileLayout && visibleConversations.length > 1 && (
                    <div className="results-tabs-container">
                      <div className="results-tabs-header">
                        {visibleConversations.map((conversation, index) => {
                          const model = allModels.find(m => m.id === conversation.modelId)
                          const isActive = index === activeTabIndex
                          const latestMsg = conversation.messages[conversation.messages.length - 1]
                          const hasError = isErrorMessage(latestMsg?.content)

                          return (
                            <button
                              key={conversation.modelId}
                              className={`results-tab-button ${isActive ? 'active' : ''}`}
                              onClick={() => setActiveTabIndex(index)}
                              aria-label={`View results for ${model?.name || conversation.modelId}`}
                              aria-selected={isActive}
                              role="tab"
                            >
                              <span className="results-tab-name">
                                {model?.name || conversation.modelId}
                              </span>
                              {hasError && (
                                <span className="results-tab-error-indicator" aria-label="Error">
                                  ⚠
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div
                    className={`results-grid ${isMobileLayout && visibleConversations.length > 1 ? 'results-grid-tabbed' : ''}`}
                  >
                    {conversations
                      .filter(
                        conv =>
                          conv &&
                          conv.modelId &&
                          selectedModels.includes(conv.modelId) &&
                          !closedCards.has(conv.modelId)
                      )
                      .map(conversation => {
                        // Safety check for conversation data
                        if (
                          !conversation ||
                          !conversation.messages ||
                          !Array.isArray(conversation.messages)
                        ) {
                          return null
                        }
                        const model = allModels.find(m => m.id === conversation.modelId)
                        const latestMessage =
                          conversation.messages[conversation.messages.length - 1]
                        const content = latestMessage?.content || ''
                        // Check for error: backend error flag OR error message in content OR empty content after completion (timeout)
                        // Check both formatted and raw model ID formats (backend uses raw, conversations use formatted)
                        // Find the raw model ID that corresponds to this formatted conversation.modelId
                        const rawModelId = selectedModels?.find(
                          m => createModelId(m) === conversation.modelId
                        )
                        // Check modelErrors with both formats (backend stores raw, but check both for safety)
                        const hasBackendError =
                          (rawModelId && modelErrors[rawModelId] === true) ||
                          modelErrors[conversation.modelId] === true
                        const hasErrorMessage = isErrorMessage(content)
                        // Consider empty content an error if:
                        // 1. Model has completed (has entry in modelErrors) - normal completion case
                        // 2. Model hasn't completed but loading is done (timeout case) - mark as failed
                        const modelHasCompleted =
                          (rawModelId && rawModelId in modelErrors) ||
                          conversation.modelId in modelErrors
                        const isLoadingDone = !isLoading // If not loading, stream has ended (either completed or timed out)
                        const isEmptyContent =
                          content.trim().length === 0 &&
                          latestMessage?.type === 'assistant' &&
                          (modelHasCompleted || isLoadingDone)
                        const isError = hasBackendError || hasErrorMessage || isEmptyContent
                        // Determine status: PROCESS during streaming, SUCCESS/FAIL when completed
                        const isProcessing = !modelHasCompleted && isLoading
                        const statusText = isProcessing ? 'Process' : isError ? 'Failed' : 'Success'
                        const statusClass = isProcessing ? 'process' : isError ? 'error' : 'success'
                        const safeId = getSafeId(conversation.modelId)

                        // Determine if this is the active card in tabbed mode
                        const conversationIndex = visibleConversations.findIndex(
                          c => c.modelId === conversation.modelId
                        )
                        const isActiveCard =
                          isMobileLayout &&
                          visibleConversations.length > 1 &&
                          conversationIndex === activeTabIndex

                        // Determine transition classes for smooth breakout animation
                        const transitionClass =
                          breakoutPhase === 'fading-out'
                            ? 'breakout-fade-out'
                            : breakoutPhase === 'hidden'
                              ? 'breakout-hidden'
                              : breakoutPhase === 'fading-in'
                                ? 'breakout-fade-in'
                                : ''

                        return (
                          <div
                            key={conversation.modelId}
                            className={`result-card conversation-card ${transitionClass}`.trim()}
                            style={
                              isMobileLayout && visibleConversations.length > 1
                                ? {
                                    display: isActiveCard ? 'block' : 'none',
                                  }
                                : undefined
                            }
                          >
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
                                  {/* Breakout button - only show for multi-model comparisons and models that haven't failed */}
                                  {visibleConversations.length > 1 && !isError && (
                                    <button
                                      className="breakout-card-btn"
                                      onClick={e => {
                                        handleBreakout(conversation.modelId)
                                        e.currentTarget.blur()
                                      }}
                                      title="Continue with this model only"
                                      aria-label={`Break out conversation with ${model?.name || conversation.modelId}`}
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
                                        {/* Arrow breaking out of a box icon */}
                                        <path d="M7 17L17 7" />
                                        <path d="M7 7h10v10" />
                                        <path d="M3 12v8a1 1 0 0 0 1 1h8" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="result-header-bottom">
                                <span
                                  className={`output-length ${visibleCharTooltip === conversation.modelId ? 'tooltip-visible' : ''}`}
                                  onClick={() => handleCharCountClick(conversation.modelId)}
                                  style={{ cursor: isSmallLayout ? 'pointer' : 'default' }}
                                >
                                  {latestMessage?.content.length || 0}
                                  {isSmallLayout ? '' : ' chars'}
                                  {isSmallLayout && (
                                    <span className="output-length-tooltip">Characters</span>
                                  )}
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
                                <span className={`status ${statusClass}`}>{statusText}</span>
                              </div>
                            </div>
                            <div
                              className="conversation-content"
                              id={`conversation-content-${safeId}`}
                            >
                              {conversation.messages.map((message, msgIndex) => {
                                const messageId = message.id || `msg-${msgIndex}`
                                const messageSafeId = getSafeId(messageId)
                                const messageContentId = `message-content-${safeId}-${messageSafeId}`
                                // Trim leading/trailing whitespace to prevent horizontal scrollbars
                                const trimmedContent = (message.content || '').trim()
                                return (
                                  <div
                                    key={messageId}
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
                                              messageId,
                                              trimmedContent
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
                                              {trimmedContent}
                                            </pre>
                                          }
                                        >
                                          <LatexRenderer
                                            className="result-output"
                                            modelId={conversation.modelId}
                                          >
                                            {trimmedContent}
                                          </LatexRenderer>
                                        </Suspense>
                                      ) : (
                                        /* Raw text for immediate streaming display */
                                        <pre className="result-output raw-output">
                                          {trimmedContent}
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
            {/* SEO Content Pages */}
            <Route path="/about" element={<About />} />
            <Route path="/features" element={<Features />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            {/* Main Application */}
            <Route path="*" element={<AppContent />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
