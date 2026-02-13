/**
 * useComparisonStreaming - Core streaming logic for AI model comparisons
 *
 * ## Why This Hook Exists
 *
 * This hook was extracted from App.tsx to isolate the complex streaming logic
 * from UI state management. The comparison flow involves multiple async operations,
 * timeout handling, partial result recovery, and coordinated state updates that
 * would make App.tsx unmaintainable if left inline (~2000 lines of logic).
 *
 * ## Key Design Decisions
 *
 * ### 1. Server-Sent Events (SSE) over WebSockets
 * We use SSE because:
 * - One-way communication is sufficient (server → client)
 * - Built-in reconnection via EventSource API
 * - Works with standard HTTP infrastructure and proxies
 * - Simpler protocol for our use case
 *
 * ### 2. Timeout with Activity Detection
 * The timeout system uses a "no activity" approach rather than a hard deadline:
 * - Timer only runs when NO model has sent data in the last 5 seconds
 * - Keepalive events from the backend reset the timeout
 * - This allows slow models to complete without penalizing users
 *
 * ### 3. Partial Result Recovery
 * When errors occur (timeout, network failure, etc.):
 * - Successfully completed model responses are preserved
 * - Partial streaming content is saved
 * - Users don't lose progress on multi-model comparisons
 *
 * ### 4. Credit System Integration
 * Credits are updated from multiple sources for reliability:
 * - COMPLETE event from stream includes credits_remaining
 * - Fallback API calls refresh balance if stream metadata is missing
 * - Low credit warnings are shown based on percentage thresholds
 *
 * ## Event Flow
 *
 * ```
 * POST /api/compare-stream
 *     │
 *     ▼
 * SSE Events:
 *   START(model)   → Initialize conversation card
 *   CHUNK(model)   → Append content, auto-scroll
 *   KEEPALIVE      → Reset timeout (model is working)
 *   DONE(model)    → Mark complete, switch to formatted view
 *   COMPLETE       → All done, update credits, save history
 *   ERROR          → Handle failure, save partial results
 * ```
 *
 * ## State Dependencies
 *
 * This hook receives all required state via config/callbacks to avoid
 * circular dependencies and make the data flow explicit. The parent
 * component (App.tsx) owns the state; this hook orchestrates mutations.
 *
 * @example
 * ```typescript
 * const { submitComparison, cancelComparison } = useComparisonStreaming({
 *   // Config: all input state
 *   isAuthenticated,
 *   user,
 *   selectedModels,
 *   input,
 *   // ...etc
 * }, {
 *   // Callbacks: all state setters and helpers
 *   setConversations,
 *   setError,
 *   // ...etc
 * });
 *
 * // In submit handler:
 * await submitComparison();
 *
 * // In cancel handler:
 * cancelComparison();
 * ```
 *
 * @see UseComparisonStreamingConfig - Input configuration interface
 * @see UseComparisonStreamingCallbacks - State update callbacks
 */

import { useCallback, useRef } from 'react'

import type { AttachedFile, StoredAttachedFile } from '../components/comparison'
import { getCreditAllocation, getDailyCreditLimit } from '../config/constants'
import { apiClient } from '../services/api/client'
import { ApiError, PaymentRequiredError } from '../services/api/errors'
import { compareStream, getRateLimitStatus } from '../services/compareService'
import { getCreditBalance } from '../services/creditService'
import type { CreditBalance } from '../services/creditService'
import type {
  CompareResponse,
  ConversationMessage,
  ModelConversation,
  ActiveResultTabs,
  ModelsByProvider,
} from '../types'
import { RESULT_TAB, createModelId, createMessageId } from '../types'
import { formatNumber } from '../utils'
import { isErrorMessage } from '../utils/error'

/**
 * Tutorial state passed to streaming hook
 * Used to adjust scroll behavior during tutorial steps
 */
interface TutorialState {
  /** Whether the tutorial is currently active */
  isActive: boolean
  /** Current tutorial step identifier (e.g., 'submit-comparison') */
  currentStep: string | null
}

/**
 * Configuration for the streaming hook
 *
 * All values are read-only inputs that the hook uses but doesn't modify.
 * State modifications happen through the callbacks interface.
 */
export interface UseComparisonStreamingConfig {
  // User/Auth state
  isAuthenticated: boolean
  user: {
    is_verified?: boolean
    subscription_tier?: string
    monthly_credits_allocated?: number
    billing_period_start?: string
    billing_period_end?: string
    credits_reset_at?: string
    total_credits_used?: number
  } | null
  browserFingerprint: string

  // Model state
  selectedModels: string[]
  modelsByProvider: ModelsByProvider
  originalSelectedModels: string[]

  // Input state
  input: string
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  accurateInputTokens: number | null
  webSearchEnabled: boolean
  imageGenerationEnabled: boolean
  userLocation: string | null

  // Conversation state
  conversations: ModelConversation[]
  isFollowUpMode: boolean
  currentVisibleComparisonId: string | number | null

  // Credit state
  creditBalance: CreditBalance | null
  anonymousCreditsRemaining: number | null
  creditWarningType: 'none' | 'low' | 'insufficient'

  // Model errors state
  modelErrors: { [key: string]: boolean }

  // Tutorial state
  tutorialState: TutorialState

  // Refs
  userCancelledRef: React.MutableRefObject<boolean>
  hasScrolledToResultsRef: React.MutableRefObject<boolean>
  hasScrolledToResultsOnFirstChunkRef: React.MutableRefObject<boolean>
  scrolledToTopRef: React.MutableRefObject<Set<string>>
  shouldScrollToTopAfterFormattingRef: React.MutableRefObject<boolean>
  autoScrollPausedRef: React.MutableRefObject<Set<string>>
  userInteractingRef: React.MutableRefObject<Set<string>>
  lastScrollTopRef: React.MutableRefObject<Map<string, number>>
  lastAlignedRoundRef: React.MutableRefObject<number>
  isPageScrollingRef: React.MutableRefObject<boolean>
  scrollListenersRef: React.MutableRefObject<
    Map<
      string,
      {
        scroll: () => void
        wheel: (e: WheelEvent) => void
        touchstart: () => void
        mousedown: () => void
      }
    >
  >
  lastSubmittedInputRef: React.MutableRefObject<string>
}

/**
 * Callbacks for state updates during streaming
 *
 * ## Why Callbacks Instead of Direct State Access?
 *
 * The hook receives setters as callbacks rather than using useState internally because:
 * 1. **Single source of truth:** App.tsx owns all state; hook coordinates mutations
 * 2. **Testability:** Callbacks can be mocked for unit testing
 * 3. **Flexibility:** Parent can intercept/transform updates if needed
 * 4. **Explicit dependencies:** Clear contract of what the hook can modify
 */
export interface UseComparisonStreamingCallbacks {
  // State setters
  setError: (error: string | null) => void
  setIsLoading: (loading: boolean) => void
  setResponse: (response: CompareResponse | null) => void
  setProcessingTime: (time: number | null) => void
  setClosedCards: (cards: Set<string>) => void
  setModelErrors: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  setActiveResultTabs: React.Dispatch<React.SetStateAction<ActiveResultTabs>>
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setInput: (input: string) => void
  setIsModelsHidden: (hidden: boolean) => void
  setShowDoneSelectingCard: (show: boolean) => void
  setUserMessageTimestamp: (timestamp: string) => void
  setCurrentAbortController: (controller: AbortController | null) => void
  setOriginalSelectedModels: (models: string[]) => void
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>
  setAlreadyBrokenOutModels: (models: Set<string>) => void
  setIsScrollLocked: (locked: boolean) => void
  setUsageCount: React.Dispatch<React.SetStateAction<number>>
  setIsFollowUpMode: (mode: boolean) => void

  // Credit state setters
  setAnonymousCreditsRemaining: (credits: number | null) => void
  setCreditBalance: (balance: CreditBalance | null) => void
  setCreditWarningMessage: (message: string | null) => void
  setCreditWarningType: (type: 'none' | 'low' | 'insufficient') => void
  setCreditWarningDismissible: (dismissible: boolean) => void

  // Helper functions
  expandFiles: (files: (AttachedFile | StoredAttachedFile)[], text: string) => Promise<string>
  extractFileContentForStorage: (
    files: AttachedFile[]
  ) => Promise<Array<{ name: string; content: string; placeholder: string }>>
  setupScrollListener: (modelId: string) => boolean
  cleanupScrollListener: (modelId: string) => void
  saveConversationToLocalStorage: (
    inputData: string,
    models: string[],
    conversations: ModelConversation[],
    isUpdate: boolean,
    fileContents?: Array<{ name: string; content: string; placeholder: string }>
  ) => string | null
  syncHistoryAfterComparison: (input: string, models: string[]) => Promise<void>
  loadHistoryFromAPI: () => Promise<void>
  getFirstUserMessage: () => ConversationMessage | undefined
  getCreditWarningMessage: (
    type: 'low' | 'insufficient' | 'none',
    tier: string,
    remaining: number,
    estimated?: number,
    resetAt?: string
  ) => string
  isLowCreditWarningDismissed: (
    tier: string,
    periodType: 'daily' | 'monthly',
    resetAt?: string
  ) => boolean
  scrollConversationsToBottom: () => void
  refreshUser: () => Promise<void>
}

/**
 * Return type for the streaming hook
 */
export interface UseComparisonStreamingReturn {
  /**
   * Submit a comparison request to the API
   *
   * Performs validation, opens SSE connection, processes events,
   * updates state in real-time, and handles errors/partial results.
   *
   * @throws Never throws - errors are set via setError callback
   */
  submitComparison: () => Promise<void>

  /**
   * Cancel an in-progress comparison
   *
   * Aborts the SSE connection and preserves any partial results.
   * Safe to call even if no comparison is in progress.
   */
  cancelComparison: () => void
}

/**
 * Create a conversation message with a unique ID
 *
 * @param type - 'user' for prompts, 'assistant' for model responses
 * @param content - Message text content
 * @param customTimestamp - Optional ISO timestamp (defaults to now)
 * @returns ConversationMessage with unique ID
 */
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

/**
 * Simple token estimation using character-based heuristic
 *
 * Uses the common approximation of ~4 characters per token.
 * This is used for output_tokens when the API doesn't provide exact counts.
 *
 * Note: For accurate input token counting, we use the /api/estimate-tokens
 * endpoint which has provider-specific tokenizers.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count (minimum 1 for non-empty text)
 */
const estimateTokensSimple = (text: string): number => {
  if (!text || !text.trim()) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * Hook for managing AI model comparison streaming
 *
 * @param config - Read-only configuration values (state, refs, user info)
 * @param callbacks - State setters and helper functions for mutations
 * @returns Object with submitComparison and cancelComparison functions
 */
export function useComparisonStreaming(
  config: UseComparisonStreamingConfig,
  callbacks: UseComparisonStreamingCallbacks
): UseComparisonStreamingReturn {
  /** Tracks the current AbortController for cancellation support */
  const currentAbortControllerRef = useRef<AbortController | null>(null)

  const {
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
    imageGenerationEnabled,
    userLocation,
    conversations,
    isFollowUpMode,
    currentVisibleComparisonId,
    creditBalance,
    creditWarningType,
    modelErrors,
    tutorialState,
    userCancelledRef,
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
  } = config

  const {
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
  } = callbacks

  // Helper to check if a model has failed
  const isModelFailed = useCallback(
    (modelId: string): boolean => {
      const formattedModelId = createModelId(modelId)

      // Check if model has error flag (check both raw and formatted IDs)
      if (modelErrors[modelId] === true || modelErrors[formattedModelId] === true) {
        return true
      }

      // Check if model has error content in conversation
      const conversation = conversations.find(
        conv => conv.modelId === modelId || conv.modelId === formattedModelId
      )
      if (conversation) {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        if (lastMessage?.type === 'assistant' && isErrorMessage(lastMessage.content)) {
          return true
        }
      }

      return false
    },
    [modelErrors, conversations]
  )

  // Helper to get successful models (filter out failed ones)
  const getSuccessfulModels = useCallback(
    (models: string[]): string[] => {
      return models.filter(modelId => !isModelFailed(modelId))
    },
    [isModelFailed]
  )

  const cancelComparison = useCallback(() => {
    if (currentAbortControllerRef.current) {
      userCancelledRef.current = true
      currentAbortControllerRef.current.abort()
      currentAbortControllerRef.current = null
    }
    setIsLoading(false)
    setCurrentAbortController(null)
  }, [setIsLoading, setCurrentAbortController, userCancelledRef])

  const submitComparison = useCallback(async () => {
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
      setCurrentVisibleComparisonId(null)
      // Clear already broken out models for new comparison
      setAlreadyBrokenOutModels(new Set())

      setOriginalSelectedModels([...selectedModels])

      // If there's an active conversation and we're starting a new one, save the previous one first
      if (!isAuthenticated && conversations.length > 0) {
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
          const allUserMessages = conversationsWithMessages
            .flatMap(conv => conv.messages)
            .filter(msg => msg.type === 'user')
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

          const firstUserMessage = allUserMessages[0]

          if (firstUserMessage) {
            const inputData = firstUserMessage.content
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
    let apiConversationHistory: Array<{
      role: 'user' | 'assistant'
      content: string
      model_id?: string
    }> = []

    if (isFollowUpMode && conversations.length > 0) {
      const successfulSelectedModels = getSuccessfulModels(selectedModels)

      const selectedConversations = conversations.filter(conv => {
        if (!successfulSelectedModels.includes(conv.modelId)) return false
        if (isModelFailed(conv.modelId)) return false
        return true
      })

      if (selectedConversations.length > 0) {
        const allMessages: Array<{
          role: 'user' | 'assistant'
          content: string
          model_id?: string
          timestamp: string
        }> = []

        selectedConversations.forEach(conv => {
          conv.messages.forEach(msg => {
            allMessages.push({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content,
              model_id: msg.type === 'assistant' ? conv.modelId : undefined,
              timestamp: msg.timestamp,
            })
          })
        })

        // Deduplicate user messages
        const seenUserMessages = new Set<string>()
        const deduplicatedMessages: typeof allMessages = []

        const sortedMessages = [...allMessages].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )

        sortedMessages.forEach(msg => {
          if (msg.role === 'user') {
            const key = `${msg.content}-${Math.floor(new Date(msg.timestamp).getTime() / 1000)}`
            if (!seenUserMessages.has(key)) {
              seenUserMessages.add(key)
              deduplicatedMessages.push(msg)
            }
          } else {
            deduplicatedMessages.push(msg)
          }
        })

        // Expand file placeholders in user messages
        const expandedMessages = await Promise.all(
          deduplicatedMessages.map(async msg => {
            if (msg.role === 'user' && attachedFiles.length > 0) {
              const hasPlaceholder = attachedFiles.some(f => msg.content.includes(f.placeholder))
              if (hasPlaceholder) {
                const expandedContent = await expandFiles(attachedFiles, msg.content)
                return {
                  role: msg.role,
                  content: expandedContent,
                  model_id: msg.model_id,
                }
              }
            }
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

    setIsLoading(true)
    setError(null)
    // Clear insufficient/low credit warnings on submission
    if (creditWarningType === 'insufficient' || creditWarningType === 'low') {
      setCreditWarningMessage(null)
      setCreditWarningType('none')
      setCreditWarningDismissible(false)
    }
    setIsModelsHidden(true)
    setShowDoneSelectingCard(false)

    // Capture user timestamp when they actually submit
    const userTimestamp = new Date().toISOString()
    setUserMessageTimestamp(userTimestamp)

    setResponse(null)
    setClosedCards(new Set())
    setProcessingTime(null)
    userCancelledRef.current = false
    hasScrolledToResultsOnFirstChunkRef.current = false
    scrolledToTopRef.current.clear()
    shouldScrollToTopAfterFormattingRef.current = false
    autoScrollPausedRef.current.clear()
    userInteractingRef.current.clear()
    lastScrollTopRef.current.clear()
    lastAlignedRoundRef.current = 0
    setIsScrollLocked(false)

    // Clean up any existing scroll listeners from previous comparison
    scrollListenersRef.current.forEach((_listener, modelId) => {
      cleanupScrollListener(modelId)
    })

    const startTime = Date.now()

    // Timeout configuration
    const TIMEOUT_DURATION = 60000 // 1 minute
    const ACTIVE_STREAMING_WINDOW = 5000 // 5 seconds

    // Declare streaming variables outside try block so they're accessible in catch block
    const streamingResults: { [key: string]: string } = {}
    const completedModels = new Set<string>()
    const localModelErrors: { [key: string]: boolean } = {}
    const modelStartTimes: { [key: string]: string } = {}
    const modelCompletionTimes: { [key: string]: string } = {}
    let streamingMetadata: CompareResponse['metadata'] | null = null

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const modelLastChunkTimes: { [key: string]: number } = {}

    try {
      const controller = new AbortController()
      currentAbortControllerRef.current = controller
      setCurrentAbortController(controller)

      const conversationId =
        isAuthenticated && currentVisibleComparisonId
          ? typeof currentVisibleComparisonId === 'string'
            ? parseInt(currentVisibleComparisonId, 10)
            : currentVisibleComparisonId
          : null

      // Timeout function: timer only runs when there's no streaming activity
      const resetStreamingTimeout = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
          return
        }

        const now = Date.now()

        const hasActiveStreaming = selectedModels.some(modelId => {
          if (!modelId || completedModels.has(modelId)) return false
          const lastChunkTime =
            modelLastChunkTimes[modelId] || modelLastChunkTimes[createModelId(modelId)]
          return lastChunkTime !== undefined && now - lastChunkTime < ACTIVE_STREAMING_WINDOW
        })

        const allModelsCompleted = completedModels.size === selectedModels.length

        if (allModelsCompleted) return
        if (hasActiveStreaming) return

        timeoutId = setTimeout(() => {
          try {
            if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
              return
            }

            const checkNow = Date.now()
            const stillHasActiveStreaming = selectedModels.some(modelId => {
              if (!modelId || completedModels.has(modelId)) return false
              const lastChunkTime =
                modelLastChunkTimes[modelId] || modelLastChunkTimes[createModelId(modelId)]
              return (
                lastChunkTime !== undefined && checkNow - lastChunkTime < ACTIVE_STREAMING_WINDOW
              )
            })

            const allModelsCompletedNow = completedModels.size === selectedModels.length

            if (allModelsCompletedNow) return

            if (stillHasActiveStreaming) {
              resetStreamingTimeout()
            } else {
              controller.abort()
            }
          } catch (error) {
            console.error('Error in streaming timeout callback:', error)
            controller.abort()
          }
        }, TIMEOUT_DURATION)
      }

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

      lastSubmittedInputRef.current = expandedInput

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const modelsToUse = isFollowUpMode ? getSuccessfulModels(selectedModels) : selectedModels

      if (userLocation) {
        console.log('[API Request] Sending user location:', userLocation)
      } else {
        console.debug('[API Request] No user location available (will use IP-based fallback)')
      }

      const stream = await compareStream(
        {
          input_data: expandedInput,
          models: modelsToUse,
          conversation_history: apiConversationHistory,
          browser_fingerprint: browserFingerprint,
          conversation_id: conversationId || undefined,
          estimated_input_tokens: accurateInputTokens || undefined,
          timezone: userTimezone,
          location: userLocation || undefined,
          enable_web_search: webSearchEnabled || false,
          enable_image_generation: imageGenerationEnabled || false,
        },
        controller.signal
      )

      if (!stream) {
        throw new Error('Failed to start streaming comparison')
      }

      const reader = stream.getReader()
      const decoder = new TextDecoder()

      let lastUpdateTime = Date.now()
      const UPDATE_THROTTLE_MS = 50

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
            createMessage('user', input, userTimestamp),
            createMessage('assistant', '', userTimestamp),
          ],
        }))
        setConversations(emptyConversations)
      }

      const listenersSetUp = new Set<string>()
      let streamError: Error | null = null

      if (reader) {
        try {
          let buffer = ''

          while (true) {
            if (controller.signal.aborted || userCancelledRef.current) {
              reader.cancel()
              break
            }

            const { done, value } = await reader.read()

            if (done) break

            if (streamError) break

            if (controller.signal.aborted || userCancelledRef.current) {
              reader.cancel()
              break
            }

            buffer += decoder.decode(value, { stream: true })
            resetStreamingTimeout()

            const messages = buffer.split('\n\n')
            buffer = messages.pop() || ''

            let shouldUpdate = false

            for (const message of messages) {
              if (controller.signal.aborted || userCancelledRef.current) {
                reader.cancel()
                break
              }

              if (!message.trim() || !message.startsWith('data: ')) continue

              try {
                const jsonStr = message.replace(/^data: /, '')
                const event = JSON.parse(jsonStr)

                if (event.type === 'start') {
                  if (!streamingResults[event.model]) {
                    streamingResults[event.model] = ''
                  }
                  modelStartTimes[event.model] = new Date().toISOString()
                  shouldUpdate = true
                } else if (event.type === 'chunk') {
                  streamingResults[event.model] =
                    (streamingResults[event.model] || '') + event.content
                  modelLastChunkTimes[event.model] = Date.now()
                  resetStreamingTimeout()
                  shouldUpdate = true

                  // Scroll to Comparison Results section on first chunk
                  const isTutorialSubmitStep =
                    tutorialState.isActive &&
                    (tutorialState.currentStep === 'submit-comparison' ||
                      tutorialState.currentStep === 'submit-comparison-2')
                  if (!hasScrolledToResultsOnFirstChunkRef.current && !isTutorialSubmitStep) {
                    hasScrolledToResultsOnFirstChunkRef.current = true
                    requestAnimationFrame(() => {
                      setTimeout(() => {
                        const resultsSection = document.querySelector('.results-section')
                        if (resultsSection) {
                          resultsSection.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          })
                        }
                      }, 100)
                    })
                  }

                  // Set up scroll listener on first chunk
                  if (!listenersSetUp.has(event.model)) {
                    listenersSetUp.add(event.model)

                    const trySetup = (attempt: number, maxAttempts: number) => {
                      const delay = attempt * 50
                      requestAnimationFrame(() => {
                        setTimeout(() => {
                          const success = setupScrollListener(event.model)
                          if (!success && attempt < maxAttempts) {
                            trySetup(attempt + 1, maxAttempts)
                          }
                        }, delay)
                      })
                    }

                    trySetup(1, 4)
                  }
                } else if (event.type === 'keepalive') {
                  if (event.model) {
                    modelLastChunkTimes[event.model] = Date.now()
                    resetStreamingTimeout()
                  }
                } else if (event.type === 'done') {
                  completedModels.add(event.model)
                  modelCompletionTimes[event.model] = new Date().toISOString()
                  const hasError = event.error === true
                  localModelErrors[event.model] = hasError
                  setModelErrors(prev => ({ ...prev, [event.model]: hasError }))
                  shouldUpdate = true

                  resetStreamingTimeout()
                  autoScrollPausedRef.current.delete(event.model)

                  // Switch completed successful models to formatted view immediately
                  const modelContent = streamingResults[event.model] || ''
                  const isModelError = hasError || isErrorMessage(modelContent)
                  if (!isModelError) {
                    setActiveResultTabs(prev => ({
                      ...prev,
                      [event.model]: RESULT_TAB.FORMATTED,
                    }))
                  }

                  // Check if ALL models are done
                  if (completedModels.size === selectedModels.length) {
                    const formattedTabs: ActiveResultTabs = {} as ActiveResultTabs
                    selectedModels.forEach(modelId => {
                      formattedTabs[createModelId(modelId)] = RESULT_TAB.FORMATTED
                    })
                    setActiveResultTabs(formattedTabs)

                    if (!isFollowUpMode) {
                      shouldScrollToTopAfterFormattingRef.current = true
                    }

                    // Refresh credits when all models complete
                    const hasSuccessfulModels = selectedModels.some(modelId => {
                      const createdModelId = createModelId(modelId)
                      const hasCompleted = completedModels.has(createdModelId)
                      const hasError = localModelErrors[createdModelId] === true
                      const content = streamingResults[createdModelId] || ''
                      const isError = isErrorMessage(content)
                      return hasCompleted && !hasError && !isError && content.trim().length > 0
                    })

                    if (hasSuccessfulModels) {
                      setTimeout(() => {
                        if (isAuthenticated) {
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
                        }
                      }, 500)
                    }
                  }
                } else if (event.type === 'complete') {
                  streamingMetadata = event.metadata
                  const endTime = Date.now()
                  setProcessingTime(endTime - startTime)
                  shouldUpdate = true

                  // Handle credit updates
                  if (
                    streamingMetadata?.credits_remaining !== undefined ||
                    streamingMetadata?.credits_used !== undefined
                  ) {
                    if (isAuthenticated) {
                      if (streamingMetadata.credits_remaining !== undefined) {
                        if (creditBalance) {
                          setCreditBalance({
                            ...creditBalance,
                            credits_remaining: streamingMetadata.credits_remaining,
                            credits_used_this_period:
                              creditBalance.credits_allocated - streamingMetadata.credits_remaining,
                          })
                        } else if (user) {
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
                      refreshUser()
                        .then(() => getCreditBalance())
                        .then(balance => {
                          setCreditBalance(balance)
                          const userTier = user?.subscription_tier || 'free'
                          const remainingPercent =
                            balance.credits_allocated > 0
                              ? (balance.credits_remaining / balance.credits_allocated) * 100
                              : 100
                          const periodType =
                            userTier === 'unregistered' || userTier === 'free' ? 'daily' : 'monthly'
                          const lowCreditThreshold =
                            userTier === 'unregistered' || userTier === 'free' ? 20 : 10

                          if (balance.credits_remaining <= 0) {
                            if (isFollowUpMode) {
                              setIsFollowUpMode(false)
                            }
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
                              setCreditWarningType('none')
                              setCreditWarningDismissible(false)
                            }
                          } else {
                            setCreditWarningMessage(null)
                            setCreditWarningType('none')
                            setCreditWarningDismissible(false)
                          }
                        })
                        .catch(error =>
                          console.error('Failed to refresh user credit balance:', error)
                        )
                    } else {
                      // For unregistered users
                      if (streamingMetadata.credits_remaining !== undefined) {
                        const metadataCreditsRemaining = streamingMetadata.credits_remaining
                        setAnonymousCreditsRemaining(metadataCreditsRemaining)

                        const allocated =
                          creditBalance?.credits_allocated ?? getDailyCreditLimit('unregistered')
                        setCreditBalance({
                          credits_allocated: allocated,
                          credits_used_today: allocated - metadataCreditsRemaining,
                          credits_remaining: metadataCreditsRemaining,
                          period_type: 'daily',
                          subscription_tier: 'unregistered',
                        })

                        const remainingPercent =
                          allocated > 0 ? (metadataCreditsRemaining / allocated) * 100 : 100
                        const userTier = 'unregistered'
                        const periodType = 'daily'
                        const lowCreditThreshold = 20

                        if (metadataCreditsRemaining <= 0) {
                          if (isFollowUpMode) {
                            setIsFollowUpMode(false)
                          }
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
                            setCreditWarningType('none')
                            setCreditWarningDismissible(false)
                          }
                        } else {
                          setCreditWarningMessage(null)
                          setCreditWarningType('none')
                          setCreditWarningDismissible(false)
                        }

                        getCreditBalance(browserFingerprint)
                          .then(balance => {
                            if (
                              Math.abs(balance.credits_remaining - metadataCreditsRemaining) <= 1
                            ) {
                              setCreditBalance({
                                ...balance,
                                credits_remaining: metadataCreditsRemaining,
                              })
                            }
                          })
                          .catch(error =>
                            console.error('Failed to refresh anonymous credit balance:', error)
                          )
                      } else {
                        getCreditBalance(browserFingerprint)
                          .then(balance => {
                            setAnonymousCreditsRemaining(balance.credits_remaining)
                            setCreditBalance(balance)
                            const userTier = 'unregistered'
                            const periodType = 'daily'
                            const remainingPercent =
                              balance.credits_allocated > 0
                                ? (balance.credits_remaining / balance.credits_allocated) * 100
                                : 100
                            const lowCreditThreshold = 20

                            if (balance.credits_remaining <= 0) {
                              if (isFollowUpMode) {
                                setIsFollowUpMode(false)
                              }
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
                                setCreditWarningType('none')
                                setCreditWarningDismissible(false)
                              }
                            } else {
                              setCreditWarningMessage(null)
                              setCreditWarningType('none')
                              setCreditWarningDismissible(false)
                            }
                          })
                          .catch(error =>
                            console.error('Failed to refresh anonymous credit balance:', error)
                          )
                      }
                    }
                  }

                  // Refresh history for authenticated users
                  if (isAuthenticated && !isFollowUpMode) {
                    setTimeout(() => {
                      apiClient.deleteCache('GET:/conversations')
                      loadHistoryFromAPI()
                    }, 1000)
                  }
                } else if (event.type === 'error') {
                  streamError = new Error(event.message || 'Streaming error occurred')
                  console.error('Streaming error received:', streamError.message)
                  selectedModels.forEach(modelId => {
                    const createdModelId = createModelId(modelId)
                    if (!completedModels.has(createdModelId)) {
                      localModelErrors[createdModelId] = true
                      setModelErrors(prev => ({ ...prev, [createdModelId]: true }))
                    }
                  })
                  break
                }
              } catch (parseError) {
                console.error('Error parsing SSE message:', parseError, message)
              }
            }

            // Throttled UI update
            const now = Date.now()
            if (shouldUpdate && now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
              lastUpdateTime = now

              setResponse({
                results: { ...streamingResults },
                metadata: {
                  input_length: input.length,
                  models_requested: selectedModels.length,
                  models_successful: 0,
                  models_failed: 0,
                  timestamp: new Date().toISOString(),
                  processing_time_ms: Date.now() - startTime,
                },
              })

              // Update conversations to show streaming text
              if (!isFollowUpMode) {
                setConversations(prevConversations =>
                  prevConversations.map(conv => {
                    const content = streamingResults[conv.modelId] || ''
                    const startT = modelStartTimes[conv.modelId]
                    const completionTime = modelCompletionTimes[conv.modelId]

                    return {
                      ...conv,
                      messages: conv.messages.map((msg, idx) => {
                        if (idx === 0 && msg.type === 'user') {
                          const newTimestamp = startT || msg.timestamp
                          return { ...msg, timestamp: newTimestamp }
                        } else if (idx === 1 && msg.type === 'assistant') {
                          const newTimestamp = completionTime || msg.timestamp
                          return { ...msg, content, timestamp: newTimestamp }
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

                    const hasNewUserMessage = conv.messages.some(
                      (msg, idx) =>
                        msg.type === 'user' &&
                        msg.content === input &&
                        idx >= conv.messages.length - 2
                    )

                    if (!hasNewUserMessage) {
                      const startT = modelStartTimes[conv.modelId]
                      const completionTime = modelCompletionTimes[conv.modelId]
                      return {
                        ...conv,
                        messages: [
                          ...conv.messages,
                          createMessage('user', input, startT || userTimestamp),
                          createMessage(
                            'assistant',
                            content,
                            completionTime || new Date().toISOString()
                          ),
                        ],
                      }
                    } else {
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

              // Auto-scroll each conversation card to bottom
              requestAnimationFrame(() => {
                if (isPageScrollingRef.current) return

                Object.keys(streamingResults).forEach(modelId => {
                  if (completedModels.has(modelId)) return
                  if (autoScrollPausedRef.current.has(modelId)) return

                  const safeId = modelId.replace(/[^a-zA-Z0-9_-]/g, '-')
                  const conversationContent = document.querySelector(
                    `#conversation-content-${safeId}`
                  ) as HTMLElement
                  if (conversationContent) {
                    if (isPageScrollingRef.current) return
                    conversationContent.scrollTop = conversationContent.scrollHeight
                  }
                })
              })
            }
          }

          // Clean up timeout since stream completed
          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }

          if (streamError) {
            const errorModelErrors: { [key: string]: boolean } = { ...localModelErrors }
            selectedModels.forEach(modelId => {
              const createdModelId = createModelId(modelId)
              if (!completedModels.has(createdModelId)) {
                errorModelErrors[createdModelId] = true
              }
            })
            setModelErrors(errorModelErrors)

            setError(`Streaming error: ${streamError.message}. Partial results have been saved.`)
            setTimeout(() => {
              setError(null)
            }, 10000)
          }

          // Final update to ensure all content is displayed
          const finalModelErrors: { [key: string]: boolean } = { ...localModelErrors }
          selectedModels.forEach(modelId => {
            const createdModelId = createModelId(modelId)
            if (!completedModels.has(createdModelId)) {
              const content = streamingResults[createdModelId] || ''
              if (content.trim().length === 0) {
                finalModelErrors[createdModelId] = true
              }
            }
          })
          setModelErrors(finalModelErrors)

          // Switch successful models to formatted view
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
                const startT = modelStartTimes[conv.modelId]
                const completionTime = modelCompletionTimes[conv.modelId]

                return {
                  ...conv,
                  messages: conv.messages.map((msg, idx) => {
                    if (idx === 0 && msg.type === 'user') {
                      return { ...msg, timestamp: startT || msg.timestamp }
                    } else if (idx === 1 && msg.type === 'assistant') {
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

              return updated
            })
          } else {
            // For follow-up mode, ensure messages are added and update with final content
            setConversations(prevConversations => {
              const updated = prevConversations.map(conv => {
                const content = streamingResults[conv.modelId] || ''
                const completionTime = modelCompletionTimes[conv.modelId]
                const outputTokens = estimateTokensSimple(content)

                const hasNewUserMessage = conv.messages.some(
                  (msg, idx) =>
                    msg.type === 'user' && msg.content === input && idx >= conv.messages.length - 2
                )

                if (!hasNewUserMessage) {
                  const startT = modelStartTimes[conv.modelId]
                  const assistantMessage = createMessage(
                    'assistant',
                    content,
                    completionTime || new Date().toISOString()
                  )
                  assistantMessage.output_tokens = outputTokens

                  return {
                    ...conv,
                    messages: [
                      ...conv.messages,
                      createMessage('user', input, startT || userTimestamp),
                      assistantMessage,
                    ],
                  }
                } else {
                  return {
                    ...conv,
                    messages: conv.messages.map((msg, idx) => {
                      if (idx === conv.messages.length - 1 && msg.type === 'assistant') {
                        return {
                          ...msg,
                          content: content || msg.content,
                          timestamp: completionTime || msg.timestamp,
                          output_tokens: outputTokens,
                        }
                      }
                      return msg
                    }),
                  }
                }
              })

              return updated
            })
          }
        } finally {
          reader.releaseLock()

          // Save conversation to history AFTER stream completes
          if (!isAuthenticated && !isFollowUpMode) {
            setTimeout(() => {
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
                    .sort(
                      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    )

                  const firstUserMessage = allUserMessages[0]

                  if (firstUserMessage) {
                    const inputData = firstUserMessage.content
                    let fileContentsForSave: Array<{
                      name: string
                      content: string
                      placeholder: string
                    }> = []
                    const attachedFilesToExtract = attachedFiles.filter(
                      (f): f is AttachedFile => 'file' in f
                    )
                    if (attachedFilesToExtract.length > 0) {
                      extractFileContentForStorage(attachedFilesToExtract).then(extracted => {
                        fileContentsForSave = extracted
                      })
                    } else {
                      const storedFiles = attachedFiles.filter(
                        (f): f is StoredAttachedFile => 'content' in f
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
                  }
                }

                return currentConversations
              })
            }, 200)
          } else if (isAuthenticated && !isFollowUpMode) {
            setTimeout(async () => {
              const inputToMatch =
                lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
              if (inputToMatch) {
                await syncHistoryAfterComparison(inputToMatch, selectedModels)
              }
            }, 500)
          } else if (!isAuthenticated && isFollowUpMode) {
            setTimeout(() => {
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
                  const firstUserMessage = conversationsWithMessages
                    .flatMap(conv => conv.messages)
                    .filter(msg => msg.type === 'user')
                    .sort(
                      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    )[0]

                  if (firstUserMessage) {
                    const inputData = firstUserMessage.content
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
                        fileContentsForSave =
                          await extractFileContentForStorage(attachedFilesToExtract)
                      } else {
                        const storedFiles = attachedFiles.filter(
                          (f): f is StoredAttachedFile => 'content' in f
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
                        true,
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
            }, 200)
          } else if (isAuthenticated && isFollowUpMode) {
            setTimeout(async () => {
              const inputToMatch =
                lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
              if (inputToMatch) {
                await syncHistoryAfterComparison(inputToMatch, selectedModels)
              }
            }, 500)
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
      if (filteredData.metadata.models_successful > 0) {
        setInput('')
      }

      // Track usage only if at least one model succeeded
      if (filteredData.metadata.models_successful > 0) {
        if (isAuthenticated) {
          try {
            await refreshUser()
          } catch (error) {
            console.error('Failed to refresh user data:', error)
          }
        }

        try {
          const cacheKey = browserFingerprint
            ? `GET:/rate-limit-status?fingerprint=${encodeURIComponent(browserFingerprint)}`
            : 'GET:/rate-limit-status'
          apiClient.deleteCache(cacheKey)

          const data = await getRateLimitStatus(browserFingerprint)
          const newCount = data.fingerprint_usage || data.daily_usage || 0
          setUsageCount(newCount)

          const today = new Date().toDateString()
          localStorage.setItem(
            'compareintel_usage',
            JSON.stringify({
              count: newCount,
              date: today,
            })
          )
        } catch (error) {
          if (error instanceof Error && error.name === 'CancellationError') {
            // Silently handle
          } else {
            console.error('Failed to sync usage count after comparison:', error)
          }
        }
      } else {
        setError(
          'All models failed to respond. This comparison did not count towards your daily limit. Please try again in a moment.'
        )
        setTimeout(() => {
          setError(null)
        }, 8000)
      }

      // Scroll conversations to show the results
      if (isFollowUpMode) {
        setTimeout(() => {
          scrollConversationsToBottom()
        }, 600)
      } else {
        setTimeout(() => {
          scrollConversationsToBottom()
        }, 500)
      }
    } catch (err) {
      // Helper function to save partial results when an error occurs
      const savePartialResultsOnError = () => {
        const hasAnyResults = Object.keys(streamingResults).some(
          modelId => (streamingResults[modelId] || '').trim().length > 0
        )

        if (!hasAnyResults) return

        const errorModelErrors: { [key: string]: boolean } = { ...(localModelErrors || {}) }
        if (selectedModels && Array.isArray(selectedModels)) {
          selectedModels.forEach(modelId => {
            try {
              const rawModelId = modelId
              const formattedModelId = createModelId(modelId)
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
              const rawModelId =
                selectedModels && Array.isArray(selectedModels)
                  ? selectedModels.find(m => createModelId(m) === conv.modelId) || conv.modelId
                  : conv.modelId
              const content =
                (streamingResults &&
                  (streamingResults[rawModelId] || streamingResults[conv.modelId])) ||
                ''
              const startT =
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
                    return { ...msg, timestamp: startT || msg.timestamp }
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

        // Save to history
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
                      fileContentsForSave =
                        await extractFileContentForStorage(attachedFilesToExtract)
                    } else {
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
            setTimeout(async () => {
              const inputToMatch =
                lastSubmittedInputRef.current || getFirstUserMessage()?.content || input
              if (inputToMatch) {
                await syncHistoryAfterComparison(inputToMatch, selectedModels)
              }
            }, 500)
          }
        }, 200)
      }

      // Handle cancellation errors
      if (
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'CancellationError')
      ) {
        if (userCancelledRef.current) {
          setError('Model comparison cancelled by user.')
          return
        }

        // Handle timeout
        if (!selectedModels || !Array.isArray(selectedModels) || selectedModels.length === 0) {
          setError('Request timed out after 1 minute of inactivity.')
          return
        }

        const timeoutModelErrors: { [key: string]: boolean } = { ...(localModelErrors || {}) }
        selectedModels.forEach(modelId => {
          try {
            const rawModelId = modelId
            const formattedModelId = createModelId(modelId)
            if (!completedModels.has(rawModelId) && !completedModels.has(formattedModelId)) {
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
              const rawModelId =
                selectedModels.find(m => createModelId(m) === conv.modelId) || conv.modelId
              const content = streamingResults[rawModelId] || streamingResults[conv.modelId] || ''
              const startT = modelStartTimes[rawModelId] || modelStartTimes[conv.modelId]
              const completionTime =
                modelCompletionTimes[rawModelId] || modelCompletionTimes[conv.modelId]

              return {
                ...conv,
                messages: conv.messages.map((msg, idx) => {
                  if (idx === 0 && msg.type === 'user') {
                    return { ...msg, timestamp: startT || msg.timestamp }
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
        const successfulModelsCount = (
          selectedModels && Array.isArray(selectedModels) ? selectedModels : []
        ).filter(modelId => {
          try {
            const rawModelId = modelId
            const formattedModelId = createModelId(modelId)
            const hasCompleted =
              completedModels.has(rawModelId) || completedModels.has(formattedModelId)
            const hasError =
              (timeoutModelErrors &&
                (timeoutModelErrors[rawModelId] === true ||
                  timeoutModelErrors[formattedModelId] === true)) ||
              false
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
          if (isAuthenticated) {
            refreshUser()
              .then(() => getCreditBalance())
              .then(balance => {
                setCreditBalance(balance)
              })
              .catch(error =>
                console.error('Failed to refresh credit balance after timeout:', error)
              )
          } else {
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

        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        if (userCancelledRef.current) {
          const elapsedTime = Date.now() - startTime
          const elapsedSeconds = (elapsedTime / 1000).toFixed(1)
          setError(`Comparison cancelled by user after ${elapsedSeconds} seconds`)
        } else {
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
              const rawModelId = modelId
              const formattedModelId = createModelId(modelId)
              const modelIdToCheck = completedModels.has(rawModelId) ? rawModelId : formattedModelId

              if (completedModels.has(modelIdToCheck)) {
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
                timedOutCount++
              }
            } catch (modelError) {
              console.error('Error processing model in timeout handler:', modelError)
              timedOutCount++
            }
          })

          let errorMessage: string

          if (successfulCount === 0 && failedCount === 0 && timedOutCount === totalCount) {
            const modelText = totalCount === 1 ? 'model' : 'models'
            const suggestionText =
              totalCount === 1
                ? 'Please wait a moment and try again.'
                : 'Try selecting fewer models, or wait a moment and try again.'
            errorMessage = `Request timed out after 1 minute with no response (${totalCount} ${modelText}). ${suggestionText}`
          } else {
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

        try {
          savePartialResultsOnError()
        } catch (saveError) {
          console.error('Error saving partial results on timeout:', saveError)
        }
      } else if (err instanceof PaymentRequiredError) {
        if (isFollowUpMode) {
          setIsFollowUpMode(false)
        }
        if (creditWarningType !== 'none') {
          setError(
            err.message ||
              'Insufficient credits for this request. Please upgrade your plan or wait for credits to reset.'
          )
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (err instanceof ApiError && err.status === 402) {
        if (isFollowUpMode) {
          setIsFollowUpMode(false)
        }
        if (creditWarningType !== 'none') {
          const errorMessage =
            err.response?.detail || err.message || 'Insufficient credits for this request.'
          setError(errorMessage)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (err instanceof Error && err.message.includes('Failed to fetch')) {
        setError('Unable to connect to the server. Please check if the backend is running.')
        savePartialResultsOnError()
      } else if (err instanceof Error) {
        setError(err.message || 'An unexpected error occurred')
        savePartialResultsOnError()
      } else {
        setError('An unexpected error occurred')
        savePartialResultsOnError()
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      currentAbortControllerRef.current = null
      setCurrentAbortController(null)
      userCancelledRef.current = false
      setIsLoading(false)
    }
  }, [
    // Config dependencies
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
    creditWarningType,
    tutorialState,
    // Refs (stable, but included for clarity)
    userCancelledRef,
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
    // Callback dependencies
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
    // Helper functions
    getSuccessfulModels,
    isModelFailed,
  ])

  return {
    submitComparison,
    cancelComparison,
  }
}
