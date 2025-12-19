import React, { useState, useEffect } from 'react'

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

  // Reset active tab index if it's out of bounds
  useEffect(() => {
    if (activeTabIndex >= visibleConversations.length && visibleConversations.length > 0) {
      setActiveTabIndex(0)
    }
  }, [activeTabIndex, visibleConversations.length])

  // Debug logging (can be removed later)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ResultsDisplay] Component rendered:', {
        isMobileLayout,
        visibleConversationsCount: visibleConversations.length,
        windowWidth: typeof window !== 'undefined' ? window.innerWidth : 'N/A',
        willShowTabs: isMobileLayout && visibleConversations.length > 1
      })
    }
  }, [isMobileLayout, visibleConversations.length])

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

  // Render tabs UI for mobile layout
  if (isMobileLayout && visibleConversations.length > 1) {
    const activeConversation = visibleConversations[activeTabIndex]
    const activeModel = allModels.find(m => m.id === activeConversation.modelId)
    const latestMessage = activeConversation.messages[activeConversation.messages.length - 1]
    const isError = isErrorMessage(latestMessage?.content)
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
              onScreenshot={onScreenshot}
              onCopyResponse={onCopyResponse}
              onClose={onCloseCard}
              onSwitchTab={onSwitchTab}
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
