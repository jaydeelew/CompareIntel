import React from 'react'

import { RESULT_TAB } from '../../types'
import type { ModelConversation, ActiveResultTabs, ResultTab } from '../../types'
import { isErrorMessage } from '../../utils/error'

import { ResultCard, type Model } from './ResultCard'

/**
 * ResultsDisplay component props
 */
export interface ResultsDisplayProps {
  /** Conversations to display */
  conversations: ModelConversation[]
  /** Selected model IDs */
  selectedModels: string[]
  /** Set of closed card model IDs */
  closedCards: Set<string>
  /** All available models */
  allModels: Model[]
  /** Active result tabs by model ID */
  activeResultTabs: ActiveResultTabs
  /** Processing time in milliseconds */
  processingTime?: number
  /** Response metadata */
  metadata?: {
    models_completed: number
    models_failed: number
    total_tokens_used: number
  }
  /** Callback to screenshot/copy formatted history */
  onScreenshot?: (modelId: string) => void
  /** Callback to copy raw history */
  onCopyResponse?: (modelId: string) => void
  /** Callback to close/hide a card */
  onCloseCard?: (modelId: string) => void
  /** Callback to switch result tab */
  onSwitchTab?: (modelId: string, tab: ResultTab) => void
  /** Custom className */
  className?: string
}

/**
 * ResultsDisplay component for displaying comparison results grid
 *
 * @example
 * ```tsx
 * <ResultsDisplay
 *   conversations={conversations}
 *   selectedModels={selectedModels}
 *   closedCards={closedCards}
 *   allModels={allModels}
 *   activeResultTabs={activeResultTabs}
 *   onCloseCard={handleCloseCard}
 * />
 * ```
 */
export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  conversations,
  selectedModels,
  closedCards,
  allModels,
  activeResultTabs,
  processingTime,
  metadata,
  onScreenshot,
  onCopyResponse,
  onCloseCard,
  onSwitchTab,
  className = '',
}) => {
  const visibleConversations = conversations.filter(
    conv => selectedModels.includes(conv.modelId) && !closedCards.has(conv.modelId)
  )

  if (visibleConversations.length === 0) {
    return null
  }

  /**
   * Format processing time for display
   */
  const formatProcessingTime = (time: number): string => {
    if (time < 1000) {
      return `${time}ms`
    } else if (time < 60000) {
      return `${(time / 1000).toFixed(1)}s`
    } else {
      const minutes = Math.floor(time / 60000)
      const seconds = Math.floor((time % 60000) / 1000)
      return `${minutes}m ${seconds}s`
    }
  }

  return (
    <section className={`results-section ${className}`.trim()}>
      {metadata && (
        <div className="response-metadata">
          <div className="metadata-item">
            <span className="metadata-label">Models Completed:</span>
            <span className="metadata-value success">{metadata.models_completed}</span>
          </div>
          {metadata.models_failed > 0 && (
            <div className="metadata-item">
              <span className="metadata-label">Models Failed:</span>
              <span className="metadata-value failed">{metadata.models_failed}</span>
            </div>
          )}
          {processingTime && (
            <div className="metadata-item">
              <span className="metadata-label">Processing Time:</span>
              <span className="metadata-value">{formatProcessingTime(processingTime)}</span>
            </div>
          )}
        </div>
      )}

      <div className="results-grid">
        {visibleConversations.map(conversation => {
          const model = allModels.find(m => m.id === conversation.modelId)
          const latestMessage = conversation.messages[conversation.messages.length - 1]
          const isError = isErrorMessage(latestMessage?.content)
          const activeTab = activeResultTabs[conversation.modelId] || RESULT_TAB.FORMATTED

          return (
            <ResultCard
              key={conversation.modelId}
              modelId={conversation.modelId}
              model={model}
              messages={conversation.messages}
              activeTab={activeTab}
              isError={isError}
              onScreenshot={onScreenshot}
              onCopyResponse={onCopyResponse}
              onClose={onCloseCard}
              onSwitchTab={onSwitchTab}
            />
          )
        })}
      </div>
    </section>
  )
}

ResultsDisplay.displayName = 'ResultsDisplay'
