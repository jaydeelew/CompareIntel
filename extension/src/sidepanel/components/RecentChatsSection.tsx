import { useEffect, useState } from 'react'

import {
  listRecentChatSummaries,
  type RecentChatSummary,
} from '../../shared/recentChats'

interface RecentChatsSectionProps {
  activeChatId?: string | null
  onSelectChat: (chatId: string) => void
  refreshToken?: number
}

function formatRelativeTime(timestamp: number): string {
  const deltaMs = Date.now() - timestamp
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function RecentChatsSection({
  activeChatId,
  onSelectChat,
  refreshToken = 0,
}: RecentChatsSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [chats, setChats] = useState<RecentChatSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listRecentChatSummaries()
      .then(setChats)
      .catch(() => setChats([]))
      .finally(() => setLoading(false))
  }, [refreshToken])

  return (
    <section className={`recent-chats${expanded ? '' : ' recent-chats-collapsed'}`}>
      <div className="recent-chats-header">
        <button
          type="button"
          className="ghost context-collapse-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse recent chats' : 'Expand recent chats'}
        >
          <span className="context-collapse-chevron" aria-hidden="true">
            {expanded ? '▼' : '▶'}
          </span>
          Recent chats
          {!loading && chats.length > 0 && (
            <span className="recent-chats-count">{chats.length}</span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="recent-chats-list">
          {loading && <div className="recent-chats-empty">Loading chats…</div>}
          {!loading && chats.length === 0 && (
            <div className="recent-chats-empty">
              Completed comparisons will appear here for quick access.
            </div>
          )}
          {!loading &&
            chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`recent-chat-item${activeChatId === chat.id ? ' active' : ''}`}
                onClick={() => onSelectChat(chat.id)}
              >
                <span className="recent-chat-title">{chat.title}</span>
                <span className="recent-chat-meta">
                  {formatRelativeTime(chat.updatedAt)}
                  {chat.sourceTabTitle ? ` · ${chat.sourceTabTitle}` : ''}
                </span>
              </button>
            ))}
        </div>
      )}
    </section>
  )
}
