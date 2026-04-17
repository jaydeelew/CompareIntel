import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import '../styles/hero.css'
import '../styles/models.css'
import '../styles/results.css'

import {
  type AttachedFile,
  type StoredAttachedFile,
  CreditsInfoModal,
  CREDITS_MESSAGE,
} from '../components/comparison'
import { Navigation, MockModeBanner } from '../components/layout'
import { ComparisonPageContent, ModalManager } from '../components/main-page'
import { DoneSelectingCard } from '../components/shared'
import {
  getCreditAllocation,
  getDailyCreditLimit,
  OVERAGE_USD_PER_CREDIT,
} from '../config/constants'
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
  usePersistedComposerAdvancedSettings,
  useAuthModals,
  useBreakoutConversation,
  useGeolocation,
  useSavedSelectionsComplete,
  useMainPageEffects,
} from '../hooks'
import { ApiError, isCancellationError } from '../services/api/errors'
import { getRateLimitStatus, resetRateLimit } from '../services/compareService'
import { getCreditBalance } from '../services/creditService'
import type { CreditBalance } from '../services/creditService'
import { getAvailableModels } from '../services/modelsService'
import {
  createModelId,
  type ModelsByProvider,
  type ResultTab,
  type ActiveResultTabs,
} from '../types'
import { generateBrowserFingerprint } from '../utils'
import { removePlaceholderFromInput } from '../utils/attachmentInputUtils'
import { BILLING_UPDATED_EVENT } from '../utils/billingSync'
import { isErrorMessage } from '../utils/error'
import {
  getAllKnownAspectRatios,
  getAllKnownImageSizes,
  getDefaultCompatibleConfig,
  getIncompatibleModelsForConfig,
  getSupportedAspectRatiosForModels,
  getSupportedImageSizesForModels,
  hasCommonImageConfig,
} from '../utils/imageConfigValidation'
import logger from '../utils/logger'
import { inferModelModeForLoadedModels } from '../utils/modelModeInference'
import { isModelIdSelectableForUser } from '../utils/modelTierAccess'
import { saveSessionState, onSaveStateEvent } from '../utils/sessionState'
import { applyTextComposerAdvancedSettings } from '../utils/textComposerAdvancedRestore'
import {
  filterModelsByProviderToImage,
  filterModelsByProviderToText,
  getModelNames,
  modelSupportsImageGeneration,
  modelSupportsVision,
} from '../utils/visionModels'

export function MainPage() {
  const { isAuthenticated, user, refreshUser, refreshToken, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const currentView = 'main'

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
  const [attachedFiles, setAttachedFiles] = useState<(AttachedFile | StoredAttachedFile)[]>([])
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [temperature, setTemperature] = useState(0.7) // 0.0-2.0, controls response randomness
  const [topP, setTopP] = useState(1) // 0.0-1.0, nucleus sampling
  const [maxTokens, setMaxTokens] = useState<number | null>(null) // cap on output length
  const [defaultSelectionOverridden, setDefaultSelectionOverridden] = useState(false)
  const [visionNoticeMessage, setVisionNoticeMessage] = useState<string | null>(null)
  const [modelMode, setModelMode] = useState<'text' | 'image'>('text')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [imageSize, setImageSize] = useState('1K')
  const [imageConfigConflict, setImageConfigConflict] = useState<{
    conflictType:
      | 'advanced-setting-change'
      | 'model-add'
      | 'no-common-config'
      | 'auto-adjusted'
      | null
    settingKind?: 'aspect_ratio' | 'image_size'
    incompatibleModelIds: string[]
    previousAspectRatio?: string
    previousImageSize?: string
    /** Full image model selection (for modal copy when not identical to incompatibleModelIds) */
    allImageModelIds?: string[]
  }>({ conflictType: null, incompatibleModelIds: [] })
  /** After user dismisses "no common config", do not reopen until selection changes */
  const imageConflictImpossibleDismissedKeyRef = useRef<string | null>(null)

  const { userLocation } = useGeolocation({ isAuthenticated, user })

  /** Avoids re-running fingerprint + models init on every /auth/me object identity change. */
  const authBillingInitKey = useMemo(() => {
    if (!isAuthenticated || !user) return ''
    return [
      user.id,
      user.subscription_tier,
      user.monthly_credits_allocated ?? '',
      user.billing_period_start ?? '',
    ].join('|')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- billing primitives only; omit `user` object to avoid refreshUser() identity churn
  }, [
    isAuthenticated,
    user?.id,
    user?.subscription_tier,
    user?.monthly_credits_allocated,
    user?.billing_period_start,
  ])

  const { expandFiles, extractFileContentForStorage, getAttachedImagesForApi } = useFileHandling()

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
    clearStreamingReasoningUi,
    setStreamingReasoningByModel,
    setStreamAnswerStartedByModel,
    effectiveStreamingReasoningByModel,
    streamAnswerStartedByModel,
    isFollowUpMode,
    setIsFollowUpMode,
    closedCards,
    setClosedCards,
    activeResultTabs,
    setActiveResultTabs,
    currentAbortController,
    setCurrentAbortController,
    userCancelledRef,
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

  const setInputRef = useRef(setInput)
  setInputRef.current = setInput

  const onRemoveAttachedImages = useCallback(() => {
    const imageFiles = attachedFiles.filter(
      (f): f is AttachedFile => 'base64Data' in f && !!f.base64Data
    )
    if (imageFiles.length === 0) return
    const remaining = attachedFiles.filter(
      f => !('base64Data' in f && (f as AttachedFile).base64Data)
    )
    setAttachedFiles(remaining)
    setVisionNoticeMessage(null)
    setVisionNoticeMessage(null)
    setVisionNoticeMessage(null)
    setInput((prev: string) => {
      let next = prev
      for (const f of imageFiles) {
        next = removePlaceholderFromInput(next, f.placeholder)
      }
      return next.trim()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setInput from useState is stable
  }, [attachedFiles, setAttachedFiles])

  const selectedModelsGridRef = useRef<HTMLDivElement>(null)
  const scrolledToTopRef = useRef<Set<string>>(new Set())
  const shouldScrollToTopAfterFormattingRef = useRef<boolean>(false)
  const lastSubmittedInputRef = useRef<string>('')
  const [modelsByProvider, setModelsByProvider] = useState<ModelsByProvider>({})
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  // Track previous auth state to skip cache when auth changes (e.g., after login/registration)
  const prevIsAuthenticatedRef = useRef<boolean | null>(null)

  const refetchModels = useCallback(
    (forceSkipCache = false) => {
      setIsLoadingModels(true)
      if (forceSkipCache) {
        setError(null)
      }
      const authStateChanged =
        prevIsAuthenticatedRef.current !== null &&
        prevIsAuthenticatedRef.current !== isAuthenticated
      const skipCache = forceSkipCache || authStateChanged
      const doFetch = async () => {
        try {
          const data = await getAvailableModels(skipCache)
          if (data.models_by_provider && Object.keys(data.models_by_provider).length > 0) {
            setModelsByProvider(data.models_by_provider)
            setError(null)
          } else {
            logger.error('No models_by_provider data received')
            setError('No model data received from server')
          }
        } catch (err) {
          if (isCancellationError(err)) return
          const msg = err instanceof Error ? err.message : String(err)
          logger.error('Failed to fetch models:', msg)
          setError(`Failed to fetch models: ${msg}`)
        } finally {
          setIsLoadingModels(false)
          prevIsAuthenticatedRef.current = isAuthenticated
        }
      }
      doFetch()
    },
    [isAuthenticated, setError, setModelsByProvider]
  )
  const fetchModelsRef = useRef(refetchModels)
  fetchModelsRef.current = refetchModels
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
  const [showCreditsInfoModal, setShowCreditsInfoModal] = useState(false)
  const [disabledButtonInfo, setDisabledButtonInfo] = useState<{
    button: 'collapse-all' | 'clear-all' | null
    message: string
  }>({ button: null, message: '' })
  const [disabledModelModalInfo, setDisabledModelModalInfo] = useState<{
    userTier: 'unregistered' | 'free'
    modelTierAccess: 'free' | 'paid'
    modelName?: string
  } | null>(null)
  const [modelTypeConflictType, setModelTypeConflictType] = useState<
    'text-to-image' | 'image-to-text' | null
  >(null)
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
    showOverageExtend,
    setShowOverageExtend,
    creditWarningMessageRef,
    getCreditWarningMessage,
    isLowCreditWarningDismissed,
    dismissLowCreditWarning,
    isOverageActiveDismissed,
    dismissOverageActive,
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
    handleApplyRecommendation,
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
    onDeselectToEmpty: () => setDefaultSelectionOverridden(true),
    hidePremiumModels,
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

  // Trial modal state
  const [showTrialWelcomeModal, setShowTrialWelcomeModal] = useState(false)
  const [pendingTrialModalAfterVerification, setPendingTrialModalAfterVerification] =
    useState(false)
  const verificationCompletedAtRef = useRef<number | null>(null)

  const [modelsDropdownOpen, setModelsDropdownOpen] = useState<
    'help-me-choose' | 'advanced' | null
  >(null)
  /** When set, Help me choose scrolls this category into view horizontally after open */
  const [helpMeChooseScrollCategoryId, setHelpMeChooseScrollCategoryId] = useState<string | null>(
    null
  )

  const {
    showDoneSelectingCard,
    setShowDoneSelectingCard,
    handleDoneSelecting,
    handleDismissDoneSelecting,
  } = useDoneSelectingCard(
    {
      selectedModelsCount: selectedModels.length,
      selectedModelsSignature: selectedModels.slice().sort().join(','),
      isModelsHidden,
      isFollowUpMode,
      modelsSectionRef,
    },
    {
      onCollapseAllDropdowns: collapseAllDropdowns,
      onSetIsModelsHidden: setIsModelsHidden,
      onFocusTextarea: () => textareaRef.current?.focus(),
    }
  )

  const clearHelpMeChooseScrollCategory = useCallback(() => {
    setHelpMeChooseScrollCategoryId(null)
  }, [])

  const openHelpMeChoose = useCallback((options?: { scrollToCategoryId?: string }) => {
    setHelpMeChooseScrollCategoryId(options?.scrollToCategoryId ?? null)
    setIsModelsHidden(false)
    setModelsDropdownOpen('help-me-choose')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modelsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }, [])

  const handleModelsDropdownChange = useCallback((open: 'help-me-choose' | 'advanced' | null) => {
    setModelsDropdownOpen(open)
  }, [])

  useEffect(() => {
    if (modelsDropdownOpen !== 'help-me-choose') {
      setHelpMeChooseScrollCategoryId(null)
    }
  }, [modelsDropdownOpen])

  const allModelsFlatForComposer = useMemo(
    () => Object.values(modelsByProvider).flat(),
    [modelsByProvider]
  )

  const carouselProviders = useMemo(
    () =>
      Object.entries(modelsByProvider)
        .filter(([, models]) => models.length > 0)
        .map(([provider]) => provider),
    [modelsByProvider]
  )

  const handleCarouselProviderClick = useCallback(
    (provider: string) => {
      const textProviders = filterModelsByProviderToText(modelsByProvider)
      const imageProviders = filterModelsByProviderToImage(modelsByProvider)
      const hasText = provider in textProviders
      const hasImage = provider in imageProviders

      if (hasImage && !hasText) {
        setDefaultSelectionOverridden(true)
        setModelMode('image')
      } else if (hasText && !hasImage) {
        setDefaultSelectionOverridden(true)
        setModelMode('text')
      }

      setIsModelsHidden(false)
      setOpenDropdowns(new Set([provider]))

      // The provider dropdowns are conditionally rendered (hidden when isModelsHidden
      // is true). After toggling the state, React needs to commit the render and the
      // browser needs to layout before the element exists in the DOM. Poll until it
      // appears, then scroll.
      let attempts = 0
      const tryScroll = () => {
        const el = document.querySelector(`.provider-dropdown[data-provider-name="${provider}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
        attempts++
        if (attempts < 20) {
          setTimeout(tryScroll, 50)
        }
      }
      setTimeout(tryScroll, 60)
    },
    [setIsModelsHidden, setOpenDropdowns, modelsByProvider]
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
      user,
      selectedModels,
      modelsByProvider,
      maxModelsLimit,
      response,
      conversations,
      modelMode,
      temperature,
      topP,
      maxTokens,
      allModels: allModelsFlatForComposer,
      aspectRatio,
      imageSize,
    },
    {
      setSelectedModels,
      setOpenDropdowns,
      setConversations,
      setResponse,
      setDefaultSelectionOverridden,
      setModelMode,
      setTemperature,
      setTopP,
      setMaxTokens,
      setAspectRatio,
      setImageSize,
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
    return conversations.filter(conv => conv && conv.modelId && !closedCards.has(conv.modelId))
  }, [conversations, closedCards])

  const { modelErrorStates, modelProcessingStates } = useMemo(() => {
    const errorStates: Record<string, boolean> = {}
    const processingStates: Record<string, boolean> = {}

    conversations.forEach(conversation => {
      if (!conversation || !conversation.modelId) return

      const latestMessage = conversation.messages[conversation.messages.length - 1]
      const content = latestMessage?.content || ''
      const hasImages = (latestMessage?.images?.length ?? 0) > 0

      const rawModelId =
        selectedModels.find(m => createModelId(m) === conversation.modelId) ??
        originalSelectedModels.find(m => createModelId(m) === conversation.modelId)

      const hasBackendError =
        (rawModelId && modelErrors[rawModelId] === true) ||
        modelErrors[conversation.modelId] === true

      const modelHasCompleted =
        (rawModelId && rawModelId in modelErrors) || conversation.modelId in modelErrors
      const isLoadingDone = !isLoading

      const isEmptyContent =
        content.trim().length === 0 &&
        !hasImages &&
        latestMessage?.type === 'assistant' &&
        (modelHasCompleted || isLoadingDone)

      errorStates[conversation.modelId] = hasBackendError || isEmptyContent
      processingStates[conversation.modelId] = !modelHasCompleted && isLoading
    })

    return { modelErrorStates: errorStates, modelProcessingStates: processingStates }
  }, [conversations, selectedModels, originalSelectedModels, modelErrors, isLoading])

  const attemptFocusTextarea = useCallback(() => {
    if (!isTouchDevice && currentView === 'main' && textareaRef.current) {
      const textarea = textareaRef.current
      const rect = textarea.getBoundingClientRect()
      const isVisible = rect.width > 0 && rect.height > 0
      const isNotDisabled = !textarea.disabled

      if (isVisible && isNotDisabled) {
        const hasBlockingModal = document.querySelector('[role="dialog"]')

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
    shouldScrollToTopAfterFormattingRef,
    selectedModelsForScroll: selectedModels,
    streamingReasoningByModel: effectiveStreamingReasoningByModel,
    autoScrollPausedRef,
    input,
  })

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

  const filteredModelsByProvider =
    modelMode === 'image'
      ? filterModelsByProviderToImage(modelsByProvider)
      : filterModelsByProviderToText(modelsByProvider)
  const allModels = Object.values(filteredModelsByProvider).flat()

  /** Text/image toggle only — marks default as session-overridden so empty selection does not re-apply default */
  const handleModelModeChange = useCallback(
    (newMode: 'text' | 'image') => {
      if (newMode === modelMode) return
      setDefaultSelectionOverridden(true)
      setModelMode(newMode)
    },
    [modelMode]
  )

  // Clear selected models when switching modes if they no longer match the filtered list
  useEffect(() => {
    const ids = new Set(
      Object.values(
        modelMode === 'image'
          ? filterModelsByProviderToImage(modelsByProvider)
          : filterModelsByProviderToText(modelsByProvider)
      )
        .flat()
        .map(m => String(m.id))
    )
    setSelectedModels(prev => prev.filter(id => ids.has(id)))
    setOriginalSelectedModels(prev => prev.filter(id => ids.has(id)))
  }, [modelMode, setSelectedModels, setOriginalSelectedModels, modelsByProvider])

  /**
   * Image Advanced (aspect ratio, image size): when selected models shrink, swap for a new set,
   * or clear entirely, snap to defaults compatible with the current selection. Skips pure “add
   * only” updates so manual image config isn’t reset when adding another model.
   */
  const prevSelectedModelsForAdvancedRef = useRef<string[] | null>(null)
  useEffect(() => {
    const prev = prevSelectedModelsForAdvancedRef.current
    prevSelectedModelsForAdvancedRef.current = selectedModels
    if (justLoadedFromHistoryRef.current || isScrollingToTopFromHistoryRef.current) return
    if (prev === null) return

    const prevSet = new Set(prev.map(String))
    const nextSet = new Set(selectedModels.map(String))
    const removed = prev.some(id => !nextSet.has(String(id)))
    const added = selectedModels.some(id => !prevSet.has(String(id)))
    if (!removed && !added) return
    if (added && !removed) return

    const { aspectRatio: r, imageSize: s } = getDefaultCompatibleConfig(
      selectedModels,
      modelsByProvider
    )
    setAspectRatio(r)
    setImageSize(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs read for history-load guard only
  }, [selectedModels, modelsByProvider])

  // Effective max tokens cap: minimum of selected models' limits (matches backend logic)
  const effectiveMaxTokens = useMemo(() => {
    if (selectedModels.length === 0) return 8192
    const caps = selectedModels
      .map(id => allModels.find(m => m.id === id)?.max_output_tokens ?? 8192)
      .filter((n): n is number => typeof n === 'number')
    return caps.length > 0 ? Math.max(256, Math.min(...caps)) : 8192
  }, [selectedModels, allModels])

  // Clamp maxTokens when selection changes and effective cap drops below current value
  useEffect(() => {
    if (maxTokens !== null && maxTokens > effectiveMaxTokens) {
      setMaxTokens(effectiveMaxTokens)
    }
  }, [effectiveMaxTokens, maxTokens, setMaxTokens])

  const imageModelIds = useMemo(
    () => selectedModels.filter(id => modelSupportsImageGeneration(id, modelsByProvider)),
    [selectedModels, modelsByProvider]
  )

  // Image Advanced: open dropdown + modal when selection has no shared options, or auto-adjust when possible.
  useEffect(() => {
    if (imageModelIds.length === 0) {
      imageConflictImpossibleDismissedKeyRef.current = null
      setImageConfigConflict(prev =>
        prev.conflictType === 'no-common-config'
          ? { conflictType: null, incompatibleModelIds: [], allImageModelIds: undefined }
          : prev
      )
      return
    }

    if (justLoadedFromHistoryRef.current || isScrollingToTopFromHistoryRef.current) {
      return
    }

    const selectionKey = [...selectedModels].sort().join(',')

    if (!hasCommonImageConfig(selectedModels, modelsByProvider)) {
      setModelsDropdownOpen('advanced')
      if (imageConflictImpossibleDismissedKeyRef.current !== selectionKey) {
        setImageConfigConflict({
          conflictType: 'no-common-config',
          incompatibleModelIds: imageModelIds,
        })
      }
      return
    }

    imageConflictImpossibleDismissedKeyRef.current = null

    const incompatible = getIncompatibleModelsForConfig(
      selectedModels,
      aspectRatio,
      imageSize,
      modelsByProvider
    )

    if (incompatible.length === 0) {
      setImageConfigConflict(prev =>
        prev.conflictType === 'no-common-config'
          ? { conflictType: null, incompatibleModelIds: [], allImageModelIds: undefined }
          : prev
      )
      return
    }

    const { aspectRatio: r, imageSize: s } = getDefaultCompatibleConfig(
      selectedModels,
      modelsByProvider
    )
    if (r !== aspectRatio || s !== imageSize) {
      setAspectRatio(r)
      setImageSize(s)
      const isFirstAndOnlyModel = imageModelIds.length === 1
      if (!isFirstAndOnlyModel) {
        setModelsDropdownOpen('advanced')
        setImageConfigConflict({
          conflictType: 'auto-adjusted',
          incompatibleModelIds: incompatible,
          previousAspectRatio: aspectRatio,
          previousImageSize: imageSize,
          allImageModelIds: [...imageModelIds],
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- justLoadedFromHistoryRef / isScrollingToTopFromHistoryRef
  }, [selectedModels, modelsByProvider, aspectRatio, imageSize, imageModelIds])

  const imageGenerationNoSharedImageOptions = useMemo(() => {
    const imageIds = selectedModels.filter(id => modelSupportsImageGeneration(id, modelsByProvider))
    if (imageIds.length === 0) return false
    return !hasCommonImageConfig(selectedModels, modelsByProvider)
  }, [selectedModels, modelsByProvider])

  const isImageGenerationConfigBlocked = useMemo(() => {
    const imageIds = selectedModels.filter(id => modelSupportsImageGeneration(id, modelsByProvider))
    if (imageIds.length === 0) return false
    if (!hasCommonImageConfig(selectedModels, modelsByProvider)) return true
    return (
      getIncompatibleModelsForConfig(selectedModels, aspectRatio, imageSize, modelsByProvider)
        .length > 0
    )
  }, [selectedModels, modelsByProvider, aspectRatio, imageSize])

  const revealImageConfigConflict = useCallback(() => {
    const imageIds = selectedModels.filter(id => modelSupportsImageGeneration(id, modelsByProvider))
    setModelsDropdownOpen('advanced')
    if (imageIds.length === 0) return
    if (!hasCommonImageConfig(selectedModels, modelsByProvider)) {
      setImageConfigConflict({
        conflictType: 'no-common-config',
        incompatibleModelIds: imageIds,
      })
      return
    }
    const incompatible = getIncompatibleModelsForConfig(
      selectedModels,
      aspectRatio,
      imageSize,
      modelsByProvider
    )
    if (incompatible.length > 0) {
      setImageConfigConflict({
        conflictType: 'model-add',
        incompatibleModelIds: incompatible,
      })
    }
  }, [selectedModels, modelsByProvider, aspectRatio, imageSize])

  // Image config options: derived from registry; unsupported options are disabled in UI.
  // Use allModelsByProvider (full model set) for capability lookup so we have complete
  // image_aspect_ratios and image_sizes from the registry for each selected image model.
  const allModelsByProvider = modelsByProvider
  const imageConfigOptions = useMemo(() => {
    const supportedRatios = getSupportedAspectRatiosForModels(selectedModels, allModelsByProvider)
    const supportedSizes = getSupportedImageSizesForModels(selectedModels, allModelsByProvider)
    const allRatios = getAllKnownAspectRatios(allModelsByProvider)
    const allSizes = getAllKnownImageSizes(allModelsByProvider)
    const defaults = getDefaultCompatibleConfig(selectedModels, allModelsByProvider)
    return {
      supportedAspectRatios: supportedRatios,
      supportedImageSizes: supportedSizes,
      allAspectRatios: allRatios,
      allImageSizes: allSizes,
      defaultAspectRatio: defaults.aspectRatio,
      defaultImageSize: defaults.imageSize,
    }
  }, [selectedModels, allModelsByProvider])

  const handleAspectRatioChange = useCallback((newRatio: string) => {
    setAspectRatio(newRatio)
  }, [])

  const handleImageSizeChange = useCallback((newSize: string) => {
    setImageSize(newSize)
  }, [])

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
      modelsByProvider,
      setModelMode,
      allModels,
      setTemperature,
      setTopP,
      setMaxTokens,
      setAspectRatio,
      setImageSize,
    })

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
            if (isCancellationError(err)) return
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

  // Refresh anonymous rate-limit status when models are selected (eligibility for requests).
  // Intentionally does not call refreshUser() for signed-in users here: toggling model checkboxes
  // does not change server-side credits; refreshUser would refetch /auth/me and setUser, causing
  // full re-renders and scroll/layout thrash (jumps/flashing) in the model-selection area.
  // Authenticated credit balances still refresh after comparisons and other explicit flows.
  useEffect(() => {
    if (isAuthenticated || !browserFingerprint || selectedModels.length === 0 || isLoading) {
      return
    }
    const timeoutId = setTimeout(() => {
      fetchRateLimitStatus()
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [selectedModels.length, isLoading, browserFingerprint, isAuthenticated, fetchRateLimitStatus])

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
        temperature,
        topP,
        maxTokens,
        response,
        selectedModels,
        conversations,
        userId: user.id,
      })
    })

    return cleanup
  }, [
    user,
    input,
    isFollowUpMode,
    webSearchEnabled,
    temperature,
    topP,
    maxTokens,
    response,
    selectedModels,
    conversations,
  ])

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
              if (isCancellationError(error)) return
              logger.error('Failed to fetch anonymous credit balance:', error)
            }
          } catch (error) {
            if (isCancellationError(error)) {
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
        if (isCancellationError(error)) {
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

    fetchModelsRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by authBillingInitKey; omit `user` to avoid refreshUser() identity-only churn
  }, [isAuthenticated, authBillingInitKey, setBrowserFingerprint, setError, setUsageCount])

  useEffect(() => {
    if (!isAuthenticated) return
    const onBillingUpdated = () => {
      void (async () => {
        try {
          const balance = await getCreditBalance()
          setCreditBalance(balance)
          setUsageCount(balance.credits_used_this_period ?? 0)
        } catch (error) {
          if (isCancellationError(error)) return
          logger.error('Failed to refresh credit balance after billing update:', error)
        }
      })()
    }
    window.addEventListener(BILLING_UPDATED_EVENT, onBillingUpdated)
    return () => window.removeEventListener(BILLING_UPDATED_EVENT, onBillingUpdated)
  }, [isAuthenticated, setUsageCount])

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
      .filter(modelId =>
        isModelIdSelectableForUser(modelId, modelsByProvider, isAuthenticated, user)
      )

    const limitedModelIds = validModelIds.slice(0, maxModelsLimit)

    if (limitedModelIds.length > 0) {
      const targetMode = inferModelModeForLoadedModels(limitedModelIds, modelsByProvider, {
        textComposerAdvanced: defaultSelection.textComposerAdvanced,
        imageComposerAdvanced: defaultSelection.imageComposerAdvanced,
      })
      setModelMode(targetMode)

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

      if (targetMode === 'text' && defaultSelection.textComposerAdvanced) {
        applyTextComposerAdvancedSettings(
          defaultSelection.textComposerAdvanced,
          limitedModelIds,
          allModelsFlatForComposer,
          setTemperature,
          setTopP,
          setMaxTokens
        )
      }
      if (targetMode === 'image' && defaultSelection.imageComposerAdvanced) {
        setAspectRatio(defaultSelection.imageComposerAdvanced.aspectRatio)
        setImageSize(defaultSelection.imageComposerAdvanced.imageSize)
      }
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
    allModelsFlatForComposer,
    setSelectedModels,
    setOpenDropdowns,
    setModelMode,
    setTemperature,
    setTopP,
    setMaxTokens,
    setAspectRatio,
    setImageSize,
  ])

  useEffect(() => {
    if (authLoading || isLoadingModels || Object.keys(modelsByProvider).length === 0) {
      return
    }
    const kept = selectedModels.filter(id =>
      isModelIdSelectableForUser(id, modelsByProvider, isAuthenticated, user)
    )
    const same =
      kept.length === selectedModels.length && kept.every((id, i) => id === selectedModels[i])
    if (!same) {
      setSelectedModels(kept)
    }
  }, [
    authLoading,
    isLoadingModels,
    modelsByProvider,
    isAuthenticated,
    user,
    selectedModels,
    setSelectedModels,
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
            if (isCancellationError(error)) return
            logger.error('Failed to refetch anonymous credit balance:', error)
          })
      }
    }
  }, [browserFingerprint, isAuthenticated, user, anonymousCreditsRemaining])

  const hasAttachedImages = attachedFiles.some(
    f => 'base64Data' in f && (f as AttachedFile).base64Data
  )

  // When image is attached, auto-deselect any non-vision models so only vision-capable models remain
  useEffect(() => {
    if (!hasAttachedImages || selectedModels.length === 0) return
    const nonVisionIds = selectedModels.filter(id => !modelSupportsVision(id, modelsByProvider))
    if (nonVisionIds.length === 0) return
    setSelectedModels(prev => prev.filter(id => modelSupportsVision(id, modelsByProvider)))
    const names = getModelNames(nonVisionIds, modelsByProvider)
    const msg =
      names.length === 1
        ? `Removed ${names[0]} — it cannot process images. Please select a vision-capable model.`
        : `Removed ${names.join(', ')} — they cannot process images. Only vision-capable models are kept.`
    setVisionNoticeMessage(msg)
  }, [hasAttachedImages, selectedModels, modelsByProvider, setSelectedModels])

  // Persistent warning when image attached but selected model(s) cannot process images
  const nonVisionModelsWarning =
    hasAttachedImages && selectedModels.length > 0 && Object.keys(modelsByProvider).length > 0
      ? (() => {
          const nonVisionIds = selectedModels.filter(
            id => !modelSupportsVision(id, modelsByProvider)
          )
          if (nonVisionIds.length === 0) return null
          const names = getModelNames(nonVisionIds, modelsByProvider)
          return names.length === 1
            ? `${names[0]} cannot process images. Please select a vision-capable model from the list below or remove the image.`
            : `The following models cannot process images: ${names.join(', ')}. Please select vision-capable models from the list below or remove the image.`
        })()
      : null

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
      setTemperature,
      setTopP,
      setMaxTokens,
      hasScrolledToResultsRef,
      shouldScrollToTopAfterFormattingRef,
      clearStreamingReasoningUi,
    }
  )

  usePersistedComposerAdvancedSettings({
    isAuthenticated,
    userId: user?.id,
    temperature,
    topP,
    maxTokens,
    aspectRatio,
    imageSize,
    setTemperature,
    setTopP,
    setMaxTokens,
    setAspectRatio,
    setImageSize,
  })

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

  // Once a comparison has finished and results exist, use follow-up composer UX (no separate "Follow up" control).
  useEffect(() => {
    const hasActiveResults = conversations.length > 0 || response != null
    if (!hasActiveResults || isLoading) return
    setIsFollowUpMode(true)
    setIsModelsHidden(true)
  }, [conversations.length, response, isLoading, setIsFollowUpMode, setIsModelsHidden])

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
    clearStreamingReasoningUi()
    setConversations([])
    setResponse(null)
    setClosedCards(new Set())
    setError(null)
    setOriginalSelectedModels([])
    setIsModelsHidden(false)
    setCurrentVisibleComparisonId(null)
    setModelErrors({})
    setAttachedFiles([])

    window.scrollTo(0, 0)
    const scrollEl = document.scrollingElement ?? document.documentElement
    scrollEl.scrollTop = 0
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    const appEl = document.querySelector('.app') as HTMLElement | null
    if (appEl) appEl.scrollTop = 0
    const rootEl = document.getElementById('root')
    if (rootEl) rootEl.scrollTop = 0
  }

  const scrollConversationsToBottom = useCallback(() => {
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
  }, [])

  const streamingConfig = useMemo(
    () => ({
      auth: { isAuthenticated, user, browserFingerprint, refreshToken },
      models: { selectedModels, modelsByProvider, originalSelectedModels },
      input: {
        input,
        attachedFiles,
        accurateInputTokens,
        webSearchEnabled,
        userLocation,
        temperature,
        topP,
        maxTokens,
        modelMode,
        aspectRatio,
        imageSize,
        hasImageModels: selectedModels.some(id =>
          modelSupportsImageGeneration(id, modelsByProvider)
        ),
      },
      conversation: {
        conversations,
        isFollowUpMode,
        currentVisibleComparisonId,
      },
      credit: {
        creditBalance,
        anonymousCreditsRemaining,
        creditWarningType,
      },
      refs: {
        userCancelledRef,
        hasScrolledToResultsRef,
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
      modelErrors,
    }),
    [
      isAuthenticated,
      user,
      browserFingerprint,
      refreshToken,
      selectedModels,
      modelsByProvider,
      originalSelectedModels,
      input,
      attachedFiles,
      accurateInputTokens,
      webSearchEnabled,
      userLocation,
      temperature,
      topP,
      maxTokens,
      modelMode,
      aspectRatio,
      imageSize,
      conversations,
      isFollowUpMode,
      currentVisibleComparisonId,
      creditBalance,
      anonymousCreditsRemaining,
      creditWarningType,
      modelErrors,
      autoScrollPausedRef,
      hasScrolledToResultsRef,
      isPageScrollingRef,
      lastAlignedRoundRef,
      lastScrollTopRef,
      scrollListenersRef,
      userCancelledRef,
      userInteractingRef,
    ]
  )

  const streamingCallbacks = useMemo(
    () => ({
      state: {
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
        setStreamingReasoningByModel,
        setStreamAnswerStartedByModel,
        clearStreamingReasoningUi,
      },
      credit: {
        setAnonymousCreditsRemaining,
        setCreditBalance,
        setCreditWarningMessage,
        setCreditWarningType,
        setCreditWarningDismissible,
        setShowOverageExtend,
        dismissOverageActive,
      },
      helpers: {
        expandFiles,
        extractFileContentForStorage,
        getAttachedImagesForApi,
        setupScrollListener,
        cleanupScrollListener,
        saveConversationToLocalStorage,
        syncHistoryAfterComparison,
        loadHistoryFromAPI,
        getFirstUserMessage,
        getCreditWarningMessage,
        isLowCreditWarningDismissed,
        isOverageActiveDismissed,
        scrollConversationsToBottom,
        refreshUser,
      },
    }),
    [
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
      setStreamingReasoningByModel,
      setStreamAnswerStartedByModel,
      clearStreamingReasoningUi,
      setAnonymousCreditsRemaining,
      setCreditBalance,
      setCreditWarningMessage,
      setCreditWarningType,
      setCreditWarningDismissible,
      expandFiles,
      extractFileContentForStorage,
      getAttachedImagesForApi,
      setupScrollListener,
      cleanupScrollListener,
      saveConversationToLocalStorage,
      syncHistoryAfterComparison,
      loadHistoryFromAPI,
      getFirstUserMessage,
      getCreditWarningMessage,
      isLowCreditWarningDismissed,
      isOverageActiveDismissed,
      dismissOverageActive,
      setShowOverageExtend,
      scrollConversationsToBottom,
      refreshUser,
    ]
  )

  const { submitComparison } = useComparisonStreaming(streamingConfig, streamingCallbacks)

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

    if (isImageGenerationConfigBlocked) {
      revealImageConfigConflict()
      modelsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      const isPaid = !['unregistered', 'free'].includes(userTier)
      const ovCtx = {
        overage_enabled: creditBalance?.overage_enabled,
        overage_credits_used_this_period: creditBalance?.overage_credits_used_this_period,
        overage_limit_credits: creditBalance?.overage_limit_credits,
      }

      let warningType: 'insufficient' | 'overage_cap_hit' | 'none' = 'insufficient'
      if (isPaid && ovCtx.overage_enabled && ovCtx.overage_limit_credits != null) {
        warningType = 'overage_cap_hit'
      } else if (isPaid && !ovCtx.overage_enabled) {
        warningType = 'none'
      }

      const message = getCreditWarningMessage(warningType, userTier, 0, 0, resetAt, ovCtx)
      setError(message)
      setCreditWarningMessage(null)
      setCreditWarningType(warningType)

      return
    }

    submitComparison()
  }

  const renderUsagePreview = useCallback(() => {
    const regularToUse = selectedModels.length

    const poolExhausted =
      creditBalance !== null &&
      (creditBalance.credits_used_this_period ?? 0) >= creditBalance.credits_allocated
    const overageActive = poolExhausted && creditBalance?.overage_enabled === true
    const overageUsed = creditBalance?.overage_credits_used_this_period ?? 0
    const overageCost = (overageUsed * OVERAGE_USD_PER_CREDIT).toFixed(2)
    const overageLimit = creditBalance?.overage_limit_credits

    let creditsLabel: React.ReactNode
    if (overageActive) {
      const usagePart =
        overageLimit != null
          ? `${overageUsed.toLocaleString()} / ${overageLimit.toLocaleString()}`
          : `${overageUsed.toLocaleString()}`
      creditsLabel = (
        <>
          <strong>{usagePart}</strong> overage credits used (${overageCost})
        </>
      )
    } else {
      creditsLabel = (
        <>
          <strong>{Math.round(creditsRemaining)}</strong> credits remaining
        </>
      )
    }

    return (
      <div
        style={{
          marginTop: '0.5rem',
          fontSize: '0.825rem',
        }}
      >
        <span className="credits-remaining-wrapper">
          <span>
            <strong>{regularToUse}</strong> {regularToUse === 1 ? 'model' : 'models'} selected
            {' • '}
          </span>
          <Link to="/faq#credits-system" className="credits-remaining-link">
            {creditsLabel}
          </Link>
          <button
            type="button"
            className="credits-info-trigger"
            onClick={e => {
              e.preventDefault()
              setShowCreditsInfoModal(true)
            }}
            aria-label="Learn about credits"
          >
            <span className="credits-info-tooltip" role="tooltip">
              {CREDITS_MESSAGE}
            </span>
            <svg
              className="credits-info-icon"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
        </span>
      </div>
    )
  }, [selectedModels, creditsRemaining, creditBalance, setShowCreditsInfoModal])

  return (
    <div className="app">
      {user?.mock_mode_enabled && (
        <MockModeBanner isAnonymous={false} isDev={import.meta.env.DEV} />
      )}

      {!authLoading && !user && anonymousMockModeEnabled && (
        <MockModeBanner isAnonymous={true} isDev={true} />
      )}

      <>
        {showDoneSelectingCard && (
          <DoneSelectingCard onDone={handleDoneSelecting} onClose={handleDismissDoneSelecting} />
        )}

        <Navigation
          isAuthenticated={isAuthenticated}
          isAdmin={user?.is_admin || false}
          currentView={currentView}
          onViewChange={view => navigate(view === 'admin' ? '/admin' : '/')}
          onSignInClick={openLogin}
          onSignUpClick={openRegister}
          hideNavThemeToggleOnMobile
        />

        {/* Eager load: lazy ModalManager + Vite dev could load a second React copy and break hooks in modals. */}
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
          modelTypeConflictType={modelTypeConflictType}
          onModelTypeConflictModalClose={() => setModelTypeConflictType(null)}
          imageConfigConflict={imageConfigConflict}
          aspectRatio={aspectRatio}
          imageSize={imageSize}
          modelsByProvider={modelsByProvider}
          onImageConfigConflictClose={() => {
            setModelsDropdownOpen('advanced')
            setImageConfigConflict(prev => {
              if (prev.conflictType === 'no-common-config') {
                imageConflictImpossibleDismissedKeyRef.current = [...selectedModels]
                  .sort()
                  .join(',')
              }
              return {
                conflictType: null,
                incompatibleModelIds: [],
                allImageModelIds: undefined,
              }
            })
          }}
        />

        <CreditsInfoModal
          isOpen={showCreditsInfoModal}
          onClose={() => setShowCreditsInfoModal(false)}
        />

        <ComparisonPageContent
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
          modelsByProvider={filteredModelsByProvider}
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
            onRemoveAttachedImages,
          }}
          webSearchEnabled={webSearchEnabled}
          onWebSearchEnabledChange={setWebSearchEnabled}
          modelsSectionRef={modelsSectionRef}
          creditWarningMessage={creditWarningMessage}
          creditWarningMessageRef={creditWarningMessageRef}
          creditWarningDismissible={creditWarningDismissible}
          creditBalance={creditBalance}
          onDismissCreditWarning={() => {
            if (creditWarningType === 'overage_active') {
              dismissOverageActive(creditBalance?.credits_reset_at)
            } else {
              const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
              const periodType =
                userTier === 'unregistered' || userTier === 'free' ? 'daily' : 'monthly'
              dismissLowCreditWarning(userTier, periodType, creditBalance?.credits_reset_at)
            }
          }}
          showOverageExtend={showOverageExtend}
          onOverageExtended={() => {
            setShowOverageExtend(false)
            setCreditWarningMessage(null)
            setCreditWarningType('none')
          }}
          error={error}
          errorMessageRef={errorMessageRef}
          visionNoticeMessage={visionNoticeMessage}
          onDismissVisionNotice={() => setVisionNoticeMessage(null)}
          onOpenHelpMeChoose={openHelpMeChoose}
          imageGenerationSubmitBlocked={isImageGenerationConfigBlocked}
          imageGenerationNoSharedImageOptions={imageGenerationNoSharedImageOptions}
          onImageGenerationSubmitBlockedTap={revealImageConfigConflict}
          carouselProviders={carouselProviders}
          onCarouselProviderClick={handleCarouselProviderClick}
          modelsAreaProps={{
            hasAttachedImages,
            nonVisionModelsWarning,
            onOpenHelpMeChoose: openHelpMeChoose,
            helpMeChooseScrollCategoryId,
            onHelpMeChooseScrollCategoryDone: clearHelpMeChooseScrollCategory,
            onRemoveAttachedImages,
            modelMode,
            onModelModeChange: handleModelModeChange,
            modelsByProvider: filteredModelsByProvider,
            allModelsByProvider: modelsByProvider,
            imageModelsDisabledForUnregistered: modelMode === 'image' && !isAuthenticated,
            selectedModels,
            originalSelectedModels,
            openDropdowns,
            allModels,
            isLoadingModels,
            isLoading,
            isFollowUpMode,
            maxModelsLimit,
            hidePremiumModels,
            isModelsHidden,
            isAuthenticated,
            user,
            isWideLayout,
            isMobileLayout,
            response,
            conversations,
            modelsSectionRef,
            selectedModelsGridRef,
            onToggleDropdown: toggleDropdown,
            onToggleModel: modelId => {
              const wouldAdd = !selectedModels.includes(modelId)
              if (
                wouldAdd &&
                hasAttachedImages &&
                !modelSupportsVision(modelId, modelsByProvider)
              ) {
                setVisionNoticeMessage(
                  'This model cannot process images. Select a vision-capable model.'
                )
                return
              }
              if (wouldAdd) {
                const isImageGen = modelSupportsImageGeneration(modelId, modelsByProvider)
                const hasImageGen = selectedModels.some(id =>
                  modelSupportsImageGeneration(id, modelsByProvider)
                )
                const hasTextOnly = selectedModels.some(
                  id => !modelSupportsImageGeneration(id, modelsByProvider)
                )
                if (isImageGen && hasTextOnly) {
                  setModelTypeConflictType('text-to-image')
                  return
                }
                if (!isImageGen && hasImageGen) {
                  setModelTypeConflictType('image-to-text')
                  return
                }
              }
              handleModelToggle(modelId)
              if (wouldAdd) {
                const isImageGen = modelSupportsImageGeneration(modelId, modelsByProvider)
                setModelMode(isImageGen ? 'image' : 'text')
              }
            },
            onApplyCategoryPreset: modelIds => {
              const idsToApply = hasAttachedImages
                ? modelIds.filter(id => modelSupportsVision(id, modelsByProvider))
                : modelIds
              if (hasAttachedImages && idsToApply.length < modelIds.length) {
                setVisionNoticeMessage(
                  'Some models from this category cannot process images and were not added.'
                )
              }
              if (hasAttachedImages && idsToApply.length === 0) {
                setVisionNoticeMessage(
                  'No vision-capable models in this category. Try "Best for vision".'
                )
                return
              }
              const finalIds = idsToApply.length > 0 ? idsToApply : modelIds
              const allImageGen = finalIds.every(id =>
                modelSupportsImageGeneration(id, modelsByProvider)
              )
              const allText = finalIds.every(
                id => !modelSupportsImageGeneration(id, modelsByProvider)
              )
              if (allImageGen) setModelMode('image')
              else if (allText) setModelMode('text')
              handleApplyRecommendation(finalIds)
            },
            onToggleAllForProvider: toggleAllForProvider,
            onToggleModelsHidden: () => setIsModelsHidden(!isModelsHidden),
            onToggleHidePremiumModels: () => setHidePremiumModels(!hidePremiumModels),
            onShowPremiumModelsModal: () => setShowPremiumModelsToggleModal(true),
            onCollapseAllDropdowns: collapseAllDropdowns,
            onShowDisabledButtonInfo: setDisabledButtonInfo,
            onClearAllModels: () => setSelectedModels([]),
            onSetDefaultSelectionOverridden: setDefaultSelectionOverridden,
            onClearConversations: () => {
              clearStreamingReasoningUi()
              setConversations([])
            },
            onClearResponse: () => setResponse(null),
            onExpandModelsSection: () => setIsModelsHidden(false),
            onError: setError,
            onShowDisabledModelModal: info => setDisabledModelModalInfo(info),
            onRetryModels: () => refetchModels(true),
            temperature,
            onTemperatureChange: setTemperature,
            topP,
            onTopPChange: setTopP,
            maxTokens,
            onMaxTokensChange: setMaxTokens,
            advancedSettings: { temperature, topP, maxTokens },
            maxTokensCap: effectiveMaxTokens,
            modelsDropdownOpen,
            onModelsDropdownChange: handleModelsDropdownChange,
            showImageConfig:
              modelMode === 'image' ||
              selectedModels.some(id => modelSupportsImageGeneration(id, modelsByProvider)),
            aspectRatio,
            onAspectRatioChange: handleAspectRatioChange,
            imageSize,
            onImageSizeChange: handleImageSizeChange,
            ...imageConfigOptions,
          }}
          onCancel={handleCancel}
          showResults={!!(response || conversations.length > 0)}
          showFloatingComposer={
            isFollowUpMode &&
            ((response?.metadata?.models_successful ?? 0) >= 1 ||
              conversations.some(c =>
                c.messages?.some(
                  m =>
                    m.type === 'assistant' &&
                    (m.content || '').trim().length > 0 &&
                    !isErrorMessage(m.content)
                )
              ))
          }
          resultsAreaProps={{
            conversations,
            closedCards,
            allModels: allModelsFlatForComposer,
            activeResultTabs,
            modelProcessingStates,
            modelErrorStates,
            breakoutPhase,
            isScrollLocked,
            showExportMenu,
            isMobileLayout,
            exportMenuRef,
            onToggleScrollLock: () => setIsScrollLocked(!isScrollLocked),
            onToggleExportMenu: () => setShowExportMenu(!showExportMenu),
            onExport: handleExport,
            onShowAllResults: showAllResults,
            onScreenshot: handleScreenshot,
            onCopyResponse: handleCopyResponse,
            onCloseCard: closeResultCard,
            onSwitchTab: switchResultTab,
            onBreakout: handleBreakout,
            onHideOthers: hideAllOtherModels,
            onCopyMessage: handleCopyMessage,
            streamingReasoningByModel: effectiveStreamingReasoningByModel,
            streamAnswerStartedByModel,
          }}
        />
      </>
    </div>
  )
}
