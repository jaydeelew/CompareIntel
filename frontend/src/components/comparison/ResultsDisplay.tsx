import React, { useState, useEffect } from 'react'

import { useResponsive } from '../../hooks'
import { RESULT_TAB } from '../../types'
import type { ModelConversation, ActiveResultTabs, ResultTab } from '../../types'
import { isErrorMessage } from '../../utils/error'

import { ResultCard, type Model } from './ResultCard'

export interface ResultsDisplayProps {
  conversations: ModelConversation[]
  selectedModels: string[]
  closedCards: Set<string>
  allModels: Model[]
  activeResultTabs: ActiveResultTabs
  processingTime?: number
  metadata?: {
    models_completed: number
    models_failed: number
    total_tokens_used: number
  }
  modelProcessingStates?: Record<string, boolean>
  /** Override error state per model (e.g. from backend errors, timeouts) */
  modelErrorStates?: Record<string, boolean>
  /** Current breakout animation phase */
  breakoutPhase?: 'idle' | 'fading-out' | 'hidden' | 'fading-in'
  onScreenshot?: (modelId: string) => void
  onCopyResponse?: (modelId: string) => void
  onCloseCard?: (modelId: string) => void
  onSwitchTab?: (modelId: string, tab: ResultTab) => void
  onBreakout?: (modelId: string) => void
  onHideOthers?: (modelId: string) => void
  onCopyMessage?: (modelId: string, messageId: string, content: string) => void
  className?: string
}

// Renders comparison results as a grid (desktop) or tabs (mobile)
export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  conversations,
  selectedModels,
  closedCards,
  allModels,
  activeResultTabs,
  processingTime,
  metadata,
  modelProcessingStates = {},
  modelErrorStates = {},
  breakoutPhase = 'idle',
  onScreenshot,
  onCopyResponse,
  onCloseCard,
  onSwitchTab,
  onBreakout,
  onHideOthers,
  onCopyMessage,
  className = '',
}) => {
  const visibleConversations = conversations.filter(
    conv => selectedModels.includes(conv.modelId) && !closedCards.has(conv.modelId)
  )

  // Responsive state from centralized hook
  const { isMobileLayout } = useResponsive()

  // State for active tab in mobile view (index of the visible card)
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)

  // Reset active tab index if it's out of bounds
  useEffect(() => {
    if (activeTabIndex >= visibleConversations.length && visibleConversations.length > 0) {
      setActiveTabIndex(0)
    }
  }, [activeTabIndex, visibleConversations.length])

  if (visibleConversations.length === 0) return null

  // Compute breakout animation class from phase
  const getBreakoutClass = () => {
    switch (breakoutPhase) {
      case 'fading-out':
        return 'breakout-fade-out'
      case 'hidden':
        return 'breakout-hidden'
      case 'fading-in':
        return 'breakout-fade-in'
      default:
        return ''
    }
  }

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

  // Render tabs UI for mobile layout
  if (isMobileLayout && visibleConversations.length > 1) {
    const activeConversation = visibleConversations[activeTabIndex]
    const activeModel = allModels.find(m => m.id === activeConversation.modelId)
    const latestMessage = activeConversation.messages[activeConversation.messages.length - 1]
    const hasErrorContent = isErrorMessage(latestMessage?.content)
    const isError = modelErrorStates[activeConversation.modelId] || hasErrorContent
    const activeTab = activeResultTabs[activeConversation.modelId] || RESULT_TAB.FORMATTED

    return (
      <section className={`results-section results-section-tabbed ${className}`.trim()}>
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

        <div className="results-tabs-container">
          <div className="results-tabs-header">
            {visibleConversations.map((conversation, index) => {
              const model = allModels.find(m => m.id === conversation.modelId)
              const isActive = index === activeTabIndex
              const latestMsg = conversation.messages[conversation.messages.length - 1]
              const hasError =
                modelErrorStates[conversation.modelId] || isErrorMessage(latestMsg?.content)

              return (
                <button
                  key={conversation.modelId}
                  className={`results-tab-button ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveTabIndex(index)}
                  aria-label={`View results for ${model?.name || conversation.modelId}`}
                  aria-selected={isActive}
                  role="tab"
                >
                  <span className="results-tab-name">{model?.name || conversation.modelId}</span>
                  {hasError && (
                    <span className="results-tab-error-indicator" aria-label="Error">
                      ⚠
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="results-tab-content">
            <ResultCard
              key={activeConversation.modelId}
              modelId={activeConversation.modelId}
              model={activeModel}
              messages={activeConversation.messages}
              activeTab={activeTab}
              isError={isError}
              isProcessing={modelProcessingStates[activeConversation.modelId] || false}
              breakoutClassName={getBreakoutClass()}
              onScreenshot={onScreenshot}
              onCopyResponse={onCopyResponse}
              onClose={onCloseCard}
              onSwitchTab={onSwitchTab}
              onBreakout={onBreakout}
              onHideOthers={onHideOthers}
              onCopyMessage={onCopyMessage}
              showBreakoutButton={visibleConversations.length > 1 && !isError}
            />
          </div>
        </div>
      </section>
    )
  }

  // Render grid layout for desktop or single card
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
          const hasErrorContent = isErrorMessage(latestMessage?.content)
          const isError = modelErrorStates[conversation.modelId] || hasErrorContent
          const activeTab = activeResultTabs[conversation.modelId] || RESULT_TAB.FORMATTED

          return (
            <ResultCard
              key={conversation.modelId}
              modelId={conversation.modelId}
              model={model}
              messages={conversation.messages}
              activeTab={activeTab}
              isError={isError}
              isProcessing={modelProcessingStates[conversation.modelId] || false}
              breakoutClassName={getBreakoutClass()}
              onScreenshot={onScreenshot}
              onCopyResponse={onCopyResponse}
              onClose={onCloseCard}
              onSwitchTab={onSwitchTab}
              onBreakout={onBreakout}
              onHideOthers={onHideOthers}
              onCopyMessage={onCopyMessage}
              showBreakoutButton={visibleConversations.length > 1 && !isError}
            />
          )
        })}
      </div>
    </section>
  )
}

ResultsDisplay.displayName = 'ResultsDisplay'
