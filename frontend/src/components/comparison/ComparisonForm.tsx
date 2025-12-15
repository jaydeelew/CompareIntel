import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import React, { memo, useEffect, useCallback, useMemo, useState, useRef } from 'react'

import { getConversationLimit } from '../../config/constants'
import { useDebounce } from '../../hooks/useDebounce'
import { estimateTokens } from '../../services/compareService'
import type { User, ConversationSummary, ModelConversation } from '../../types'
import type { ModelsByProvider } from '../../types/models'
import { truncatePrompt, formatDate } from '../../utils'
import { showNotification } from '../../utils/error'

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
  }) => {
    const messageCount = conversations.length > 0 ? conversations[0]?.messages.length || 0 : 0

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

    // Debounce input for API calls (only call API when user pauses typing)
    const debouncedInput = useDebounce(input, 600) // 600ms delay

    // Debounced API call for accurate token counting using backend model-specific token estimators
    // Uses backend tokenizers for accurate counting instead of chars/4 estimation
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

      // If input is empty, clear token counts
      if (!debouncedInput.trim()) {
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

      // Only send current input text, not conversation history
      estimateTokens({
        input_data: debouncedInput,
        model_id: modelId,
        // Don't send conversation_history - we'll sum tokens from saved messages instead
      })
        .then(response => {
          // Only update if request wasn't cancelled
          if (!controller.signal.aborted) {
            // response.input_tokens is just for the current input
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
    }, [debouncedInput, isFollowUpMode, selectedModels, conversations, onAccurateTokenCountChange])

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
    // Scrollable after 5 lines (6th line triggers scrolling)
    const adjustTextareaHeight = useCallback(() => {
      if (!textareaRef.current) return

      const textarea = textareaRef.current

      // Check if we're on mobile viewport (max-width: 768px)
      const isMobile = window.innerWidth <= 768

      // On mobile, keep height fixed at min-height and enable scrolling
      if (isMobile) {
        const computedStyle = window.getComputedStyle(textarea)
        const cssMinHeight = parseFloat(computedStyle.minHeight) || 40
        textarea.style.height = `${cssMinHeight}px`
        textarea.style.overflowY = 'auto'
        return
      }

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto'

      // Calculate height for exactly 5 lines of text
      const computedStyle = window.getComputedStyle(textarea)
      const fontSize = parseFloat(computedStyle.fontSize)
      const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.6
      const paddingTop = parseFloat(computedStyle.paddingTop)
      const paddingBottom = parseFloat(computedStyle.paddingBottom)

      // Get CSS min-height value to respect it (important for responsive design)
      const cssMinHeight = parseFloat(computedStyle.minHeight) || 0

      // Calculate height for exactly 5 lines of text content
      const lineHeightPx = lineHeight
      const fiveLinesHeight = lineHeightPx * 5 // Height for 5 lines of text

      // maxHeight = 5 lines + top padding + bottom padding
      // This ensures exactly 5 lines are visible before scrolling starts
      const maxHeight = fiveLinesHeight + paddingTop + paddingBottom

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
        // Set height to maxHeight (5 lines) when content exceeds it, otherwise grow with content
        // But ensure it's at least the CSS min-height
        newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
      }

      textarea.style.height = `${newHeight}px`

      // Enable scrolling when 6th line is needed (content exceeds 5 lines)
      if (scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto'
      } else {
        textarea.style.overflowY = 'hidden'
        // Reset scroll position when not scrolling
        textarea.scrollTop = 0
      }
    }, [input, textareaRef])

    // Adjust height when input changes
    useEffect(() => {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        adjustTextareaHeight()
      })
    }, [input, adjustTextareaHeight])

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

    // Configure PDF.js worker
    useEffect(() => {
      // Use the worker file from the pdfjs-dist package instead of CDN
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

        // Extract text content based on file type
        try {
          const fileName = file.name.toLowerCase()
          let content = ''
          let fileType = 'text file'

          // Handle PDF files
          if (fileName.endsWith('.pdf')) {
            fileType = 'PDF file'
            content = await extractTextFromPDF(file)
          }
          // Handle DOCX files
          else if (fileName.endsWith('.docx')) {
            fileType = 'DOCX file'
            content = await extractTextFromDOCX(file)
          }
          // Handle other document types (DOC, RTF, ODT) - try as text first
          else if (
            fileName.endsWith('.doc') ||
            fileName.endsWith('.rtf') ||
            fileName.endsWith('.odt')
          ) {
            if (fileName.endsWith('.doc')) fileType = 'DOC file'
            else if (fileName.endsWith('.rtf')) fileType = 'RTF file'
            else if (fileName.endsWith('.odt')) fileType = 'ODT file'

            // Try to read as text (works for some RTF files)
            try {
              content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = e => resolve(e.target?.result as string)
                reader.onerror = reject
                reader.readAsText(file)
              })
            } catch {
              showNotification(
                `${fileType} extraction not fully supported. Please convert to PDF or DOCX.`,
                'error'
              )
              return false
            }
          }
          // Handle text/code files
          else {
            // Detect file type for notification
            if (fileName.endsWith('.py')) fileType = 'Python file'
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
            else if (fileName.endsWith('.sh') || fileName.endsWith('.bash'))
              fileType = 'Shell script'
            else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) fileType = 'HTML file'
            else if (fileName.endsWith('.css')) fileType = 'CSS file'
            else if (fileName.endsWith('.json')) fileType = 'JSON file'
            else if (fileName.endsWith('.xml')) fileType = 'XML file'
            else if (fileName.endsWith('.md') || fileName.endsWith('.markdown'))
              fileType = 'Markdown file'
            else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) fileType = 'YAML file'
            else if (fileName.endsWith('.sql')) fileType = 'SQL file'
            else if (fileName.endsWith('.txt')) fileType = 'text file'

            // Read as text
            content = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = e => resolve(e.target?.result as string)
              reader.onerror = reject
              reader.readAsText(file)
            })
          }

          if (content && content.trim()) {
            // Append content to textarea (add newline before if textarea has content)
            const separator = input.trim() ? '\n\n' : ''
            setInput(input + separator + content)

            const notification = showNotification(
              `${fileType} "${file.name}" uploaded successfully`,
              'success'
            )
            // Clear the default 3-second timeout and set a custom 5-second timeout
            notification.clearAutoRemove()
            setTimeout(() => {
              notification()
            }, 5000)
            return true
          } else {
            showNotification(`No text content found in ${fileType}.`, 'error')
            return false
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Error uploading file. Please try again.'
          showNotification(errorMessage, 'error')
          console.error('File upload error:', error)
          return false
        }
      },
      [input, setInput, isTextOrCodeFile, extractTextFromPDF, extractTextFromDOCX]
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

    // Handle drag and drop events
    const handleDragEnter = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault()
      e.stopPropagation()
      // Only show drag-over state if dragging files (not text or other content)
      if (e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true)
      }
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault()
      e.stopPropagation()
      // Only show drag-over state if dragging files (not text or other content)
      if (e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true)
      }
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault()
      e.stopPropagation()
      // Only set dragging to false if we're leaving the textarea itself
      // (not just moving to a child element)
      if (e.currentTarget === e.target) {
        setIsDraggingOver(false)
      }
    }, [])

    const handleDrop = useCallback(
      async (e: React.DragEvent<HTMLTextAreaElement>) => {
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
                isFollowUpMode ? 'Continue your conversation here' : "Let's get started..."
              }
              className={`hero-input-textarea ${isDraggingOver ? 'drag-over' : ''}`}
              rows={1}
              data-testid="comparison-input-textarea"
            />
          </div>

          {/* Actions area below textarea - looks like part of textarea */}
          <div className="textarea-actions-area">
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

            <div className="textarea-actions">
              {/* File upload input - hidden */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.json,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cc,.cxx,.h,.hpp,.cs,.rb,.go,.rs,.swift,.kt,.php,.sh,.bash,.zsh,.fish,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.csv,.sql,.r,.R,.m,.pl,.pm,.lua,.scala,.clj,.cljs,.hs,.elm,.ex,.exs,.dart,.vue,.svelte,.astro,.graphql,.gql,.dockerfile,.env,.gitignore,.gitattributes,.editorconfig,.eslintrc,.prettierrc,.babelrc,.webpack,.rollup,.vite,.makefile,.cmake,.gradle,.maven,.pom,.sbt,.build,.lock,.lockfile,.package,.requirements,.pip,.conda,.dockerignore,.npmignore,.yarnignore,.eslintignore,.prettierignore,.pdf,.docx,.doc,.rtf,.odt,text/*,application/json,application/javascript,application/xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/rtf,application/vnd.oasis.opendocument.text"
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
                title="Upload text or code file"
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
              <button
                onClick={isFollowUpMode ? onContinueConversation : onSubmitClick}
                disabled={isLoading || creditsRemaining <= 0}
                className={`textarea-icon-button submit-button ${!isFollowUpMode && !input.trim() ? 'not-ready' : ''} ${isAnimatingButton ? 'animate-pulse-glow' : ''}`}
                title={(() => {
                  if (creditsRemaining <= 0) {
                    return 'You have run out of credits'
                  }
                  if (isFollowUpMode && tokenUsageInfo && tokenUsageInfo.isExceeded) {
                    return 'Input capacity exceeded - inputs may be truncated'
                  }
                  return 'Submit'
                })()}
                data-testid="comparison-submit-button"
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
              const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous'
              const tierLimit = getConversationLimit(userTier)
              const shouldShowNotification =
                (userTier === 'anonymous' || userTier === 'free') &&
                conversationHistory.length >= tierLimit

              // Allow scrolling when notification is present to ensure message is always visible
              const shouldHideScrollbar = historyLimit <= 3 && !shouldShowNotification

              // Calculate max height based on user tier
              // Each entry: 1rem top padding (16px) + content (~23px prompt + 8px margin + ~15px meta) + 1rem bottom padding (16px) ≈ 78px
              // Plus borders between items (1px each)
              // Notification height: ~70px (margin-top 8px + padding-top 8px + 2 lines of text ~41px + padding-bottom 8px + some buffer)
              const getMaxHeight = () => {
                const notificationHeight = shouldShowNotification ? 70 : 0

                if (historyLimit === 2) {
                  return `${165 + notificationHeight}px` // Height for 2 entries + notification if present
                }
                return `${250 + notificationHeight}px` // Height for 3 entries + notification if present
              }

              const maxHeight = getMaxHeight()
              return (
                <div
                  className={`history-inline-list ${shouldHideScrollbar ? 'no-scrollbar' : 'scrollable'}`}
                  style={{ maxHeight, height: maxHeight }}
                >
                  <div className="history-inline-list-content">
                    {isLoadingHistory ? (
                      <div className="history-loading">Loading...</div>
                    ) : conversationHistory.length === 0 ? (
                      <div className="history-empty">No conversation history</div>
                    ) : (
                      <>
                        {conversationHistory.slice(0, historyLimit).map(summary => {
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
                                </div>
                                <div className="history-item-meta">
                                  <span className="history-item-models">
                                    {summary.models_used.length} model
                                    {summary.models_used.length !== 1 ? 's' : ''}
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
                            : 'anonymous'
                          const tierLimit = getConversationLimit(userTier)

                          if (userTier !== 'anonymous' && userTier !== 'free') {
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
                                    Upgrade to Starter for 10 saved comparisons or Pro for 50!
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
      </>
    )
  }
)

ComparisonForm.displayName = 'ComparisonForm'
