import React, { useState } from 'react'

import { useResponsive } from '../../hooks'
import { RESULT_TAB, type ResultTab, type ConversationMessage } from '../../types'
import { getSafeId } from '../../utils'
import { isErrorMessage } from '../../utils/error'
import { MessageBubble } from '../conversation/MessageBubble'
import { StyledTooltip } from '../shared'

import { ReasoningCollapsible } from './ReasoningCollapsible'

export interface Model {
  id: string
  name: string
  description?: string
  /** When true, show image-generation loading affordance until URLs arrive */
  supports_image_generation?: boolean
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
  onHideOthers?: (modelId: string) => void
  onCopyMessage?: (modelId: string, messageId: string, content: string) => void
  showBreakoutButton?: boolean
  /** Extra class for breakout animations (fading-out, hidden, fading-in) */
  breakoutClassName?: string
  /** Inline style for mobile tabbed display toggle */
  style?: React.CSSProperties
  className?: string
  /** When true, disables card action buttons (screenshot, copy, close, breakout, hide others, copy message) - not formatted/raw tabs */
  isTutorialActive?: boolean
  /** Ephemeral streamed reasoning for the latest turn (not persisted). */
  streamingReasoning?: string
  /** True once visible answer tokens have arrived for this model in the current stream. */
  streamAnswerStarted?: boolean
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
  onHideOthers,
  onCopyMessage,
  showBreakoutButton = false,
  breakoutClassName = '',
  style,
  className = '',
  isTutorialActive = false,
  streamingReasoning = '',
  streamAnswerStarted = false,
}) => {
  const safeMessages = messages && Array.isArray(messages) ? messages : []
  const lastAssistantIndex = safeMessages.reduce(
    (lastIdx, m, i) => (m.type === 'assistant' ? i : lastIdx),
    -1
  )
  const latestMessage = safeMessages[safeMessages.length - 1]
  const safeId = getSafeId(modelId || 'unknown')
  const hasImages = (latestMessage?.images?.length ?? 0) > 0
  const isImageGenModel = model?.supports_image_generation === true

  const hasError = (isError || isErrorMessage(latestMessage?.content)) && !hasImages
  const statusText = isProcessing ? 'Process' : hasError ? 'Failed' : 'Success'
  const statusClass = isProcessing ? 'process' : hasError ? 'error' : 'success'

  const { isSmallLayout } = useResponsive()
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

  const combinedClassName = ['result-card', 'conversation-card', breakoutClassName, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={combinedClassName} style={style}>
      <div className="result-header">
        <div className="result-header-top">
          <h3>{model?.name || modelId}</h3>
          <div className="header-buttons-container">
            {onScreenshot && (
              <StyledTooltip text="Copy formatted chat history">
                <button
                  className="screenshot-card-btn"
                  disabled={isTutorialActive}
                  onClick={e => {
                    onScreenshot(modelId)
                    e.currentTarget.blur()
                  }}
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
              </StyledTooltip>
            )}
            {onCopyResponse && (
              <StyledTooltip text="Copy raw chat history">
                <button
                  className="copy-response-btn"
                  disabled={isTutorialActive}
                  onClick={() => onCopyResponse(modelId)}
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
              </StyledTooltip>
            )}
            {onHideOthers && (
              <StyledTooltip text="Hide all other results">
                <button
                  className="hide-others-btn"
                  disabled={isTutorialActive}
                  onClick={() => onHideOthers(modelId)}
                  aria-label={`Hide all other results except ${model?.name || modelId}`}
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
                    <rect x="3" y="3" width="7" height="7" fill="currentColor" opacity="0.8" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                </button>
              </StyledTooltip>
            )}
            {onClose && (
              <StyledTooltip text="Hide this result">
                <button
                  className="close-card-btn"
                  disabled={isTutorialActive}
                  onClick={() => onClose(modelId)}
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
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              </StyledTooltip>
            )}
            {showBreakoutButton && onBreakout && !isError && (
              <StyledTooltip text="Continue with this model only">
                <button
                  type="button"
                  className="breakout-card-btn"
                  disabled={isTutorialActive}
                  data-testid="breakout-button"
                  onClick={e => {
                    onBreakout(modelId)
                    setTimeout(() => e.currentTarget.blur(), 0)
                  }}
                  onTouchEnd={e => {
                    // Safari iOS: click often doesn't fire when finger moves slightly during tap.
                    // Handle touch directly; preventDefault stops synthesized click (avoids double-fire).
                    e.preventDefault()
                    if (!isTutorialActive) onBreakout(modelId)
                  }}
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
              </StyledTooltip>
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
          const messageId = message.id ? String(message.id) : `msg-${index}`
          const uniqueKey = message.id ? `${String(message.id)}-${index}` : `msg-${index}`
          const isLatestAssistant =
            message.type === 'assistant' && index === lastAssistantIndex && lastAssistantIndex >= 0
          const imgCount = message.images?.length ?? 0
          const pendingGeneratedImage = Boolean(
            isImageGenModel && isProcessing && isLatestAssistant && imgCount === 0 && !isError
          )
          const showReasoningBeforeBubble = isLatestAssistant && Boolean(streamingReasoning?.trim())
          return (
            <React.Fragment key={uniqueKey}>
              {showReasoningBeforeBubble && (
                <ReasoningCollapsible
                  text={streamingReasoning}
                  isProcessing={isProcessing}
                  answerStarted={streamAnswerStarted}
                />
              )}
              <MessageBubble
                id={messageId}
                type={message.type || 'assistant'}
                content={message.content || ''}
                images={message.images}
                timestamp={message.timestamp || new Date().toISOString()}
                activeTab={activeTab}
                modelId={modelId}
                modelName={model?.name}
                pendingGeneratedImage={pendingGeneratedImage}
                onCopyMessage={
                  onCopyMessage ? content => onCopyMessage(modelId, messageId, content) : undefined
                }
                copyButtonDisabled={isTutorialActive}
              />
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

ResultCard.displayName = 'ResultCard'
