import React, { lazy, Suspense } from 'react'

import { RESULT_TAB, type ResultTab } from '../../types'
import { formatTime, getSafeId } from '../../utils'

// Lazy load LatexRenderer for code splitting
const LatexRenderer = lazy(() => import('../LatexRenderer'))

export interface MessageBubbleProps {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: string | Date
  activeTab?: ResultTab
  className?: string
  modelId?: string
  /** Callback when copy button is clicked - receives message content */
  onCopyMessage?: (content: string) => void
  /** When true, copy button is visible but disabled (e.g. during tutorial) */
  copyButtonDisabled?: boolean
}

// Displays a single message in a conversation with formatted/raw rendering
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  id,
  type,
  content,
  timestamp,
  activeTab = RESULT_TAB.FORMATTED,
  className = '',
  modelId,
  onCopyMessage,
  copyButtonDisabled = false,
}) => {
  // Safely format timestamp - handle undefined, null, or invalid dates
  const getFormattedTime = () => {
    if (!timestamp) return ''
    try {
      const dateString = typeof timestamp === 'string' ? timestamp : timestamp.toISOString()
      return formatTime(dateString)
    } catch {
      return ''
    }
  }

  // Ensure content is always a string and trim leading/trailing whitespace
  // This prevents horizontal scrollbars caused by leading spaces
  const safeContent = (content || '').trim()

  // Generate the message content ID that matches what useScreenshotCopy expects
  const safeModelId = modelId ? getSafeId(modelId) : 'unknown'
  const safeMessageId = getSafeId(id)
  const messageContentId = `message-content-${safeModelId}-${safeMessageId}`

  return (
    <div key={id} className={`conversation-message ${type || 'assistant'} ${className}`.trim()}>
      <div className="message-header">
        <span
          className="message-type"
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {type === 'user' ? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M20 21a8 8 0 1 0-16 0" />
              </svg>
              <span>You</span>
            </>
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="2" x2="9" y2="4" />
                <line x1="15" y1="2" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="22" />
                <line x1="15" y1="20" x2="15" y2="22" />
                <line x1="20" y1="9" x2="22" y2="9" />
                <line x1="20" y1="15" x2="22" y2="15" />
                <line x1="2" y1="9" x2="4" y2="9" />
                <line x1="2" y1="15" x2="4" y2="15" />
              </svg>
              <span>AI</span>
            </>
          )}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="message-time">{getFormattedTime()}</span>
          {onCopyMessage && (
            <button
              className="copy-message-btn"
              disabled={copyButtonDisabled}
              onClick={e => {
                onCopyMessage(safeContent)
                e.currentTarget.blur()
              }}
              title={
                activeTab === RESULT_TAB.FORMATTED ? 'Copy formatted message' : 'Copy raw message'
              }
              aria-label={`Copy ${activeTab === RESULT_TAB.FORMATTED ? 'formatted' : 'raw'} message`}
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
        </div>
      </div>
      <div className="message-content" id={messageContentId}>
        {activeTab === RESULT_TAB.FORMATTED ? (
          /* Full LaTeX rendering for formatted view */
          <Suspense fallback={<pre className="result-output raw-output">{safeContent}</pre>}>
            <LatexRenderer className="result-output" modelId={modelId}>
              {safeContent}
            </LatexRenderer>
          </Suspense>
        ) : (
          /* Raw text for immediate streaming display */
          <pre className="result-output raw-output">{safeContent}</pre>
        )}
      </div>
    </div>
  )
}

MessageBubble.displayName = 'MessageBubble'
