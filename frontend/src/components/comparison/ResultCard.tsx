import React, { useState } from 'react'

import { useBreakpoint } from '../../hooks'
import { RESULT_TAB, type ResultTab, type ConversationMessage } from '../../types'
import { getSafeId } from '../../utils'
import { isErrorMessage } from '../../utils/error'
import { MessageBubble } from '../conversation/MessageBubble'

export interface Model {
  id: string
  name: string
  description?: string
}

export interface ResultCardProps {
  modelId: string
  model?: Model
  messages: ConversationMessage[]
  activeTab?: ResultTab
  isError?: boolean
  isProcessing?: boolean
  onScreenshot?: (modelId: string) => void
  onCopyResponse?: (modelId: string) => void
  onClose?: (modelId: string) => void
  onSwitchTab?: (modelId: string, tab: ResultTab) => void
  onBreakout?: (modelId: string) => void
  showBreakoutButton?: boolean
  className?: string
}

// Single model result card with formatted/raw toggle
export const ResultCard: React.FC<ResultCardProps> = ({
  modelId,
  model,
  messages,
  activeTab = RESULT_TAB.FORMATTED,
  isError = false,
  isProcessing = false,
  onScreenshot,
  onCopyResponse,
  onClose,
  onSwitchTab,
  onBreakout,
  showBreakoutButton = false,
  className = '',
}) => {
  const safeMessages = messages && Array.isArray(messages) ? messages : []
  const latestMessage = safeMessages[safeMessages.length - 1]
  const safeId = getSafeId(modelId || 'unknown')

  const hasError = isError || isErrorMessage(latestMessage?.content)
  const statusText = isProcessing ? 'Process' : hasError ? 'Failed' : 'Success'
  const statusClass = isProcessing ? 'process' : hasError ? 'error' : 'success'

  const { isSmallLayout } = useBreakpoint()
  const [showTooltip, setShowTooltip] = useState(false)

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
            {showBreakoutButton && onBreakout && !isError && (
              <button
                className="breakout-card-btn"
                onClick={e => {
                  onBreakout(modelId)
                  e.currentTarget.blur()
                }}
                title="Continue with this model only"
                aria-label={`Break out conversation with ${model?.name || modelId}`}
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
                  {/* Arrow breaking out of a box icon */}
                  <path d="M7 17L17 7" />
                  <path d="M7 7h10v10" />
                  <path d="M3 12v8a1 1 0 0 0 1 1h8" />
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
          <span className={`status ${statusClass}`}>{statusText}</span>
        </div>
      </div>
      <div className="conversation-content" id={`conversation-content-${safeId}`}>
        {safeMessages.map((message, index) => {
          // Ensure unique key by combining message ID with index
          const uniqueKey = message.id ? `${String(message.id)}-${index}` : `msg-${index}`
          return (
            <MessageBubble
              key={uniqueKey}
              id={message.id ? String(message.id) : `msg-${index}`}
              type={message.type || 'assistant'}
              content={message.content || ''}
              timestamp={message.timestamp || new Date().toISOString()}
              activeTab={activeTab}
            />
          )
        })}
      </div>
    </div>
  )
}

ResultCard.displayName = 'ResultCard'
