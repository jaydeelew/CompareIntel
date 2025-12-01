import React, { useState, useEffect } from 'react'

import { RESULT_TAB, type ResultTab, type ConversationMessage } from '../../types'
import { getSafeId } from '../../utils'
import { isErrorMessage } from '../../utils/error'
import { MessageBubble } from '../conversation/MessageBubble'

/**
 * Model type for ResultCard
 */
export interface Model {
  id: string
  name: string
  description?: string
}

/**
 * ResultCard component props
 */
export interface ResultCardProps {
  /** Model ID */
  modelId: string
  /** Model details */
  model?: Model
  /** Conversation messages */
  messages: ConversationMessage[]
  /** Active result tab (Formatted or Raw) */
  activeTab?: ResultTab
  /** Whether the result is an error */
  isError?: boolean
  /** Callback to screenshot/copy formatted history */
  onScreenshot?: (modelId: string) => void
  /** Callback to copy raw history */
  onCopyResponse?: (modelId: string) => void
  /** Callback to close/hide the card */
  onClose?: (modelId: string) => void
  /** Callback to switch result tab */
  onSwitchTab?: (modelId: string, tab: ResultTab) => void
  /** Custom className */
  className?: string
}

/**
 * ResultCard component for displaying model comparison results
 *
 * @example
 * ```tsx
 * <ResultCard
 *   modelId="gpt-4"
 *   model={{ id: 'gpt-4', name: 'GPT-4' }}
 *   messages={messages}
 *   activeTab={RESULT_TAB.FORMATTED}
 *   onClose={handleClose}
 * />
 * ```
 */
export const ResultCard: React.FC<ResultCardProps> = ({
  modelId,
  model,
  messages,
  activeTab = RESULT_TAB.FORMATTED,
  isError = false,
  onScreenshot,
  onCopyResponse,
  onClose,
  onSwitchTab,
  className = '',
}) => {
  const latestMessage = messages[messages.length - 1]
  const safeId = getSafeId(modelId)

  // Fallback error detection: check the message content directly if isError prop is not set correctly
  const hasError = isError || isErrorMessage(latestMessage?.content)

  // Detect when screen is small enough that "chars" would wrap
  const [isSmallLayout, setIsSmallLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 640 // Breakpoint where "N chars" would wrap
  })

  useEffect(() => {
    const handleResize = () => setIsSmallLayout(window.innerWidth <= 640)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // State for tooltip visibility (for mobile tap)
  const [showTooltip, setShowTooltip] = useState(false)

  // Handle tap/click to show tooltip on mobile
  const handleOutputLengthClick = () => {
    if (isSmallLayout) {
      setShowTooltip(true)
      // Auto-hide after 2 seconds
      setTimeout(() => {
        setShowTooltip(false)
      }, 2000)
    }
  }

  return (
    <div className={`result-card conversation-card ${className}`.trim()}>
      <div className="result-header">
        <div className="result-header-top">
          <h3>{model?.name || modelId}</h3>
          <div className="header-buttons-container">
            {onScreenshot && (
              <button
                className="screenshot-card-btn"
                onClick={e => {
                  onScreenshot(modelId)
                  e.currentTarget.blur()
                }}
                title="Copy formatted chat history"
                aria-label={`Copy formatted chat history for ${model?.name || modelId}`}
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
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                </svg>
              </button>
            )}
            {onCopyResponse && (
              <button
                className="copy-response-btn"
                onClick={() => onCopyResponse(modelId)}
                title="Copy raw chat history"
                aria-label={`Copy raw chat history from ${model?.name || modelId}`}
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
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            )}
            {onClose && (
              <button
                className="close-card-btn"
                onClick={() => onClose(modelId)}
                title="Hide this result"
                aria-label={`Hide result for ${model?.name || modelId}`}
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
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="result-header-bottom">
          <span
            className={`output-length ${showTooltip ? 'tooltip-visible' : ''}`}
            onClick={handleOutputLengthClick}
            style={{ cursor: isSmallLayout ? 'pointer' : 'default' }}
          >
            {latestMessage?.content.length || 0}
            {isSmallLayout ? '' : ' chars'}
            {isSmallLayout && <span className="output-length-tooltip">Characters</span>}
          </span>
          <div className="result-tabs">
            <button
              className={`tab-button ${activeTab === RESULT_TAB.FORMATTED ? 'active' : ''}`}
              onClick={() => onSwitchTab?.(modelId, RESULT_TAB.FORMATTED)}
            >
              Formatted
            </button>
            <button
              className={`tab-button ${activeTab === RESULT_TAB.RAW ? 'active' : ''}`}
              onClick={() => onSwitchTab?.(modelId, RESULT_TAB.RAW)}
            >
              Raw
            </button>
          </div>
          <span className={`status ${hasError ? 'error' : 'success'}`}>
            {hasError ? 'Failed' : 'Success'}
          </span>
        </div>
      </div>
      <div className="conversation-content" id={`conversation-content-${safeId}`}>
        {messages.map(message => (
          <MessageBubble
            key={String(message.id)}
            id={String(message.id)}
            type={message.type}
            content={message.content}
            timestamp={message.timestamp}
            activeTab={activeTab}
          />
        ))}
      </div>
    </div>
  )
}

ResultCard.displayName = 'ResultCard'
