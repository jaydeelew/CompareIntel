import React from 'react'

import type { ConversationSummary } from '../../types'

import { ConversationItem } from './ConversationItem'

/**
 * ConversationList component props
 */
export interface ConversationListProps {
  /** List of conversation summaries */
  conversations: ConversationSummary[]
  /** ID of the currently active conversation */
  activeConversationId?: string
  /** Callback when a conversation is clicked */
  onConversationClick?: (conversationId: string) => void
  /** Maximum height for the list (with scrolling) */
  maxHeight?: string
  /** Whether to hide scrollbar */
  hideScrollbar?: boolean
  /** Custom className */
  className?: string
}

/**
 * ConversationList component for displaying a list of conversations
 *
 * @example
 * ```tsx
 * <ConversationList
 *   conversations={conversationHistory}
 *   activeConversationId="conv-123"
 *   onConversationClick={handleLoadConversation}
 * />
 * ```
 */
export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onConversationClick,
  maxHeight = '300px',
  hideScrollbar = false,
  className = '',
}) => {
  if (conversations.length === 0) {
    return (
      <div className={`conversation-list-empty ${className}`.trim()}>
        <p>No conversations yet. Start by comparing some AI models!</p>
      </div>
    )
  }

  const listClassName = [
    'conversation-list',
    hideScrollbar ? 'no-scrollbar' : 'scrollable',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const style = maxHeight ? { maxHeight } : undefined

  return (
    <div className={listClassName} style={style}>
      {conversations.map(conversation => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          isActive={conversation.id === activeConversationId}
          onClick={onConversationClick}
        />
      ))}
    </div>
  )
}

ConversationList.displayName = 'ConversationList'
