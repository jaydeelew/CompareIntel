/**
 * Custom hook for managing model comparison state
 *
 * Handles comparison request state, results, loading states,
 * and provides helper functions for comparison operations.
 *
 * Note: The actual streaming logic remains in App.tsx due to its
 * tight integration with UI state management. This hook focuses on
 * state management for comparison-related data.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'

import type {
  CompareResponse,
  ModelConversation,
  ActiveResultTabs,
  ConversationMessage,
} from '../types'

export interface UseModelComparisonReturn {
  // Comparison state
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>

  // Response state
  response: CompareResponse | null
  setResponse: React.Dispatch<React.SetStateAction<CompareResponse | null>>
  processingTime: number | null
  setProcessingTime: React.Dispatch<React.SetStateAction<number | null>>

  // Conversation state
  conversations: ModelConversation[]
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  isFollowUpMode: boolean
  setIsFollowUpMode: React.Dispatch<React.SetStateAction<boolean>>
  /** Ephemeral model reasoning text during streaming (not persisted). */
  streamingReasoningByModel: Record<string, string>
  /**
   * Merges live state with a ref backup so reasoning stays visible if React state is
   * accidentally cleared before the next explicit reset (new comparison / login / clear).
   */
  effectiveStreamingReasoningByModel: Record<string, string>
  setStreamingReasoningByModel: React.Dispatch<React.SetStateAction<Record<string, string>>>
  /** Per model: visible answer tokens have started (collapses reasoning panel). */
  streamAnswerStartedByModel: Record<string, boolean>
  setStreamAnswerStartedByModel: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  clearStreamingReasoningUi: () => void
  closedCards: Set<string>
  setClosedCards: React.Dispatch<React.SetStateAction<Set<string>>>

  // Tab state
  activeResultTabs: ActiveResultTabs
  setActiveResultTabs: React.Dispatch<React.SetStateAction<ActiveResultTabs>>

  // Abort controller
  currentAbortController: AbortController | null
  setCurrentAbortController: React.Dispatch<React.SetStateAction<AbortController | null>>

  // Refs
  userCancelledRef: React.MutableRefObject<boolean>
  followUpJustActivatedRef: React.MutableRefObject<boolean>
  hasScrolledToResultsRef: React.MutableRefObject<boolean>
  lastAlignedRoundRef: React.MutableRefObject<number>

  // Auto-scroll refs
  autoScrollPausedRef: React.MutableRefObject<Set<string>>
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
  userInteractingRef: React.MutableRefObject<Set<string>>
  lastScrollTopRef: React.MutableRefObject<Map<string, number>>

  // Scroll lock state
  isScrollLocked: boolean
  setIsScrollLocked: React.Dispatch<React.SetStateAction<boolean>>
  isScrollLockedRef: React.MutableRefObject<boolean>
  syncingFromElementRef: React.MutableRefObject<HTMLElement | null>
  lastSyncTimeRef: React.MutableRefObject<number>

  // Helper functions
  resetComparisonState: () => void
  cancelComparison: () => void
  getFirstUserMessage: () => ConversationMessage | undefined
  getConversationsWithMessages: (selectedModels: string[]) => ModelConversation[]
}

export function useModelComparison(): UseModelComparisonReturn {
  // Comparison state
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Response state
  const [response, setResponse] = useState<CompareResponse | null>(null)
  const [processingTime, setProcessingTime] = useState<number | null>(null)

  // Conversation state
  const [conversations, setConversations] = useState<ModelConversation[]>([])
  const [isFollowUpMode, setIsFollowUpMode] = useState(false)
  const [closedCards, setClosedCards] = useState<Set<string>>(new Set())
  const [streamingReasoningByModel, setStreamingReasoningByModel] = useState<
    Record<string, string>
  >({})
  const [streamAnswerStartedByModel, setStreamAnswerStartedByModel] = useState<
    Record<string, boolean>
  >({})

  /** Survives mistaken clears of streamingReasoningByModel until clearStreamingReasoningUi runs. */
  const streamingReasoningBackupRef = useRef<Record<string, string>>({})

  useEffect(() => {
    for (const [k, v] of Object.entries(streamingReasoningByModel)) {
      if (v && v.trim()) streamingReasoningBackupRef.current[k] = v
    }
  }, [streamingReasoningByModel])

  const effectiveStreamingReasoningByModel = useMemo(() => {
    const out: Record<string, string> = { ...streamingReasoningBackupRef.current }
    for (const [k, v] of Object.entries(streamingReasoningByModel)) {
      if (v && v.trim()) out[k] = v
    }
    return out
  }, [streamingReasoningByModel])

  // Tab state
  const [activeResultTabs, setActiveResultTabs] = useState<ActiveResultTabs>({})

  // Abort controller
  const [currentAbortController, setCurrentAbortController] = useState<AbortController | null>(null)

  // Refs
  const userCancelledRef = useRef(false)
  const followUpJustActivatedRef = useRef(false)
  const hasScrolledToResultsRef = useRef(false)
  const lastAlignedRoundRef = useRef<number>(0)

  // Auto-scroll refs
  const autoScrollPausedRef = useRef<Set<string>>(new Set())
  const scrollListenersRef = useRef<
    Map<
      string,
      {
        scroll: () => void
        wheel: (e: WheelEvent) => void
        touchstart: () => void
        mousedown: () => void
      }
    >
  >(new Map())
  const userInteractingRef = useRef<Set<string>>(new Set())
  const lastScrollTopRef = useRef<Map<string, number>>(new Map())

  // Scroll lock state
  const [isScrollLocked, setIsScrollLocked] = useState(false)
  const isScrollLockedRef = useRef(false)
  const syncingFromElementRef = useRef<HTMLElement | null>(null)
  const lastSyncTimeRef = useRef<number>(0)

  const clearStreamingReasoningUi = useCallback(() => {
    streamingReasoningBackupRef.current = {}
    setStreamingReasoningByModel({})
    setStreamAnswerStartedByModel({})
  }, [])

  // Reset comparison state (for new comparisons)
  const resetComparisonState = useCallback(() => {
    setResponse(null)
    setClosedCards(new Set())
    setProcessingTime(null)
    clearStreamingReasoningUi()
    userCancelledRef.current = false
    hasScrolledToResultsRef.current = false
    autoScrollPausedRef.current.clear()
    userInteractingRef.current.clear()
    lastScrollTopRef.current.clear()
    lastAlignedRoundRef.current = 0
    setIsScrollLocked(false)
  }, [clearStreamingReasoningUi])

  // Cancel ongoing comparison
  const cancelComparison = useCallback(() => {
    if (currentAbortController) {
      currentAbortController.abort()
      setCurrentAbortController(null)
    }
    userCancelledRef.current = true
    setIsLoading(false)
  }, [currentAbortController])

  // Get first user message from conversations (useful for saving)
  const getFirstUserMessage = useCallback((): ConversationMessage | undefined => {
    if (conversations.length === 0) return undefined

    const allUserMessages = conversations
      .flatMap(conv => conv.messages)
      .filter(msg => msg.type === 'user')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    return allUserMessages[0]
  }, [conversations])

  // Get conversations with messages for selected models
  const getConversationsWithMessages = useCallback(
    (selectedModels: string[]): ModelConversation[] => {
      return conversations.filter(
        conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0
      )
    },
    [conversations]
  )

  return {
    // Comparison state
    input,
    setInput,
    isLoading,
    setIsLoading,
    error,
    setError,

    // Response state
    response,
    setResponse,
    processingTime,
    setProcessingTime,

    // Conversation state
    conversations,
    setConversations,
    isFollowUpMode,
    setIsFollowUpMode,
    closedCards,
    setClosedCards,
    streamingReasoningByModel,
    effectiveStreamingReasoningByModel,
    setStreamingReasoningByModel,
    streamAnswerStartedByModel,
    setStreamAnswerStartedByModel,
    clearStreamingReasoningUi,

    // Tab state
    activeResultTabs,
    setActiveResultTabs,

    // Abort controller
    currentAbortController,
    setCurrentAbortController,

    // Refs
    userCancelledRef,
    followUpJustActivatedRef,
    hasScrolledToResultsRef,
    lastAlignedRoundRef,

    // Auto-scroll refs
    autoScrollPausedRef,
    scrollListenersRef,
    userInteractingRef,
    lastScrollTopRef,

    // Scroll lock state
    isScrollLocked,
    setIsScrollLocked,
    isScrollLockedRef,
    syncingFromElementRef,
    lastSyncTimeRef,

    // Helper functions
    resetComparisonState,
    cancelComparison,
    getFirstUserMessage,
    getConversationsWithMessages,
  }
}
