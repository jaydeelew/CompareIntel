import React from 'react'

import type { ConversationSummary } from '../../types'
import { truncatePrompt, formatDate } from '../../utils'

/**
 * ConversationItem component props
 */
export interface ConversationItemProps {
  /** Conversation summary data */
  conversation: ConversationSummary
  /** Whether this conversation is currently active */
  isActive?: boolean
  /** Callback when conversation is clicked */
  onClick?: (conversationId: string) => void
  /** Custom className */
  className?: string
}

/**
 * ConversationItem component for displaying a single conversation in history
 *
 * @example
 * ```tsx
 * <ConversationItem
 *   conversation={conversationSummary}
 *   isActive={true}
 *   onClick={handleLoadConversation}
 * />
 * ```
 */
export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive = false,
  onClick,
  className = '',
}) => {
  const handleClick = () => {
    if (onClick) {
      onClick(String(conversation.id))
    }
  }

  const itemClassName = [
    'conversation-item',
    'history-item',
    isActive ? 'active-comparison' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={itemClassName}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <div className="history-prompt">{truncatePrompt(conversation.input_data, 100)}</div>
      <div className="history-meta">
        <span className="history-date">{formatDate(conversation.created_at)}</span>
        <span className="history-models">
          {conversation.models_used.length === 1
            ? conversation.models_used[0].split('/').pop() || conversation.models_used[0]
            : `${conversation.models_used.length} models`}
        </span>
      </div>
    </div>
  )
}

ConversationItem.displayName = 'ConversationItem'
