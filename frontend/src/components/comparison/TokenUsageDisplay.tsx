import { useEffect, useMemo, useRef, useState } from 'react'

import { useDebounce } from '../../hooks'
import { estimateTokens } from '../../services/compareService'
import type { ModelConversation } from '../../types'
import type { ModelsByProvider } from '../../types/models'
import logger from '../../utils/logger'

import type { AttachedFile, StoredAttachedFile } from './FileUpload'
import { UsageIndicatorInfoModal } from './UsageIndicatorInfoModal'

export interface TokenUsageInfo {
  minMaxInputTokens: number
  currentInputTokens: number
  conversationHistoryTokens: number
  totalInputTokens: number
  percentageUsed: number
  percentageRemaining: number
  isExceeded: boolean
  isAccurate: boolean
  isLoadingAccurate: boolean
}

export interface TokenUsageDisplayProps {
  input: string
  selectedModels: string[]
  conversations: ModelConversation[]
  modelsByProvider: ModelsByProvider
  isFollowUpMode: boolean
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  onExpandFiles?: (
    files: (AttachedFile | StoredAttachedFile)[],
    userInput: string
  ) => Promise<string>
  onAccurateTokenCountChange?: (totalInputTokens: number | null) => void
  onTokenUsageInfoChange?: (info: TokenUsageInfo | null) => void
  tutorialIsActive?: boolean
}

function formatCapacityChars(tokens: number): string {
  const chars = tokens * 4
  if (chars >= 1_000_000) return `~${(chars / 1_000_000).toFixed(1)}M chars`
  if (chars >= 1_000) return `~${Math.round(chars / 1_000)}k chars`
  return `~${chars} chars`
}

function estimateTokensSimple(text: string): number {
  if (!text.trim()) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function getConversationHistoryTokens(
  conversations: ModelConversation[],
  selectedModels: string[]
): number {
  const tokenCountsByModel: Record<string, number> = {}
  const selectedConversations = conversations.filter(conv => {
    const convModelIdStr = String(conv.modelId)
    return selectedModels.some(id => String(id) === convModelIdStr) && conv.messages.length > 0
  })

  selectedConversations.forEach(conv => {
    const modelId = String(conv.modelId)
    let total = 0
    conv.messages.forEach(msg => {
      if (msg.type === 'user' && msg.input_tokens) total += msg.input_tokens
      else if (msg.type === 'assistant' && msg.output_tokens) total += msg.output_tokens
    })
    tokenCountsByModel[modelId] = total
  })

  return Object.keys(tokenCountsByModel).length > 0
    ? Math.max(...Object.values(tokenCountsByModel))
    : 0
}

export function TokenUsageDisplay({
  input,
  selectedModels,
  conversations,
  modelsByProvider,
  isFollowUpMode,
  attachedFiles,
  onExpandFiles,
  onAccurateTokenCountChange,
  onTokenUsageInfoChange,
  tutorialIsActive = false,
}: TokenUsageDisplayProps) {
  const debouncedInput = useDebounce(input, 600)
  const [accurateTokenCounts, setAccurateTokenCounts] = useState<{
    input_tokens: number
    conversation_history_tokens: number
    total_input_tokens: number
  } | null>(null)
  const [isLoadingAccurateTokens, setIsLoadingAccurateTokens] = useState(false)
  const [showUsageIndicatorInfo, setShowUsageIndicatorInfo] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (selectedModels.length === 0) {
      setAccurateTokenCounts(null)
      onAccurateTokenCountChange?.(null)
      return
    }
    if (!debouncedInput.trim() && attachedFiles.length === 0) {
      setAccurateTokenCounts(null)
      onAccurateTokenCountChange?.(null)
      return
    }

    if (abortControllerRef.current) abortControllerRef.current.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsLoadingAccurateTokens(true)

    const modelId = selectedModels[0]
    const getExpandedInput = async (): Promise<string> => {
      if (attachedFiles.length > 0 && onExpandFiles) {
        try {
          return await onExpandFiles(attachedFiles, debouncedInput)
        } catch (error) {
          logger.warn('Failed to expand files for token counting:', error)
          return debouncedInput
        }
      }
      return debouncedInput
    }

    getExpandedInput()
      .then(expandedInput =>
        controller.signal.aborted
          ? null
          : estimateTokens({ input_data: expandedInput, model_id: modelId })
      )
      .then(response => {
        if (!controller.signal.aborted && response) {
          setAccurateTokenCounts({
            input_tokens: response.input_tokens,
            conversation_history_tokens: 0,
            total_input_tokens: response.input_tokens,
          })
        }
        if (!controller.signal.aborted) setIsLoadingAccurateTokens(false)
      })
      .catch(error => {
        if (error.name === 'AbortError' || controller.signal.aborted) return
        logger.warn('Failed to get accurate token count from backend:', error)
        setIsLoadingAccurateTokens(false)
        onAccurateTokenCountChange?.(null)
      })

    return () => controller.abort()
  }, [debouncedInput, attachedFiles, selectedModels, onAccurateTokenCountChange, onExpandFiles])

  const conversationHistoryTokens = useMemo(
    () => getConversationHistoryTokens(conversations, selectedModels),
    [conversations, selectedModels]
  )

  const tokenUsageInfo = useMemo(() => {
    if (!isFollowUpMode || selectedModels.length === 0 || conversations.length === 0) {
      return null
    }

    const modelLimits = selectedModels
      .map(id => {
        const idStr = String(id)
        for (const providerModels of Object.values(modelsByProvider)) {
          const model = providerModels.find(m => String(m.id) === idStr)
          if (model?.max_input_tokens) return model.max_input_tokens
        }
        return null
      })
      .filter((l): l is number => l !== null)

    if (modelLimits.length === 0) return null
    const minMaxInputTokens = Math.min(...modelLimits)

    const currentInputTokens = accurateTokenCounts?.input_tokens ?? 0
    const totalInputTokens = currentInputTokens + conversationHistoryTokens
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
      isAccurate: accurateTokenCounts !== null,
      isLoadingAccurate: isLoadingAccurateTokens,
    }
  }, [
    isFollowUpMode,
    selectedModels,
    conversations,
    modelsByProvider,
    accurateTokenCounts,
    isLoadingAccurateTokens,
    conversationHistoryTokens,
  ])

  useEffect(() => {
    onTokenUsageInfoChange?.(tokenUsageInfo)
  }, [tokenUsageInfo, onTokenUsageInfoChange])

  useEffect(() => {
    if (tokenUsageInfo && onAccurateTokenCountChange) {
      onAccurateTokenCountChange(tokenUsageInfo.totalInputTokens)
    } else if (!isFollowUpMode && accurateTokenCounts && onAccurateTokenCountChange) {
      onAccurateTokenCountChange(accurateTokenCounts.input_tokens)
    } else if (!accurateTokenCounts && onAccurateTokenCountChange) {
      onAccurateTokenCountChange(null)
    }
  }, [tokenUsageInfo, accurateTokenCounts, isFollowUpMode, onAccurateTokenCountChange])

  const tokenUsagePercentageInfo = useMemo(() => {
    if (selectedModels.length === 0) {
      return { percentage: 0, limitingModel: null, totalInputTokens: 0 }
    }

    const modelLimitsWithInfo = selectedModels
      .map(id => {
        const idStr = String(id)
        for (const providerModels of Object.values(modelsByProvider)) {
          const model = providerModels.find(m => String(m.id) === idStr)
          if (model?.max_input_tokens)
            return { modelId: idStr, modelName: model.name, maxInputTokens: model.max_input_tokens }
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

    const minLimit = Math.min(...modelLimitsWithInfo.map(i => i.maxInputTokens))
    const maxLimit = Math.max(...modelLimitsWithInfo.map(i => i.maxInputTokens))
    const limitingModelInfo = modelLimitsWithInfo.find(i => i.maxInputTokens === minLimit)
    const hasSignificantDifference = maxLimit > 0 && minLimit / maxLimit < 0.5

    let totalInputTokens: number
    if (accurateTokenCounts) {
      totalInputTokens = accurateTokenCounts.input_tokens + conversationHistoryTokens
    } else {
      totalInputTokens = estimateTokensSimple(input) + conversationHistoryTokens
    }

    const percentage = Math.min(100, Math.max(0, (totalInputTokens / minLimit) * 100))

    return {
      percentage,
      totalInputTokens,
      limitingModel:
        hasSignificantDifference && limitingModelInfo
          ? {
              name: limitingModelInfo.modelName,
              capacityChars: formatCapacityChars(limitingModelInfo.maxInputTokens),
            }
          : null,
    }
  }, [selectedModels, input, modelsByProvider, accurateTokenCounts, conversationHistoryTokens])

  const { percentage, totalInputTokens, limitingModel } = tokenUsagePercentageInfo

  if (!isFollowUpMode && input.trim().length === 0) return null

  const radius = 14
  const circumference = 2 * Math.PI * radius
  const hasTokens = totalInputTokens > 0
  const displayPercentage = hasTokens && percentage < 1 ? 1 : percentage
  const offset = circumference - (displayPercentage / 100) * circumference

  let fillColor = '#3b82f6'
  if (percentage >= 90) fillColor = '#ef4444'
  else if (percentage >= 75) fillColor = '#f59e0b'
  else if (percentage >= 50) fillColor = '#eab308'

  let tooltipText: string
  if (selectedModels.length === 0) {
    tooltipText = 'Select models first'
  } else {
    tooltipText =
      percentage < 1 && percentage > 0
        ? '<1% of input capacity used'
        : `${Math.round(percentage)}% of input capacity used`
    if (limitingModel && percentage >= 50) {
      tooltipText += ` (Limited by ${limitingModel.name} at ${limitingModel.capacityChars})`
    }
  }

  return (
    <>
      <div
        className="token-usage-indicator"
        title={tooltipText}
        onClick={() => {
          if (!tutorialIsActive) setShowUsageIndicatorInfo(true)
        }}
        style={{
          touchAction: 'manipulation',
          cursor: tutorialIsActive ? 'default' : 'pointer',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          style={{ transform: 'rotate(-90deg)', pointerEvents: 'none' }}
        >
          <circle cx="16" cy="16" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="2" />
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
              style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
            />
          )}
        </svg>
      </div>
      <UsageIndicatorInfoModal
        isOpen={showUsageIndicatorInfo}
        onClose={() => setShowUsageIndicatorInfo(false)}
        percentage={percentage}
        totalInputTokens={totalInputTokens}
        limitingModel={limitingModel}
        hasSelectedModels={selectedModels.length > 0}
      />
    </>
  )
}
