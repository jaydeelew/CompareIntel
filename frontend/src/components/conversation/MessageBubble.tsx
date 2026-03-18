import React, { useState } from 'react'

import { RESULT_TAB, type ResultTab } from '../../types'
import { formatTime, getSafeId } from '../../utils'
// Direct import - lazy loading caused "Invalid hook call" because the lazy chunk
// could resolve a different React instance. LatexRenderer must use the same React
// as the main app for hooks to work correctly.
import LatexRenderer from '../LatexRenderer'

export interface MessageBubbleProps {
  id: string
  type: 'user' | 'assistant'
  content: string
  /** Generated image URLs (for image-generation model responses) */
  images?: string[]
  timestamp: string | Date
  activeTab?: ResultTab
  className?: string
  modelId?: string
  /** Display name for assistant messages (e.g. model name). Falls back to "AI" if not provided. */
  modelName?: string
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
  images,
  timestamp,
  activeTab = RESULT_TAB.FORMATTED,
  className = '',
  modelId,
  modelName,
  onCopyMessage,
  copyButtonDisabled = false,
}) => {
  const [failedImageIndices, setFailedImageIndices] = useState<Set<number>>(new Set())

  const handleImageError = (index: number) => {
    setFailedImageIndices(prev => new Set(prev).add(index))
  }

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
  let safeContent = (content || '').trim()

  // When we have structured images (from image-generation models), strip embedded image syntax
  // from content to avoid duplicate display - Gemini etc. often embed the same image in both
  // the images array and as ![alt](url) or <img src="..."> in the text
  if (images && images.length > 0 && safeContent) {
    safeContent = safeContent
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .replace(/<img[^>]+src=["'][^"']+["'][^>]*\/?>/gi, '')
      .trim()
  }

  // Deduplicate images - Gemini etc. may return the same image multiple times with
  // identical or differently-encoded URLs (base64 padding, percent-encoding)
  const displayImages = React.useMemo(() => {
    if (!images || images.length === 0) return []
    const seen = new Set<string>()
    return images.filter(url => {
      let key = url
      if (url.startsWith('data:') && url.includes('base64,')) {
        try {
          const parts = url.split('base64,', 2)
          if (parts.length === 2) {
            key = `data:base64:${decodeURIComponent(parts[1]).replace(/=+$/, '')}`
          }
        } catch {
          key = url
        }
      }
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [images])

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
              <span>{modelName || 'AI'}</span>
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
        {displayImages.length > 0 && (
          /* Image generation response - render images */
          <div className="result-output result-images">
            {displayImages.map((url, i) =>
              failedImageIndices.has(i) ? (
                <div
                  key={i}
                  className="result-generated-image result-image-fallback"
                  role="img"
                  aria-label="Image no longer available"
                >
                  Image no longer available
                </div>
              ) : (
                <img
                  key={i}
                  src={url}
                  alt={`Generated image ${i + 1}`}
                  className="result-generated-image"
                  onError={() => handleImageError(i)}
                />
              )
            )}
          </div>
        )}
        {safeContent &&
          (activeTab === RESULT_TAB.FORMATTED ? (
            /* Full LaTeX rendering for formatted view */
            <LatexRenderer className="result-output" modelId={modelId}>
              {safeContent}
            </LatexRenderer>
          ) : (
            /* Raw text for immediate streaming display */
            <pre className="result-output raw-output">{safeContent}</pre>
          ))}
      </div>
    </div>
  )
}

MessageBubble.displayName = 'MessageBubble'
