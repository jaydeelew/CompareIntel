import React, { memo, useEffect, useCallback, useMemo, useState, useRef } from 'react'

import { getConversationLimit, BREAKPOINT_MOBILE } from '../../config/constants'
import { useDebounce, useSpeechRecognition, useResponsive } from '../../hooks'
import type { SavedModelSelection } from '../../hooks/useSavedModelSelections'
import type { TutorialStep } from '../../hooks/useTutorial'
import { estimateTokens } from '../../services/compareService'
import type { User, ConversationSummary, ModelConversation } from '../../types'
import type { ModelsByProvider } from '../../types/models'
import { truncatePrompt, formatDate } from '../../utils'
import { showNotification } from '../../utils/error'

import { DisabledButtonInfoModal } from './DisabledButtonInfoModal'

// File attachment interface
export interface AttachedFile {
  id: string // Unique identifier for the file
  file: File // The actual File object
  name: string // File name
  placeholder: string // Placeholder text to display (e.g., "[file: filename.txt]")
}

// Stored file attachment interface (for files loaded from history)
export interface StoredAttachedFile {
  id: string // Unique identifier for the file
  name: string // File name
  placeholder: string // Placeholder text to display (e.g., "[file: filename.txt]")
  content: string // Extracted file content (stored for persistence)
}

interface ComparisonFormProps {
  // Input state
  input: string
  setInput: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement>

  // Mode state
  isFollowUpMode: boolean
  isLoading: boolean
  isAnimatingButton: boolean
  isAnimatingTextarea: boolean

  // User state
  isAuthenticated: boolean
  user: User | null

  // Conversations
  conversations: ModelConversation[]

  // History
  showHistoryDropdown: boolean
  setShowHistoryDropdown: (show: boolean) => void
  conversationHistory: ConversationSummary[]
  isLoadingHistory: boolean
  historyLimit: number
  currentVisibleComparisonId: string | null

  // Handlers
  onSubmitClick: () => void
  onContinueConversation: () => void
  onNewComparison: () => void
  onLoadConversation: (summary: ConversationSummary) => void
  onDeleteConversation: (summary: ConversationSummary, e: React.MouseEvent) => void

  // Utilities
  renderUsagePreview: () => React.ReactNode

  // Model selection
  selectedModels: string[]

  // Models data for token limit calculations
  modelsByProvider: ModelsByProvider

  // Callback to expose accurate token count to parent (for API calls)
  onAccurateTokenCountChange?: (totalInputTokens: number | null) => void

  // Credits remaining (used to disable submit button when credits run out)
  creditsRemaining: number

  // Saved model selections
  savedModelSelections: SavedModelSelection[]
  onSaveModelSelection: (name: string) => { success: boolean; error?: string }
  onLoadModelSelection: (id: string) => void
  onDeleteModelSelection: (id: string) => void
  onSetDefaultSelection: (id: string | null) => void
  getDefaultSelectionId: () => string | null
  getDefaultSelection: () => SavedModelSelection | null
  defaultSelectionOverridden: boolean
  canSaveMoreSelections: boolean
  maxSavedSelections: number

  // File attachments (can be AttachedFile for new uploads or StoredAttachedFile for loaded history)
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  setAttachedFiles: (files: (AttachedFile | StoredAttachedFile)[]) => void
  // Callback to expand files for token counting (takes files and userInput, returns expanded string)
  onExpandFiles?: (
    files: (AttachedFile | StoredAttachedFile)[],
    userInput: string
  ) => Promise<string>

  // Web search
  webSearchEnabled?: boolean
  onWebSearchEnabledChange?: (enabled: boolean) => void

  // Tutorial step - used to block submit button during step 3 (enter-prompt)
  tutorialStep?: TutorialStep | null
}

/**
 * ComparisonForm component - handles the main input area, history, and controls
 *
 * @example
 * ```tsx
 * <ComparisonForm
 *   input={input}
 *   setInput={setInput}
 *   onSubmitClick={handleSubmit}
 *   {...otherProps}
 * />
 * ```
 */
export const ComparisonForm = memo<ComparisonFormProps>(
  ({
    input,
    setInput,
    textareaRef,
    isFollowUpMode,
    isLoading,
    isAnimatingButton,
    isAnimatingTextarea,
    isAuthenticated,
    user,
    conversations,
    showHistoryDropdown,
    setShowHistoryDropdown,
    conversationHistory,
    isLoadingHistory,
    historyLimit,
    currentVisibleComparisonId,
    onSubmitClick,
    onContinueConversation,
    onNewComparison,
    onLoadConversation,
    onDeleteConversation,
    renderUsagePreview,
    selectedModels,
    modelsByProvider,
    onAccurateTokenCountChange,
    creditsRemaining,
    savedModelSelections,
    onSaveModelSelection,
    onLoadModelSelection,
    onDeleteModelSelection,
    onSetDefaultSelection,
    getDefaultSelectionId,
    getDefaultSelection,
    defaultSelectionOverridden,
    canSaveMoreSelections,
    maxSavedSelections,
    attachedFiles,
    setAttachedFiles,
    onExpandFiles,
    webSearchEnabled: webSearchEnabledProp,
    onWebSearchEnabledChange,
    tutorialStep,
  }) => {
    // Internal state for web search if not controlled via props
    const [webSearchEnabledInternal, setWebSearchEnabledInternal] = useState(false)
    const webSearchEnabled =
      webSearchEnabledProp !== undefined ? webSearchEnabledProp : webSearchEnabledInternal
    const setWebSearchEnabled = onWebSearchEnabledChange || setWebSearchEnabledInternal

    // Calculate which selected models support web search
    const selectedModelsWithWebSearch = useMemo(() => {
      return selectedModels.filter(modelId => {
        const modelIdStr = String(modelId)
        for (const providerModels of Object.values(modelsByProvider)) {
          const model = providerModels.find(m => String(m.id) === modelIdStr)
          if (model && model.supports_web_search) {
            return true
          }
        }
        return false
      })
    }, [selectedModels, modelsByProvider])

    // Check if web search can be enabled (provider configured and models support it)
    // Note: We'll need to check provider status from API, but for now assume it can be enabled
    // if models support it
    const canEnableWebSearch = selectedModelsWithWebSearch.length > 0
    const messageCount = conversations.length > 0 ? conversations[0]?.messages.length || 0 : 0

    // Responsive state including touch detection
    const { isTouchDevice, isSmallLayout } = useResponsive()

    // Handler for disabled button taps on touch devices
    const handleDisabledButtonTap = useCallback(
      (button: 'websearch' | 'submit') => {
        if (!isTouchDevice) return // Only show modal on touch devices

        let message = ''
        if (button === 'websearch') {
          if (!canEnableWebSearch) {
            message =
              'Web search requires at least one model that supports web search. Select a model with the 🌐 icon in the model selection area to enable this feature.'
          } else if (isLoading) {
            message =
              'Web search cannot be toggled while a comparison is in progress. Please wait for the current comparison to complete.'
          }
        } else if (button === 'submit') {
          if (creditsRemaining <= 0) {
            message =
              'You have run out of credits. Please purchase more credits to continue using CompareIntel. You can upgrade your plan from your account settings.'
          } else if (isLoading) {
            message =
              'Please wait for the current comparison to complete before submitting a new one.'
          } else if (!isFollowUpMode && (!input.trim() || selectedModels.length === 0)) {
            if (!input.trim() && selectedModels.length === 0) {
              message =
                'To submit, please enter a prompt in the text area and select at least one AI model to compare.'
            } else if (!input.trim()) {
              message = 'Please enter a prompt in the text area before submitting.'
            } else {
              message =
                'Please select at least one AI model from the model selection area before submitting.'
            }
          }
        }

        if (message) {
          setDisabledButtonInfo({ button, message })
        }
      },
      [
        isTouchDevice,
        canEnableWebSearch,
        isLoading,
        creditsRemaining,
        isFollowUpMode,
        input,
        selectedModels.length,
      ]
    )

    // State for saved model selections UI
    const [showSavedSelectionsDropdown, setShowSavedSelectionsDropdown] = useState(false)
    const [saveSelectionName, setSaveSelectionName] = useState('')
    const [saveSelectionError, setSaveSelectionError] = useState<string | null>(null)
    const [isInSaveMode, setIsInSaveMode] = useState(false)
    const savedSelectionsRef = useRef<HTMLDivElement>(null)

    // State for accurate token counts from API
    const [accurateTokenCounts, setAccurateTokenCounts] = useState<{
      input_tokens: number
      conversation_history_tokens: number
      total_input_tokens: number
    } | null>(null)
    const [isLoadingAccurateTokens, setIsLoadingAccurateTokens] = useState(false)
    const abortControllerRef = useRef<AbortController | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [isDraggingOver, setIsDraggingOver] = useState(false)
    // Track base input when speech started to preserve existing content
    const baseInputWhenSpeechStartedRef = useRef<string>('')
    // For mobile: track input before current speech session started
    const mobileBaseInputRef = useRef<string>('')

    // Note: isSmallLayout (640px) from useResponsive() called above

    // State for disabled button info modal
    const [disabledButtonInfo, setDisabledButtonInfo] = useState<{
      button: 'websearch' | 'submit' | null
      message: string
    }>({ button: null, message: '' })

    // Speech recognition hook
    // Mobile: Non-continuous with interim results for real-time display
    // Desktop: Continuous mode, hook sends full transcript, append to base input
    const handleSpeechResult = useCallback(
      (transcript: string, isFinal: boolean) => {
        // Detect mobile
        const isMobileMode =
          typeof navigator !== 'undefined' &&
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

        if (isMobileMode) {
          // MOBILE: Show interim results in real-time, add final results permanently
          const mobileBase = mobileBaseInputRef.current

          if (isFinal) {
            // Final result: add to input permanently
            const newInput = mobileBase + (mobileBase && transcript ? ' ' : '') + transcript
            setInput(newInput)
            // Update the base for next speech session
            mobileBaseInputRef.current = newInput
          } else {
            // Interim result: show temporarily (will be replaced by next interim or final)
            const newInput = mobileBase + (mobileBase && transcript ? ' ' : '') + transcript
            setInput(newInput)
          }
        } else {
          // DESKTOP: Hook sends full transcript, append to base input
          const baseInput = baseInputWhenSpeechStartedRef.current
          const newInput = baseInput + (baseInput && transcript ? ' ' : '') + transcript
          setInput(newInput)
        }
      },
      [setInput]
    )

    const {
      isListening: isSpeechListening,
      isSupported: isSpeechSupported,
      startListening: startSpeechListening,
      stopListening: stopSpeechListening,
      error: speechError,
      browserSupport: speechBrowserSupport,
    } = useSpeechRecognition(handleSpeechResult)

    // Show notification if speech recognition error occurs
    useEffect(() => {
      if (speechError) {
        showNotification(speechError, 'error')
      }
    }, [speechError])

    // Track current input value in a ref for efficient access
    const currentInputRef = useRef<string>(input)
    useEffect(() => {
      currentInputRef.current = input
      // When not listening, keep mobile base in sync with actual input
      // (in case user types or clears input between speech sessions)
      if (!isSpeechListening) {
        mobileBaseInputRef.current = input
      }
    }, [input, isSpeechListening])

    // Capture base input when speech starts and reset ref when speech stops
    const prevIsListeningRef = useRef<boolean>(false)
    useEffect(() => {
      const wasListening = prevIsListeningRef.current
      prevIsListeningRef.current = isSpeechListening

      if (isSpeechListening && !wasListening) {
        // Speech just started - capture the current input as the base
        // This preserves any existing text and attached file content
        const currentInput = currentInputRef.current
        baseInputWhenSpeechStartedRef.current = currentInput // for desktop
        mobileBaseInputRef.current = currentInput // for mobile
      } else if (!isSpeechListening && wasListening) {
        // Speech just stopped - reset desktop ref only
        baseInputWhenSpeechStartedRef.current = ''
        // mobileBaseInputRef is kept in sync via the effect above
      }
    }, [isSpeechListening])

    // Debounce input for API calls (only call API when user pauses typing)
    const debouncedInput = useDebounce(input, 600) // 600ms delay

    // Debounced API call for accurate token counting using backend model-specific token estimators
    // Uses backend tokenizers for accurate counting instead of chars/4 estimation
    // Now includes attached file contents for accurate token counting
    useEffect(() => {
      // Only call API if we have selected models
      // Note: We call API even for short inputs to get accurate counts from backend tokenizers
      if (selectedModels.length === 0) {
        setAccurateTokenCounts(null)
        if (onAccurateTokenCountChange) {
          onAccurateTokenCountChange(null)
        }
        return
      }

      // If input is empty and no files attached, clear token counts
      if (!debouncedInput.trim() && attachedFiles.length === 0) {
        setAccurateTokenCounts(null)
        if (onAccurateTokenCountChange) {
          onAccurateTokenCountChange(null)
        }
        return
      }

      // Cancel previous request if still in flight
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create new abort controller for this request
      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsLoadingAccurateTokens(true)

      // Note: Conversation history tokens will be calculated in tokenUsageInfo useMemo
      // from saved tokens in messages, so we don't need to calculate them here

      // Use first model for accurate token counting
      const modelId = selectedModels[0]

      // Expand files if they exist, otherwise use input as-is
      const getExpandedInputForTokens = async (): Promise<string> => {
        if (attachedFiles.length > 0 && onExpandFiles) {
          try {
            return await onExpandFiles(attachedFiles, debouncedInput)
          } catch (error) {
            console.warn('Failed to expand files for token counting:', error)
            // Fall back to input with placeholders if expansion fails
            return debouncedInput
          }
        }
        return debouncedInput
      }

      // Get expanded input and then estimate tokens
      getExpandedInputForTokens()
        .then(expandedInput => {
          // Only proceed if request wasn't cancelled
          if (controller.signal.aborted) {
            return
          }

          // Only send current input text (with expanded files), not conversation history
          return estimateTokens({
            input_data: expandedInput,
            model_id: modelId,
            // Don't send conversation_history - we'll sum tokens from saved messages instead
          })
        })
        .then(response => {
          // Only update if request wasn't cancelled
          if (!controller.signal.aborted && response) {
            // response.input_tokens is just for the current input (including expanded files)
            // Conversation history tokens will be calculated from saved tokens in tokenUsageInfo useMemo
            const counts = {
              input_tokens: response.input_tokens,
              conversation_history_tokens: 0, // Will be calculated from saved tokens in useMemo
              total_input_tokens: response.input_tokens, // Will be updated with history tokens in useMemo
            }
            setAccurateTokenCounts(counts)
            setIsLoadingAccurateTokens(false)
            // Don't notify parent here - let the useEffect below handle it with total including history
          }
        })
        .catch(error => {
          // Ignore cancellation errors
          if (error.name === 'AbortError' || controller.signal.aborted) {
            return
          }
          // On error, log but don't fall back to character-based estimation
          // Keep accurateTokenCounts as null - UI will show 0% or loading state
          console.warn('Failed to get accurate token count from backend:', error)
          setIsLoadingAccurateTokens(false)
          // Notify parent that we don't have accurate count
          if (onAccurateTokenCountChange) {
            onAccurateTokenCountChange(null)
          }
        })

      // Cleanup: abort request if component unmounts or dependencies change
      return () => {
        controller.abort()
      }
    }, [
      debouncedInput,
      attachedFiles,
      isFollowUpMode,
      selectedModels,
      conversations,
      onAccurateTokenCountChange,
      onExpandFiles,
    ])

    // Calculate token usage and percentage remaining for follow-up mode
    // Uses backend model-specific token estimators when available
    // Conversation history tokens are retrieved from saved tokens in database
    const tokenUsageInfo = useMemo(() => {
      if (!isFollowUpMode || selectedModels.length === 0 || conversations.length === 0) {
        return null
      }

      // Get min max input tokens from selected models (use accurate token limits)
      const modelLimits = selectedModels
        .map(modelId => {
          const modelIdStr = String(modelId)
          for (const providerModels of Object.values(modelsByProvider)) {
            const model = providerModels.find(m => String(m.id) === modelIdStr)
            if (model && model.max_input_tokens) {
              // Use accurate token limit directly
              return model.max_input_tokens
            }
          }
          return null
        })
        .filter((limit): limit is number => limit !== null)

      if (modelLimits.length === 0) {
        return null
      }

      const minMaxInputTokens = Math.min(...modelLimits)

      // Calculate tokens from conversation history using saved token counts from database
      // For each model, sum: input_tokens from user messages + output_tokens from that model's assistant messages
      const tokenCountsByModel: { [modelId: string]: number } = {}

      if (isFollowUpMode && conversations.length > 0) {
        // Get all conversations for selected models
        const selectedConversations = conversations.filter(conv => {
          const convModelIdStr = String(conv.modelId)
          return (
            selectedModels.some(selectedId => String(selectedId) === convModelIdStr) &&
            conv.messages.length > 0
          )
        })

        selectedConversations.forEach(conv => {
          const modelId = String(conv.modelId)
          let totalTokens = 0

          // Sum tokens from messages using saved token counts
          conv.messages.forEach(msg => {
            if (msg.type === 'user' && msg.input_tokens) {
              // User messages: add input_tokens (calculated from backend tokenizers, saved in database)
              totalTokens += msg.input_tokens
            } else if (msg.type === 'assistant' && msg.output_tokens) {
              // Assistant messages: add output_tokens (from OpenRouter API, saved in database)
              totalTokens += msg.output_tokens
            }
            // Note: If tokens are missing, we skip that message rather than estimating
            // This ensures we only use accurate token counts from backend/database
          })

          tokenCountsByModel[modelId] = totalTokens
        })
      }

      // Use the greatest token count across all models (as per user requirement)
      const conversationHistoryTokens =
        Object.keys(tokenCountsByModel).length > 0
          ? Math.max(...Object.values(tokenCountsByModel))
          : 0

      // Get current input tokens - use backend model-specific token estimator
      let currentInputTokens: number
      let totalInputTokens: number

      if (accurateTokenCounts) {
        // Use accurate count from backend API (model-specific tokenizer)
        currentInputTokens = accurateTokenCounts.input_tokens
        // Add conversation history tokens (retrieved from saved tokens in database)
        totalInputTokens = currentInputTokens + conversationHistoryTokens
      } else {
        // If accurate counts not available yet (API call in progress or failed),
        // use 0 to avoid showing incorrect estimates
        // The UI will show loading state or 0% until accurate counts are available
        currentInputTokens = 0
        totalInputTokens = conversationHistoryTokens // Only show history tokens, not current input estimate
      }

      // Calculate percentage remaining using the greatest token count
      const percentageUsed = (totalInputTokens / minMaxInputTokens) * 100
      const percentageRemaining = Math.max(0, 100 - percentageUsed)

      return {
        minMaxInputTokens,
        currentInputTokens,
        conversationHistoryTokens,
        totalInputTokens,
        percentageUsed,
        percentageRemaining,
        isExceeded: totalInputTokens > minMaxInputTokens,
        isAccurate: accurateTokenCounts !== null, // Indicates if using accurate counts from backend
        isLoadingAccurate: isLoadingAccurateTokens, // Indicates if fetching accurate counts
      }
    }, [
      isFollowUpMode,
      selectedModels,
      conversations,
      modelsByProvider,
      accurateTokenCounts,
      isLoadingAccurateTokens,
    ])

    // Notify parent of total token count (including conversation history) when available
    useEffect(() => {
      if (tokenUsageInfo && onAccurateTokenCountChange) {
        onAccurateTokenCountChange(tokenUsageInfo.totalInputTokens)
      } else if (!isFollowUpMode && accurateTokenCounts && onAccurateTokenCountChange) {
        // For new conversations (not follow-up), just use current input tokens
        onAccurateTokenCountChange(accurateTokenCounts.input_tokens)
      } else if (!accurateTokenCounts && onAccurateTokenCountChange) {
        // No accurate count available
        onAccurateTokenCountChange(null)
      }
    }, [tokenUsageInfo, accurateTokenCounts, isFollowUpMode, onAccurateTokenCountChange])

    // Helper function to format capacity in characters (approximate: 1 token ≈ 4 chars)
    const formatCapacityChars = useCallback((tokens: number): string => {
      const chars = tokens * 4
      if (chars >= 1_000_000) {
        return `~${(chars / 1_000_000).toFixed(1)}M chars`
      } else if (chars >= 1_000) {
        return `~${Math.round(chars / 1_000)}k chars`
      } else {
        return `~${chars} chars`
      }
    }, [])

    // Simple client-side token estimation for real-time updates (1 token ≈ 4 chars)
    // This provides immediate feedback while accurate counts are being fetched from the API
    const estimateTokensSimple = useCallback((text: string): number => {
      if (!text.trim()) {
        return 0
      }
      // Rough estimate: 1 token ≈ 4 characters
      return Math.max(1, Math.ceil(text.length / 4))
    }, [])

    // Calculate token usage percentage for pie chart (works in both regular and follow-up mode)
    // Uses backend model-specific token estimators when available, falls back to simple chars/4 estimation for real-time updates
    const tokenUsagePercentageInfo = useMemo(() => {
      if (selectedModels.length === 0) {
        return { percentage: 0, limitingModel: null, totalInputTokens: 0 }
      }

      // Get model limits with model info
      const modelLimitsWithInfo = selectedModels
        .map(modelId => {
          const modelIdStr = String(modelId)
          for (const providerModels of Object.values(modelsByProvider)) {
            const model = providerModels.find(m => String(m.id) === modelIdStr)
            if (model && model.max_input_tokens) {
              return {
                modelId: modelIdStr,
                modelName: model.name,
                maxInputTokens: model.max_input_tokens,
              }
            }
          }
          return null
        })
        .filter(
          (info): info is { modelId: string; modelName: string; maxInputTokens: number } =>
            info !== null
        )

      if (modelLimitsWithInfo.length === 0) {
        return { percentage: 0, limitingModel: null, totalInputTokens: 0 }
      }

      // Find the limiting model (minimum capacity)
      const minLimit = Math.min(...modelLimitsWithInfo.map(info => info.maxInputTokens))
      const limitingModelInfo = modelLimitsWithInfo.find(info => info.maxInputTokens === minLimit)

      // Check if there's a significant difference (min is < 50% of max)
      const maxLimit = Math.max(...modelLimitsWithInfo.map(info => info.maxInputTokens))
      const hasSignificantDifference = maxLimit > 0 && minLimit / maxLimit < 0.5

      const minMaxInputTokens = minLimit

      // Calculate tokens from conversation history using saved token counts from database
      // For each model, sum: input_tokens from user messages + output_tokens from that model's assistant messages
      const tokenCountsByModel: { [modelId: string]: number } = {}

      if (isFollowUpMode && conversations.length > 0) {
        // Get all conversations for selected models
        const selectedConversations = conversations.filter(conv => {
          const convModelIdStr = String(conv.modelId)
          return (
            selectedModels.some(selectedId => String(selectedId) === convModelIdStr) &&
            conv.messages.length > 0
          )
        })

        selectedConversations.forEach(conv => {
          const modelId = String(conv.modelId)
          let totalTokens = 0

          // Sum tokens from messages using saved token counts
          conv.messages.forEach(msg => {
            if (msg.type === 'user' && msg.input_tokens) {
              // User messages: add input_tokens (calculated from backend tokenizers, saved in database)
              totalTokens += msg.input_tokens
            } else if (msg.type === 'assistant' && msg.output_tokens) {
              // Assistant messages: add output_tokens (from OpenRouter API, saved in database)
              totalTokens += msg.output_tokens
            }
            // Note: If tokens are missing, we skip that message rather than estimating
            // This ensures we only use accurate token counts from backend/database
          })

          tokenCountsByModel[modelId] = totalTokens
        })
      }

      // Use the greatest token count across all models (as per user requirement)
      const conversationHistoryTokens =
        Object.keys(tokenCountsByModel).length > 0
          ? Math.max(...Object.values(tokenCountsByModel))
          : 0

      // Get current input tokens - use backend model-specific token estimator when available,
      // otherwise use simple client-side estimation for real-time updates
      let totalInputTokens: number

      if (accurateTokenCounts) {
        // Use accurate count from backend API (model-specific tokenizer)
        const currentInputTokens = accurateTokenCounts.input_tokens
        // Add conversation history tokens (retrieved from saved tokens in database)
        totalInputTokens = currentInputTokens + conversationHistoryTokens
      } else {
        // If accurate counts not available yet (API call in progress or failed),
        // use simple client-side estimation for real-time updates as user types
        // This provides immediate feedback while accurate counts are being fetched
        const estimatedInputTokens = estimateTokensSimple(input)
        totalInputTokens = estimatedInputTokens + conversationHistoryTokens
      }

      // Calculate percentage used (clamp between 0 and 100)
      const percentageUsed = Math.min(
        100,
        Math.max(0, (totalInputTokens / minMaxInputTokens) * 100)
      )

      return {
        percentage: percentageUsed,
        totalInputTokens, // Include this to check if tokens exist for visual display
        limitingModel:
          hasSignificantDifference && limitingModelInfo
            ? {
                name: limitingModelInfo.modelName,
                capacityChars: formatCapacityChars(limitingModelInfo.maxInputTokens),
              }
            : null,
      }
    }, [
      selectedModels,
      input,
      modelsByProvider,
      isFollowUpMode,
      conversations,
      accurateTokenCounts,
      formatCapacityChars,
      estimateTokensSimple,
    ])

    // Extract percentage for backward compatibility
    const tokenUsagePercentage = tokenUsagePercentageInfo.percentage

    // Auto-expand textarea based on content (like ChatGPT)
    // Desktop: Scrollable after 5 lines (6th line triggers scrolling)
    // Mobile: Scrollable after 3 lines (4th line triggers scrolling)
    const adjustTextareaHeight = useCallback(() => {
      if (!textareaRef.current) return

      const textarea = textareaRef.current

      // Check if we're on mobile viewport (max-width: 768px)
      const isMobile = window.innerWidth <= BREAKPOINT_MOBILE

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto'

      // Calculate height based on line count
      const computedStyle = window.getComputedStyle(textarea)
      const fontSize = parseFloat(computedStyle.fontSize)
      const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * (isMobile ? 1.25 : 1.6)
      const paddingTop = parseFloat(computedStyle.paddingTop)
      const paddingBottom = parseFloat(computedStyle.paddingBottom)

      // Get CSS min-height value to respect it (important for responsive design)
      const cssMinHeight = parseFloat(computedStyle.minHeight) || (isMobile ? 40 : 0)

      // Calculate height for lines of text (3 lines on mobile, 5 lines on desktop)
      const lineHeightPx = lineHeight
      const maxLines = isMobile ? 3 : 5
      const maxLinesHeight = lineHeightPx * maxLines

      // maxHeight = max lines + top padding + bottom padding
      // This ensures exactly max lines are visible before scrolling starts
      const maxHeight = maxLinesHeight + paddingTop + paddingBottom

      // Use the maximum of calculated minHeight and CSS min-height to respect responsive design
      const calculatedMinHeight = lineHeightPx + paddingTop + paddingBottom
      const minHeight = Math.max(calculatedMinHeight, cssMinHeight)
      const scrollHeight = textarea.scrollHeight

      // When empty, use exactly the CSS min-height to match the action area height
      const isEmpty = !input.trim()
      let newHeight: number

      if (isEmpty) {
        // Force empty textarea to match action area height exactly
        newHeight = cssMinHeight
      } else {
        // Set height to maxHeight (max lines) when content exceeds it, otherwise grow with content
        // But ensure it's at least the CSS min-height
        newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
      }

      textarea.style.height = `${newHeight}px`

      // Enable scrolling when content exceeds max lines
      if (scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto'
      } else {
        textarea.style.overflowY = 'hidden'
        // Reset scroll position when not scrolling
        textarea.scrollTop = 0
      }
    }, [input, textareaRef])

    // Auto-scroll textarea to keep current line visible (especially for mobile voice input)
    const scrollToCurrentLine = useCallback(() => {
      if (!textareaRef.current) return

      const textarea = textareaRef.current
      const isMobile = window.innerWidth <= BREAKPOINT_MOBILE

      // Only auto-scroll on mobile during voice input
      if (!isMobile) return

      // During voice input, scroll to the end of the text (where new text is being added)
      // This ensures the latest transcribed text is always visible
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.scrollTop = textarea.scrollHeight - textarea.clientHeight
      }
    }, [textareaRef])

    // Adjust height when input changes
    useEffect(() => {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        adjustTextareaHeight()
        // Auto-scroll on mobile during voice input
        if (isSpeechListening) {
          // Use double requestAnimationFrame to ensure height adjustment is complete
          requestAnimationFrame(() => {
            scrollToCurrentLine()
          })
        }
      })
    }, [input, adjustTextareaHeight, isSpeechListening, scrollToCurrentLine])

    // Focus textarea on desktop when component mounts (only if not touch device and no tutorial)
    useEffect(() => {
      if (!isTouchDevice && !tutorialStep) {
        let timeout1: ReturnType<typeof setTimeout> | null = null
        let timeout2: ReturnType<typeof setTimeout> | null = null

        const attemptFocus = () => {
          if (textareaRef.current) {
            const textarea = textareaRef.current
            const rect = textarea.getBoundingClientRect()
            // Only focus if textarea is visible and not disabled
            if (rect.width > 0 && rect.height > 0 && !textarea.disabled) {
              // Check if there's no blocking modal
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
        }

        // Try immediately with requestAnimationFrame
        requestAnimationFrame(() => {
          if (attemptFocus()) return

          // Try again with a small delay
          timeout1 = setTimeout(() => {
            if (attemptFocus()) return

            // Final attempt with longer delay
            timeout2 = setTimeout(() => {
              attemptFocus()
            }, 300)
          }, 100)
        })

        return () => {
          if (timeout1) clearTimeout(timeout1)
          if (timeout2) clearTimeout(timeout2)
        }
      }
    }, [isTouchDevice, tutorialStep, textareaRef])

    // Adjust height on window resize - ensure it recalculates after media query changes
    useEffect(() => {
      let resizeTimeout: ReturnType<typeof setTimeout>
      const handleResize = () => {
        // Clear any pending resize handler
        clearTimeout(resizeTimeout)
        // Use a small delay to ensure media queries have been applied
        resizeTimeout = setTimeout(() => {
          requestAnimationFrame(() => {
            adjustTextareaHeight()
          })
        }, 100)
      }

      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
        clearTimeout(resizeTimeout)
      }
    }, [adjustTextareaHeight])

    // Initial height adjustment on mount
    useEffect(() => {
      // Small delay to ensure textarea is rendered
      const timer = setTimeout(() => {
        adjustTextareaHeight()
      }, 0)
      return () => clearTimeout(timer)
    }, [adjustTextareaHeight])

    // Close saved selections dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement
        if (
          showSavedSelectionsDropdown &&
          savedSelectionsRef.current &&
          !savedSelectionsRef.current.contains(target) &&
          !target.closest('.saved-selections-dropdown')
        ) {
          setShowSavedSelectionsDropdown(false)
          setIsInSaveMode(false)
          setSaveSelectionName('')
          setSaveSelectionError(null)
        }
      }

      if (showSavedSelectionsDropdown) {
        document.addEventListener('mousedown', handleClickOutside)
        return () => {
          document.removeEventListener('mousedown', handleClickOutside)
        }
      }
    }, [showSavedSelectionsDropdown])

    // Check if file is a document type that can have text extracted
    const isDocumentFile = useCallback((file: File): boolean => {
      const fileName = file.name.toLowerCase()
      const mimeType = file.type.toLowerCase()

      const documentExtensions = ['.pdf', '.docx', '.doc', '.rtf', '.odt', '.txt']
      const documentMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/rtf',
        'application/vnd.oasis.opendocument.text',
        'text/rtf',
      ]

      return (
        documentExtensions.some(ext => fileName.endsWith(ext)) ||
        documentMimeTypes.some(type => mimeType.includes(type))
      )
    }, [])

    // Detect if a file is a text/code/document file by checking MIME type and file content
    const isTextOrCodeFile = useCallback(
      async (file: File): Promise<boolean> => {
        // Check if it's a document file (PDF, DOCX, etc.)
        if (isDocumentFile(file)) {
          return true
        }
        // Check MIME type first
        const mimeType = file.type.toLowerCase()

        // Common text/code MIME types
        const textMimeTypes = [
          'text/plain',
          'text/html',
          'text/css',
          'text/javascript',
          'text/xml',
          'text/csv',
          'text/markdown',
          'application/json',
          'application/javascript',
          'application/xml',
          'application/x-sh',
          'application/x-python',
          'application/x-httpd-php',
          'application/x-java-source',
          'application/x-c',
          'application/x-c++',
          'application/x-csharp',
          'application/x-ruby',
          'application/x-go',
          'application/x-rust',
          'application/x-swift',
          'application/x-kotlin',
          'application/x-typescript',
          'application/x-yaml',
          'application/x-toml',
          'application/x-ini',
          'application/x-shellscript',
        ]

        // Check if MIME type matches known text types
        if (
          mimeType &&
          textMimeTypes.some(type => mimeType.includes(type) || mimeType.startsWith(type))
        ) {
          return true
        }

        // If MIME type is empty or generic (application/octet-stream), check file extension
        const fileName = file.name.toLowerCase()
        const textExtensions = [
          '.txt',
          '.md',
          '.markdown',
          '.json',
          '.xml',
          '.html',
          '.htm',
          '.css',
          '.js',
          '.jsx',
          '.ts',
          '.tsx',
          '.py',
          '.java',
          '.c',
          '.cpp',
          '.cc',
          '.cxx',
          '.h',
          '.hpp',
          '.cs',
          '.rb',
          '.go',
          '.rs',
          '.swift',
          '.kt',
          '.php',
          '.sh',
          '.bash',
          '.zsh',
          '.fish',
          '.yaml',
          '.yml',
          '.toml',
          '.ini',
          '.cfg',
          '.conf',
          '.log',
          '.csv',
          '.sql',
          '.r',
          '.R',
          '.m',
          '.pl',
          '.pm',
          '.lua',
          '.scala',
          '.clj',
          '.cljs',
          '.hs',
          '.elm',
          '.ex',
          '.exs',
          '.dart',
          '.vue',
          '.svelte',
          '.astro',
          '.graphql',
          '.gql',
          '.dockerfile',
          '.env',
          '.gitignore',
          '.gitattributes',
          '.editorconfig',
          '.eslintrc',
          '.prettierrc',
          '.babelrc',
          '.webpack',
          '.rollup',
          '.vite',
          '.makefile',
          '.cmake',
          '.gradle',
          '.maven',
          '.pom',
          '.sbt',
          '.build',
          '.lock',
          '.lockfile',
          '.package',
          '.requirements',
          '.pip',
          '.conda',
          '.dockerignore',
          '.npmignore',
          '.yarnignore',
          '.eslintignore',
          '.prettierignore',
        ]

        if (textExtensions.some(ext => fileName.endsWith(ext))) {
          return true
        }

        // If MIME type is empty or generic, try to read first bytes to detect text
        // Text files typically start with printable ASCII characters or UTF-8 BOM
        try {
          const firstBytes = await file.slice(0, 512).arrayBuffer()
          const uint8Array = new Uint8Array(firstBytes)

          // Check for UTF-8 BOM
          if (
            uint8Array.length >= 3 &&
            uint8Array[0] === 0xef &&
            uint8Array[1] === 0xbb &&
            uint8Array[2] === 0xbf
          ) {
            return true
          }

          // Check for UTF-16 BOM (LE or BE)
          if (
            uint8Array.length >= 2 &&
            ((uint8Array[0] === 0xff && uint8Array[1] === 0xfe) ||
              (uint8Array[0] === 0xfe && uint8Array[1] === 0xff))
          ) {
            return true
          }

          // Check if most bytes are printable ASCII (32-126) or common whitespace (9, 10, 13)
          // Allow some non-printable bytes for encoding variations
          let printableCount = 0
          for (let i = 0; i < Math.min(uint8Array.length, 256); i++) {
            const byte = uint8Array[i]
            if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
              printableCount++
            }
          }

          // If more than 80% of bytes are printable, likely a text file
          const printableRatio = printableCount / Math.min(uint8Array.length, 256)
          if (printableRatio > 0.8) {
            return true
          }
        } catch (error) {
          // If we can't read the file, default to false (not a text file)
          console.warn('Error reading file for type detection:', error)
          return false
        }

        return false
      },
      [isDocumentFile]
    )

    // Process a file (used by both file input and drag-and-drop)
    // Now stores file reference instead of reading content immediately
    const processFile = useCallback(
      async (file: File) => {
        // Check if file is text/code/document
        const isTextFile = await isTextOrCodeFile(file)

        if (!isTextFile) {
          showNotification(
            'Only text, code, and document files can be uploaded. Please select a supported file.',
            'error'
          )
          return false
        }

        try {
          // Create a unique ID for this file
          const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

          // Create placeholder text
          const placeholder = `[file: ${file.name}]`

          // Create attached file object
          const attachedFile: AttachedFile = {
            id: fileId,
            file: file,
            name: file.name,
            placeholder: placeholder,
          }

          // Add file to attached files list
          setAttachedFiles([...attachedFiles, attachedFile])

          // Insert placeholder into textarea at cursor position or append
          const textarea = textareaRef.current
          if (textarea) {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const textBefore = input.substring(0, start)
            const textAfter = input.substring(end)

            // Add separator if needed
            const separatorBefore = textBefore.trim() && !textBefore.endsWith('\n') ? '\n\n' : ''
            const separatorAfter = textAfter.trim() && !textAfter.startsWith('\n') ? '\n\n' : ''

            const newInput = textBefore + separatorBefore + placeholder + separatorAfter + textAfter
            setInput(newInput)

            // Set cursor position after placeholder
            setTimeout(() => {
              if (textareaRef.current) {
                const newCursorPos =
                  start + separatorBefore.length + placeholder.length + separatorAfter.length
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
              }
            }, 0)
          } else {
            // Fallback: append to end
            const separator = input.trim() ? '\n\n' : ''
            setInput(input + separator + placeholder)
          }

          // Detect file type for notification
          const fileName = file.name.toLowerCase()
          let fileType = 'text file'
          if (fileName.endsWith('.pdf')) fileType = 'PDF file'
          else if (fileName.endsWith('.docx')) fileType = 'DOCX file'
          else if (fileName.endsWith('.py')) fileType = 'Python file'
          else if (fileName.endsWith('.js') || fileName.endsWith('.jsx'))
            fileType = 'JavaScript file'
          else if (fileName.endsWith('.ts') || fileName.endsWith('.tsx'))
            fileType = 'TypeScript file'
          else if (fileName.endsWith('.java')) fileType = 'Java file'
          else if (
            fileName.endsWith('.cpp') ||
            fileName.endsWith('.cc') ||
            fileName.endsWith('.cxx') ||
            fileName.endsWith('.c')
          )
            fileType = 'C/C++ file'
          else if (fileName.endsWith('.cs')) fileType = 'C# file'
          else if (fileName.endsWith('.rb')) fileType = 'Ruby file'
          else if (fileName.endsWith('.go')) fileType = 'Go file'
          else if (fileName.endsWith('.rs')) fileType = 'Rust file'
          else if (fileName.endsWith('.php')) fileType = 'PHP file'
          else if (fileName.endsWith('.sh') || fileName.endsWith('.bash')) fileType = 'Shell script'
          else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) fileType = 'HTML file'
          else if (fileName.endsWith('.css')) fileType = 'CSS file'
          else if (fileName.endsWith('.json')) fileType = 'JSON file'
          else if (fileName.endsWith('.xml')) fileType = 'XML file'
          else if (fileName.endsWith('.md') || fileName.endsWith('.markdown'))
            fileType = 'Markdown file'
          else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) fileType = 'YAML file'
          else if (fileName.endsWith('.sql')) fileType = 'SQL file'
          else if (fileName.endsWith('.txt')) fileType = 'text file'

          const notification = showNotification(
            `${fileType} "${file.name}" attached (will be expanded on submit)`,
            'success'
          )
          notification.clearAutoRemove()
          setTimeout(() => {
            notification()
          }, 5000)
          return true
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Error attaching file. Please try again.'
          showNotification(errorMessage, 'error')
          console.error('File attachment error:', error)
          return false
        }
      },
      [attachedFiles, setAttachedFiles, input, setInput, isTextOrCodeFile, textareaRef]
    )

    // Handle file upload from file input
    const handleFileUpload = useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        await processFile(file)

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      },
      [processFile]
    )

    // Handle drag and drop events (works for both textarea and actions area)
    const handleDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      // Only show drag-over state if dragging files (not text or other content)
      if (e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true)
      }
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      // Only show drag-over state if dragging files (not text or other content)
      if (e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true)
      }
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()

      // Check if we're actually leaving the textarea container
      // relatedTarget is the element we're moving to
      const relatedTarget = e.relatedTarget as Node | null
      const currentTarget = e.currentTarget

      // If relatedTarget is null or not a child of the textarea container, we're leaving
      if (!relatedTarget) {
        setIsDraggingOver(false)
        return
      }

      // Check if relatedTarget is still within the textarea container
      const textareaContainer = currentTarget.closest('.textarea-container')
      if (textareaContainer && !textareaContainer.contains(relatedTarget)) {
        setIsDraggingOver(false)
      }
    }, [])

    const handleDrop = useCallback(
      async (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingOver(false)

        // Only process if files are being dropped (not text or other content)
        if (!e.dataTransfer.types.includes('Files')) {
          return
        }

        const file = e.dataTransfer.files?.[0]
        if (!file) return

        await processFile(file)
      },
      [processFile]
    )

    // Handle click on upload button
    const handleUploadButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      fileInputRef.current?.click()
      // Remove focus from button after clicking to prevent blue outline
      e.currentTarget.blur()
    }, [])

    // Detect mobile platforms (Android/iOS) to use file explorer instead of media picker
    // On mobile browsers, specific accept attributes can trigger the camera/images dialog
    // instead of the file explorer. Since we validate files client-side anyway, using
    // document-specific MIME types on mobile forces the file explorer to open.
    const isMobileDevice = useMemo(() => {
      if (typeof navigator === 'undefined') return false
      const ua = navigator.userAgent
      return /Android|iPhone|iPad|iPod/i.test(ua)
    }, [])

    // File accept attribute: use document-specific types on mobile to avoid media picker,
    // otherwise use specific types for better UX on other platforms
    const fileAcceptAttribute = useMemo(() => {
      if (isMobileDevice) {
        // On mobile (Android/iOS), use document/text MIME types to force file explorer instead of media picker
        // Explicitly avoid image/*, video/*, and audio/* to prevent camera/gallery options
        // File validation will still happen via isTextOrCodeFile function
        return 'text/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/rtf,application/json,application/javascript,application/xml,.txt,.md,.markdown,.json,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cc,.cxx,.h,.hpp,.cs,.rb,.go,.rs,.swift,.kt,.php,.sh,.bash,.zsh,.fish,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.csv,.sql,.r,.R,.m,.pl,.pm,.lua,.scala,.clj,.cljs,.hs,.elm,.ex,.exs,.dart,.vue,.svelte,.astro,.graphql,.gql,.dockerfile,.env,.gitignore,.gitattributes,.editorconfig,.eslintrc,.prettierrc,.babelrc,.webpack,.rollup,.vite,.makefile,.cmake,.gradle,.maven,.pom,.sbt,.build,.lock,.lockfile,.package,.requirements,.pip,.conda,.dockerignore,.npmignore,.yarnignore,.eslintignore,.prettierignore,.pdf,.docx,.doc,.rtf,.odt'
      }
      // On other platforms, use specific file types for better UX
      return '.txt,.md,.markdown,.json,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cc,.cxx,.h,.hpp,.cs,.rb,.go,.rs,.swift,.kt,.php,.sh,.bash,.zsh,.fish,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.csv,.sql,.r,.R,.m,.pl,.pm,.lua,.scala,.clj,.cljs,.hs,.elm,.ex,.exs,.dart,.vue,.svelte,.astro,.graphql,.gql,.dockerfile,.env,.gitignore,.gitattributes,.editorconfig,.eslintrc,.prettierrc,.babelrc,.webpack,.rollup,.vite,.makefile,.cmake,.gradle,.maven,.pom,.sbt,.build,.lock,.lockfile,.package,.requirements,.pip,.conda,.dockerignore,.npmignore,.yarnignore,.eslintignore,.prettierignore,.pdf,.docx,.doc,.rtf,.odt,text/*,application/json,application/javascript,application/xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/rtf,application/vnd.oasis.opendocument.text'
    }, [isMobileDevice])

    return (
      <>
        <div
          className="follow-up-header"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          {isFollowUpMode ? (
            <>
              <h2 style={{ margin: 0 }}>Follow Up Mode</h2>
              <button
                onClick={onNewComparison}
                className="textarea-icon-button new-inquiry-button"
                title="Exit follow up mode"
                disabled={isLoading}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  minWidth: '32px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    width: '20px',
                    height: '20px',
                    display: 'block',
                    flexShrink: 0,
                  }}
                >
                  <path
                    d="M12 2v6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
            </>
          ) : (
            <h2>Enter Your Prompt</h2>
          )}
        </div>

        <div className={`textarea-container ${isAnimatingTextarea ? 'animate-pulse-border' : ''}`}>
          {/* Wrapper for textarea */}
          <div className="textarea-wrapper">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                // adjustTextareaHeight will be called via useEffect
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  // Don't submit during tutorial steps 3 and 6 - user must click "Done with input" first
                  if (tutorialStep === 'enter-prompt' || tutorialStep === 'enter-prompt-2') {
                    return
                  }
                  if (isFollowUpMode) {
                    onContinueConversation()
                  } else {
                    onSubmitClick()
                  }
                }
              }}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              placeholder={
                isFollowUpMode ? 'Continue your conversation here' : 'Type anything you want...'
              }
              className={`hero-input-textarea ${isDraggingOver ? 'drag-over' : ''}`}
              rows={1}
              data-testid="comparison-input-textarea"
            />
          </div>

          {/* Actions area below textarea - looks like part of textarea */}
          <div
            className={`textarea-actions-area ${isDraggingOver ? 'drag-over' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* History Toggle Button - positioned on left side */}
            <button
              type="button"
              className={`history-toggle-button ${showHistoryDropdown ? 'active' : ''}`}
              onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              title="Load previous conversations"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* Saved Model Selections Button */}
            <div className="saved-selections-container" ref={savedSelectionsRef}>
              <button
                type="button"
                className={`saved-selections-button ${showSavedSelectionsDropdown ? 'active' : ''}`}
                onClick={e => {
                  e.stopPropagation()
                  setShowSavedSelectionsDropdown(!showSavedSelectionsDropdown)
                  setIsInSaveMode(false)
                  setSaveSelectionName('')
                  setSaveSelectionError(null)
                }}
                title="Save or load model selections"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* Bookmark/save icon */}
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              {/* Default selection name display - available for all users when not overridden */}
              {!defaultSelectionOverridden &&
                (() => {
                  const defaultSelection = getDefaultSelection()
                  if (!defaultSelection) return null
                  return (
                    <span className="default-selection-name" title={`Default model selection`}>
                      {defaultSelection.name}
                    </span>
                  )
                })()}
            </div>

            <div className="textarea-actions">
              {/* File upload input - hidden */}
              <input
                ref={fileInputRef}
                type="file"
                accept={fileAcceptAttribute}
                capture={isMobileDevice ? false : undefined}
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              {/* Token usage pie chart indicator */}
              {(isFollowUpMode || input.trim().length > 0) &&
                (() => {
                  const percentage = tokenUsagePercentage
                  const totalInputTokens = tokenUsagePercentageInfo.totalInputTokens
                  const radius = 14 // 32px diameter / 2 - 2px stroke
                  const circumference = 2 * Math.PI * radius

                  // For visual display, use a minimum of 1% when there are actual tokens
                  // This ensures users can see that their prompt is being counted even if < 1%
                  const hasTokens = totalInputTokens > 0
                  const displayPercentage = hasTokens && percentage < 1 ? 1 : percentage
                  const offset = circumference - (displayPercentage / 100) * circumference

                  // Determine color based on percentage
                  let fillColor = '#3b82f6' // Blue for normal usage
                  if (percentage >= 90) {
                    fillColor = '#ef4444' // Red for high usage
                  } else if (percentage >= 75) {
                    fillColor = '#f59e0b' // Orange for medium-high usage
                  } else if (percentage >= 50) {
                    fillColor = '#eab308' // Yellow for medium usage
                  }

                  // Build tooltip text - show "<1%" for sub-1% usage
                  let tooltipText: string
                  if (percentage < 1 && percentage > 0) {
                    tooltipText = '<1% of input capacity used'
                  } else {
                    tooltipText = `${Math.round(percentage)}% of input capacity used`
                  }

                  // Append "Limited by..." message only when usage >= 50% and there's a limiting model
                  if (tokenUsagePercentageInfo.limitingModel && percentage >= 50) {
                    tooltipText += ` (Limited by ${tokenUsagePercentageInfo.limitingModel.name} at ${tokenUsagePercentageInfo.limitingModel.capacityChars})`
                  }

                  return (
                    <div
                      className="token-usage-indicator"
                      title={tooltipText}
                      style={{ cursor: 'default' }}
                    >
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 32 32"
                        style={{ transform: 'rotate(-90deg)' }}
                      >
                        {/* Background circle (grey) */}
                        <circle
                          cx="16"
                          cy="16"
                          r={radius}
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="2"
                        />
                        {/* Progress circle (filled portion) - show minimum 1% visual when tokens exist */}
                        {hasTokens && (
                          <circle
                            cx="16"
                            cy="16"
                            r={radius}
                            fill="none"
                            stroke={fillColor}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            style={{
                              transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease',
                            }}
                          />
                        )}
                      </svg>
                    </div>
                  )
                })()}
              {/* File upload button */}
              <button
                type="button"
                onClick={handleUploadButtonClick}
                className="textarea-icon-button file-upload-button"
                title="Select or drag file here"
                disabled={isLoading}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ width: '20px', height: '20px', display: 'block' }}
                >
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {/* Voice input button - only shown for Chromium-based browsers */}
              {isSpeechSupported && speechBrowserSupport === 'native' && (
                <button
                  type="button"
                  onClick={() =>
                    isSpeechListening ? stopSpeechListening() : startSpeechListening()
                  }
                  className={`textarea-icon-button voice-button ${isSpeechListening ? 'active' : ''}`}
                  title={isSpeechListening ? 'Stop recording' : 'Start voice input'}
                  disabled={isLoading}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ width: '20px', height: '20px', display: 'block' }}
                  >
                    <path
                      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill={isSpeechListening ? 'currentColor' : 'none'}
                    />
                    <path
                      d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              {/* Enable Web Access Toggle - styled like voice button */}
              <button
                type="button"
                onClick={() => {
                  const isDisabled = !canEnableWebSearch || isLoading
                  if (isDisabled) {
                    if (isTouchDevice) {
                      handleDisabledButtonTap('websearch')
                    }
                    // On desktop, disabled buttons won't fire onClick, so this is safe
                    return
                  }
                  setWebSearchEnabled(!webSearchEnabled)
                }}
                className={`textarea-icon-button web-search-button ${webSearchEnabled ? 'active' : ''} ${(!canEnableWebSearch || isLoading) && isTouchDevice ? 'touch-disabled' : ''}`}
                title={
                  !canEnableWebSearch
                    ? 'Select a web-enabled model'
                    : webSearchEnabled
                      ? 'Web search enabled'
                      : 'Enable web search'
                }
                disabled={!isTouchDevice && (!canEnableWebSearch || isLoading)}
                aria-disabled={!canEnableWebSearch || isLoading}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    width: '20px',
                    height: '20px',
                  }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <path
                    d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                onClick={() => {
                  // Block submit during tutorial step 3 (enter-prompt) and step 6 (enter-prompt-2)
                  // User must advance to the next step before submitting
                  if (tutorialStep === 'enter-prompt' || tutorialStep === 'enter-prompt-2') {
                    return
                  }
                  const isDisabled =
                    isLoading ||
                    creditsRemaining <= 0 ||
                    (!isFollowUpMode && (!input.trim() || selectedModels.length === 0))
                  if (isDisabled) {
                    if (isTouchDevice) {
                      handleDisabledButtonTap('submit')
                    }
                    // On desktop, disabled buttons won't fire onClick, so this is safe
                    return
                  }
                  if (isFollowUpMode) {
                    onContinueConversation()
                  } else {
                    onSubmitClick()
                  }
                }}
                disabled={
                  !isTouchDevice &&
                  (isLoading ||
                    creditsRemaining <= 0 ||
                    (!isFollowUpMode && (!input.trim() || selectedModels.length === 0)))
                }
                className={`textarea-icon-button submit-button ${isAnimatingButton ? 'animate-pulse-glow' : ''} ${
                  (isLoading ||
                    creditsRemaining <= 0 ||
                    (!isFollowUpMode && (!input.trim() || selectedModels.length === 0))) &&
                  isTouchDevice
                    ? 'touch-disabled'
                    : ''
                }`}
                title={(() => {
                  if (creditsRemaining <= 0) {
                    return 'You have run out of credits'
                  }
                  if (isLoading) {
                    return 'Submit'
                  }
                  if (!isFollowUpMode && (!input.trim() || selectedModels.length === 0)) {
                    return 'Enter prompt and select models'
                  }
                  if (isFollowUpMode && tokenUsageInfo && tokenUsageInfo.isExceeded) {
                    return 'Input capacity exceeded - inputs may be truncated'
                  }
                  return 'Submit'
                })()}
                data-testid="comparison-submit-button"
                aria-disabled={
                  isLoading ||
                  creditsRemaining <= 0 ||
                  (!isFollowUpMode && (!input.trim() || selectedModels.length === 0))
                }
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M7 14l5-5 5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* History List */}
          {showHistoryDropdown &&
            (() => {
              // Check if notification should be shown
              const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
              const tierLimit = getConversationLimit(userTier)
              const shouldShowNotification =
                (userTier === 'unregistered' || userTier === 'free') &&
                conversationHistory.length >= tierLimit

              // Determine max visible entries for dropdown display
              // Anonymous: 2, Free: 3, Paid: 3 (with scrolling)
              const maxVisibleEntries = userTier === 'unregistered' ? 2 : 3

              // For paid tiers, show scrolling when there are more than 3 entries
              // For anonymous/free, hide scrollbar when at or below limit
              const isPaidTier = userTier !== 'unregistered' && userTier !== 'free'
              const shouldHideScrollbar =
                !isPaidTier &&
                conversationHistory.length <= maxVisibleEntries &&
                !shouldShowNotification

              // Only calculate max height when there are entries to show
              // Each entry: 1rem top padding (16px) + content (~23px prompt + 8px margin + ~15px meta) + 1rem bottom padding (16px) ≈ 78px
              // Plus borders between items (1px each)
              // Notification height: ~70px desktop (margin-top 8px + padding-top 8px + 2 lines of text ~41px + padding-bottom 8px + some buffer)
              // Mobile: ~130px (flex column layout takes more vertical space: 2 lines + gap + padding + margin + extra buffer for visibility)
              const getMaxHeight = () => {
                // If no entries, return undefined to allow natural height
                if (conversationHistory.length === 0) {
                  return undefined
                }

                // Increase notification height estimate for mobile due to flex column layout
                // Mobile needs space: 2 lines of text (~50px) + gap (6px) + padding-top (8px) + padding-bottom (4px) + margin-top (8px) + margin-bottom (4px) + content padding (8px) + buffer (5px) ≈ 93px
                // Using 95px to account for spacing while minimizing white space
                const notificationHeight = shouldShowNotification ? (isSmallLayout ? 95 : 70) : 0

                if (maxVisibleEntries === 2) {
                  // Unregistered tier: 2 entries max
                  return `${165 + notificationHeight}px`
                }
                // Free/Paid tiers: 3 entries max visible
                return `${250 + notificationHeight}px`
              }

              const maxHeight = getMaxHeight()
              // For paid tiers, set both maxHeight and height to ensure scrolling works
              // For other tiers, only set maxHeight to allow shrinking when empty
              const containerStyle = maxHeight
                ? isPaidTier
                  ? { maxHeight, height: maxHeight }
                  : { maxHeight }
                : undefined

              return (
                <div
                  className={`history-inline-list ${shouldHideScrollbar ? 'no-scrollbar' : 'scrollable'}`}
                  style={containerStyle}
                >
                  <div className="history-inline-list-content">
                    {isLoadingHistory ? (
                      <div className="history-loading">Loading...</div>
                    ) : conversationHistory.length === 0 ? (
                      <div className="history-empty">No conversation history</div>
                    ) : (
                      <>
                        {conversationHistory
                          .slice(0, isPaidTier ? historyLimit : maxVisibleEntries)
                          .map(summary => {
                            const isActive =
                              currentVisibleComparisonId &&
                              String(summary.id) === currentVisibleComparisonId

                            return (
                              <div
                                key={summary.id}
                                className={`history-item ${isActive ? 'history-item-active' : ''}`}
                                onClick={() => onLoadConversation(summary)}
                              >
                                <div className="history-item-content">
                                  <div className="history-item-prompt">
                                    {truncatePrompt(summary.input_data)}
                                    {summary.conversation_type === 'breakout' && (
                                      <span
                                        className="history-item-breakout-badge"
                                        title="Breakout conversation"
                                      >
                                        ↗
                                      </span>
                                    )}
                                  </div>
                                  <div className="history-item-meta">
                                    <span className="history-item-models">
                                      {summary.models_used.length === 1
                                        ? summary.models_used[0].split('/').pop() ||
                                          summary.models_used[0]
                                        : `${summary.models_used.length} models`}
                                    </span>
                                    <span className="history-item-date">
                                      {formatDate(summary.created_at)}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  className="history-item-delete"
                                  onClick={e => onDeleteConversation(summary, e)}
                                >
                                  ×
                                </button>
                              </div>
                            )
                          })}

                        {/* Tier limit message */}
                        {(() => {
                          const userTier = isAuthenticated
                            ? user?.subscription_tier || 'free'
                            : 'unregistered'
                          const tierLimit = getConversationLimit(userTier)

                          if (userTier !== 'unregistered' && userTier !== 'free') {
                            return null
                          }

                          const visibleCount = conversationHistory.length
                          const isAtLimit = visibleCount >= tierLimit

                          if (!isAtLimit) {
                            return null
                          }

                          if (!isAuthenticated) {
                            return (
                              <div className="history-signup-prompt">
                                <div className="history-signup-message">
                                  <span className="history-signup-line">
                                    You can only save the last 2 comparisons.
                                  </span>
                                  <span className="history-signup-line">
                                    {' '}
                                    Sign up for a free account to save more!
                                  </span>
                                </div>
                              </div>
                            )
                          } else {
                            return (
                              <div className="history-signup-prompt">
                                <div className="history-signup-message">
                                  <span className="history-signup-line">
                                    You only have 3 saves for your tier.
                                  </span>
                                  <span className="history-signup-line">
                                    {' '}
                                    Upgrade to save more comparisons!
                                  </span>
                                </div>
                              </div>
                            )
                          }
                        })()}
                      </>
                    )}
                  </div>
                </div>
              )
            })()}

          {/* Saved Model Selections Dropdown */}
          {showSavedSelectionsDropdown && (
            <div className="saved-selections-dropdown">
              <div className="saved-selections-content">
                <div className="saved-selections-header">
                  <h4>Saved Model Selections</h4>
                  <span className="saved-selections-count">
                    {savedModelSelections.length} / {maxSavedSelections}
                  </span>
                </div>

                {/* Save Current Selection Section */}
                {isInSaveMode ? (
                  <div className="saved-selections-save-form">
                    <input
                      type="text"
                      placeholder="Enter a name for this selection..."
                      value={saveSelectionName}
                      onChange={e => {
                        setSaveSelectionName(e.target.value)
                        setSaveSelectionError(null)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const result = onSaveModelSelection(saveSelectionName)
                          if (result.success) {
                            setSaveSelectionName('')
                            setIsInSaveMode(false)
                            showNotification('Model selection saved successfully!', 'success')
                          } else {
                            setSaveSelectionError(result.error || 'Failed to save selection')
                          }
                        } else if (e.key === 'Escape') {
                          setIsInSaveMode(false)
                          setSaveSelectionName('')
                          setSaveSelectionError(null)
                        }
                      }}
                      autoFocus
                      maxLength={50}
                      className="saved-selections-name-input"
                    />
                    <div className="saved-selections-save-actions">
                      <button
                        type="button"
                        className="saved-selections-save-btn"
                        onClick={() => {
                          const result = onSaveModelSelection(saveSelectionName)
                          if (result.success) {
                            setSaveSelectionName('')
                            setIsInSaveMode(false)
                            showNotification('Model selection saved successfully!', 'success')
                          } else {
                            setSaveSelectionError(result.error || 'Failed to save selection')
                          }
                        }}
                        disabled={!saveSelectionName.trim()}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="saved-selections-cancel-btn"
                        onClick={() => {
                          setIsInSaveMode(false)
                          setSaveSelectionName('')
                          setSaveSelectionError(null)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {saveSelectionError && (
                      <div className="saved-selections-error">{saveSelectionError}</div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="saved-selections-add-btn"
                    onClick={() => {
                      if (!canSaveMoreSelections) {
                        showNotification(
                          `Maximum of ${maxSavedSelections} saved selections reached. Delete one to save a new selection.`,
                          'error'
                        )
                        return
                      }
                      if (selectedModels.length === 0) {
                        showNotification('Please select at least one model to save', 'error')
                        return
                      }
                      setIsInSaveMode(true)
                    }}
                    disabled={
                      !canSaveMoreSelections || selectedModels.length === 0 || isFollowUpMode
                    }
                    title={
                      isFollowUpMode
                        ? 'Cannot save selections during follow-up mode'
                        : !canSaveMoreSelections
                          ? `Maximum of ${maxSavedSelections} saved selections reached`
                          : selectedModels.length === 0
                            ? 'Select models to save'
                            : 'Save current model selection'
                    }
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
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Save Current Selection ({selectedModels.length} model
                    {selectedModels.length !== 1 ? 's' : ''})
                  </button>
                )}

                {/* Saved Selections List - wrapped for scrolling */}
                <div className="saved-selections-list-wrapper">
                  <div className="saved-selections-list">
                    {savedModelSelections.length === 0 ? (
                      <div className="saved-selections-empty">
                        No saved selections yet. Save your current model selection to quickly load
                        it later!
                      </div>
                    ) : (
                      savedModelSelections.map(selection => {
                        const defaultSelectionId = getDefaultSelectionId()
                        const isDefault = defaultSelectionId === selection.id
                        return (
                          <div key={selection.id} className="saved-selection-item">
                            {/* Default selection checkbox - available for all users */}
                            <input
                              type="checkbox"
                              checked={isDefault}
                              onChange={e => {
                                e.stopPropagation()
                                if (e.target.checked) {
                                  // Set this selection as default
                                  onSetDefaultSelection(selection.id)
                                  showNotification(
                                    `"${selection.name}" set as default selection`,
                                    'success'
                                  )
                                } else {
                                  // Unset default
                                  onSetDefaultSelection(null)
                                  showNotification('Default selection removed', 'success')
                                }
                              }}
                              onClick={e => e.stopPropagation()}
                              title={
                                isDefault
                                  ? `Default model selection`
                                  : `Set as default model selection`
                              }
                              className="saved-selection-default-checkbox"
                            />
                            <div
                              className="saved-selection-info"
                              onClick={() => {
                                if (isFollowUpMode) {
                                  showNotification(
                                    'Cannot load saved selections during follow-up mode',
                                    'error'
                                  )
                                  return
                                }
                                onLoadModelSelection(selection.id)
                                setShowSavedSelectionsDropdown(false)
                                showNotification(
                                  `Loaded "${selection.name}" (${selection.modelIds.length} model${selection.modelIds.length !== 1 ? 's' : ''})`,
                                  'success'
                                )
                              }}
                              title={
                                isFollowUpMode
                                  ? 'Cannot load selections during follow-up mode'
                                  : `Click to load "${selection.name}"`
                              }
                              style={{ cursor: isFollowUpMode ? 'not-allowed' : 'pointer' }}
                            >
                              <div className="saved-selection-name">{selection.name}</div>
                              <div className="saved-selection-meta">
                                {selection.modelIds.length} model
                                {selection.modelIds.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="saved-selection-delete"
                              onClick={e => {
                                e.stopPropagation()
                                onDeleteModelSelection(selection.id)
                                showNotification(`Deleted "${selection.name}"`, 'success')
                              }}
                              title={`Delete "${selection.name}"`}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Usage Preview - Regular Mode */}
        {!isFollowUpMode && (
          <div className="usage-preview-container">
            {(input.trim() || selectedModels.length > 0) && renderUsagePreview()}
          </div>
        )}

        {/* Context Warning & Usage Preview - Follow-up Mode */}
        {isFollowUpMode &&
          conversations.length > 0 &&
          (() => {
            let warningLevel: 'info' | 'medium' | 'high' | 'critical' | null = null
            let warningMessage = ''
            let warningIcon = ''

            if (tokenUsageInfo) {
              const { percentageRemaining, isExceeded } = tokenUsageInfo

              if (isExceeded) {
                // Exceeded max input - allow but warn about consequences
                warningLevel = 'critical'
                warningIcon = '⚠️'
                warningMessage =
                  "You've exceeded the maximum input capacity. Inputs may be truncated. Starting a new comparison is strongly recommended for best results."
              } else if (percentageRemaining <= 0) {
                // At max input
                warningLevel = 'critical'
                warningIcon = '🚫'
                warningMessage =
                  'Maximum input capacity reached. Please start a fresh comparison for continued assistance.'
              } else if (percentageRemaining <= 10) {
                // 0-10% remaining
                warningLevel = 'critical'
                warningIcon = '✨'
                warningMessage =
                  'Time for a fresh start! Starting a new comparison will give you the best response quality and speed.'
              } else if (percentageRemaining <= 25) {
                // 10-25% remaining
                warningLevel = 'high'
                warningIcon = '💡'
                warningMessage =
                  'Consider starting a fresh comparison! New conversations help maintain optimal context and response quality.'
              } else if (percentageRemaining <= 50) {
                // 25-50% remaining
                warningLevel = 'medium'
                warningIcon = '🎯'
                warningMessage =
                  'Pro tip: Fresh comparisons provide more focused and relevant responses!'
              } else if (percentageRemaining <= 75) {
                // 50-75% remaining
                warningLevel = 'info'
                warningIcon = 'ℹ️'
                warningMessage =
                  'Reminder: Starting a new comparison helps keep responses sharp and context-focused.'
              }
            }

            return (
              <>
                {messageCount > 0 && (
                  <div className="usage-preview-container">{renderUsagePreview()}</div>
                )}

                {warningLevel && (
                  <div className={`context-warning ${warningLevel}`}>
                    <div className="context-warning-content">
                      <div className="context-warning-message">
                        <span className="context-warning-icon">{warningIcon}</span>
                        {warningMessage}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )
          })()}

        {/* Disabled Button Info Modal - shown on touch devices when disabled buttons are tapped */}
        <DisabledButtonInfoModal
          isOpen={disabledButtonInfo.button !== null}
          onClose={() => setDisabledButtonInfo({ button: null, message: '' })}
          buttonType={disabledButtonInfo.button}
          message={disabledButtonInfo.message}
        />
      </>
    )
  }
)

ComparisonForm.displayName = 'ComparisonForm'
