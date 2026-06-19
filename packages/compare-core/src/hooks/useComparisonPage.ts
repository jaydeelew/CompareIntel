import { useCallback, useRef, useState } from 'react'

import type { CompareIntelApiClient } from '../api/client'
import type { ModelInfo, StreamEvent } from '../api/services'
import { buildPromptWithPageContext } from '../tabContext/promptBuilder'
import type { TabContextBundle } from '../tabContext/types'

export interface ModelResult {
  modelId: string
  modelName: string
  content: string
  isStreaming: boolean
  error: string | null
  isComplete: boolean
}

export interface ComparisonPageState {
  input: string
  selectedModels: string[]
  results: ModelResult[]
  isLoading: boolean
  error: string | null
  conversationId: number | null
  webSearchEnabled: boolean
}

export interface UseComparisonPageOptions {
  apiClient: CompareIntelApiClient
  modelsByProvider: Record<string, ModelInfo[]>
  browserFingerprint?: string
  getTabContext?: () => Promise<TabContextBundle | null>
  sharePageContext?: boolean
  maxModels?: number
}

export function useComparisonPage(options: UseComparisonPageOptions) {
  const {
    apiClient,
    modelsByProvider,
    browserFingerprint,
    getTabContext,
    sharePageContext = false,
    maxModels = 4,
  } = options

  const [input, setInput] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [results, setResults] = useState<ModelResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: string; content: string; model_id?: string }>
  >([])

  const abortRef = useRef<AbortController | null>(null)

  const getModelName = useCallback(
    (modelId: string) => {
      for (const models of Object.values(modelsByProvider)) {
        const found = models.find((m) => m.id === modelId)
        if (found) return found.name
      }
      return modelId.split('/').pop() ?? modelId
    },
    [modelsByProvider]
  )

  const toggleModel = useCallback(
    (modelId: string) => {
      setSelectedModels((prev) => {
        if (prev.includes(modelId)) return prev.filter((id) => id !== modelId)
        if (prev.length >= maxModels) return prev
        return [...prev, modelId]
      })
    },
    [maxModels]
  )

  const cancelComparison = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
    setResults((prev) => prev.map((r) => ({ ...r, isStreaming: false })))
  }, [])

  const submitComparison = useCallback(async () => {
    if (!input.trim() || selectedModels.length === 0) {
      setError('Enter a prompt and select at least one model.')
      return
    }

    setError(null)
    setIsLoading(true)
    abortRef.current = new AbortController()

    let promptText = input.trim()
    if (sharePageContext && getTabContext) {
      try {
        const bundle = await getTabContext()
        promptText = buildPromptWithPageContext(promptText, bundle)
      } catch {
        setError('Failed to read page context. Try again or disable page context.')
        setIsLoading(false)
        return
      }
    }

    const initialResults: ModelResult[] = selectedModels.map((modelId) => ({
      modelId,
      modelName: getModelName(modelId),
      content: '',
      isStreaming: true,
      error: null,
      isComplete: false,
    }))
    setResults(initialResults)

    try {
      const stream = apiClient.stream('/compare-stream', {
        input_data: promptText,
        models: selectedModels,
        conversation_history: conversationHistory,
        browser_fingerprint: browserFingerprint,
        conversation_id: conversationId,
        enable_web_search: webSearchEnabled,
        client_source: 'extension',
      })

      for await (const chunk of stream) {
        if (abortRef.current?.signal.aborted) break
        if (!chunk.trim() || chunk === '[DONE]') continue
        let event: StreamEvent
        try {
          event = JSON.parse(chunk) as StreamEvent
        } catch {
          continue
        }

        if (event.conversation_id && typeof event.conversation_id === 'number') {
          setConversationId(event.conversation_id)
        }

        if (event.model_id) {
          setResults((prev) =>
            prev.map((r) => {
              if (r.modelId !== event.model_id) return r
              if (event.type === 'chunk' && event.content) {
                return { ...r, content: r.content + event.content }
              }
              if (event.type === 'error') {
                return { ...r, error: event.error ?? 'Unknown error', isStreaming: false, isComplete: true }
              }
              if (event.type === 'done' || event.type === 'complete') {
                return { ...r, isStreaming: false, isComplete: true }
              }
              return r
            })
          )
        }
      }

      setResults((prev) => {
        const updated = prev.map((r) => ({ ...r, isStreaming: false, isComplete: true }))
        setConversationHistory((hist) => [
          ...hist,
          { role: 'user', content: input.trim() },
          ...updated.map((r) => ({
            role: 'assistant',
            content: r.content,
            model_id: r.modelId,
          })),
        ])
        return updated
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Comparison failed'
      setError(message)
      setResults((prev) =>
        prev.map((r) => ({ ...r, isStreaming: false, error: message, isComplete: true }))
      )
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [
    input,
    selectedModels,
    sharePageContext,
    getTabContext,
    apiClient,
    conversationHistory,
    browserFingerprint,
    conversationId,
    webSearchEnabled,
    getModelName,
  ])

  const newComparison = useCallback(() => {
    cancelComparison()
    setInput('')
    setResults([])
    setConversationHistory([])
    setConversationId(null)
    setError(null)
  }, [cancelComparison])

  return {
    input,
    setInput,
    selectedModels,
    toggleModel,
    setSelectedModels,
    results,
    isLoading,
    error,
    setError,
    conversationId,
    webSearchEnabled,
    setWebSearchEnabled,
    submitComparison,
    cancelComparison,
    newComparison,
    conversationHistory,
  }
}
