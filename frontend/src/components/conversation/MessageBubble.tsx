import React, { lazy, Suspense } from 'react'

import { RESULT_TAB, type ResultTab } from '../../types'
import { formatTime } from '../../utils'

// Lazy load LatexRenderer for code splitting
const LatexRenderer = lazy(() => import('../LatexRenderer'))

/**
 * MessageBubble component props
 */
export interface MessageBubbleProps {
  /** Message ID */
  id: string
  /** Message type (user or assistant) */
  type: 'user' | 'assistant'
  /** Message content */
  content: string
  /** Message timestamp (ISO string or Date) */
  timestamp: string | Date
  /** Active result tab for rendering */
  activeTab?: ResultTab
  /** Custom className */
  className?: string
  /** Model ID for model-specific rendering */
  modelId?: string
}

/**
 * MessageBubble component for displaying individual conversation messages
 *
 * @example
 * ```tsx
 * <MessageBubble
 *   id="msg-1"
 *   type="user"
 *   content="What is React?"
 *   timestamp={new Date()}
 *   activeTab={RESULT_TAB.FORMATTED}
 * />
 * ```
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  id,
  type,
  content,
  timestamp,
  activeTab = RESULT_TAB.FORMATTED,
  className = '',
  modelId,
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

  // Ensure content is always a string
  const safeContent = content || ''

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
        <span className="message-time">{getFormattedTime()}</span>
      </div>
      <div className="message-content">
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
