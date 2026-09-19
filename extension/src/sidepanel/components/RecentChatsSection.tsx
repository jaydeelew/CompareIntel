import { useEffect, useMemo, useState } from 'react'

import type { ConversationSummary, User } from '@compareintel/core'
import { deleteConversation, fetchConversations } from '@compareintel/core'

import {
  mergeRecentHistory,
  type MergedRecentHistoryItem,
} from '../../shared/recentChatLimits'
import {
  deleteRecentChat,
  deleteRecentChatsByConversationId,
  listRecentChatSummaries,
  listSavedServerConversationIds,
  setRecentChatSaved,
  setServerConversationSaved,
  type RecentChatSummary,
} from '../../shared/recentChats'
import { apiClient } from '../api'
import type { ExtensionShellPersistedState } from '../types/shellState'
import { formatClientSource, loadServerConversationState } from '../utils/serverConversation'

interface RecentChatsSectionProps {
  user: User | null
  activeChatId?: string | null
  activeConversationId?: number | null
  onSelectChat: (chatId: string) => void
  onSelectServerConversation: (state: ExtensionShellPersistedState) => void
  onDeleteChat?: (chatId: string) => void
  onDeleteServerConversation?: (conversationId: number) => void
  refreshToken?: number
}

function formatRelativeTime(timestamp: number | string): string {
  const value = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  const deltaMs = Date.now() - value
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(value).toLocaleDateString()
}

function truncateTitle(value: string, max = 72): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function itemKey(item: MergedRecentHistoryItem): string {
  return item.kind === 'local' ? `local-${item.chat.id}` : `server-${item.summary.id}`
}

function KeepCheckbox({
  saved,
  onChange,
}: {
  saved: boolean
  onChange: (saved: boolean) => void
}) {
  return (
    <label className="recent-chat-keep">
      <input
        type="checkbox"
        checked={saved}
        aria-label="Save this chat"
        title="Save this chat so it is not auto-deleted"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="recent-chat-keep-label">Save</span>
    </label>
  )
}

export function RecentChatsSection({
  user,
  activeChatId,
  activeConversationId,
  onSelectChat,
  onSelectServerConversation,
  onDeleteChat,
  onDeleteServerConversation,
  refreshToken = 0,
}: RecentChatsSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [localChats, setLocalChats] = useState<RecentChatSummary[]>([])
  const [serverHistory, setServerHistory] = useState<ConversationSummary[]>([])
  const [savedServerIds, setSavedServerIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (localChats.length === 0 && serverHistory.length === 0) setLoading(true)

    const loadLocal = listRecentChatSummaries().catch(() => [] as RecentChatSummary[])
    const loadServer =
      user != null
        ? fetchConversations(apiClient).catch(() => [] as ConversationSummary[])
        : Promise.resolve([] as ConversationSummary[])
    const loadSavedIds = listSavedServerConversationIds().catch(() => [] as number[])

    Promise.all([loadLocal, loadServer, loadSavedIds])
      .then(([local, server, savedIds]) => {
        if (cancelled) return
        setLocalChats(local)
        setServerHistory(server)
        setSavedServerIds(savedIds)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [refreshToken, user])

  const items = useMemo(
    () =>
      mergeRecentHistory({
        localChats,
        serverHistory,
        savedServerIds,
      }),
    [localChats, savedServerIds, serverHistory]
  )

  const reloadHistory = async () => {
    const [local, server, savedIds] = await Promise.all([
      listRecentChatSummaries().catch(() => [] as RecentChatSummary[]),
      user != null
        ? fetchConversations(apiClient).catch(() => [] as ConversationSummary[])
        : Promise.resolve([] as ConversationSummary[]),
      listSavedServerConversationIds().catch(() => [] as number[]),
    ])
    setLocalChats(local)
    setServerHistory(server)
    setSavedServerIds(savedIds)
  }

  const handleDeleteLocal = (
    chat: { id: string; conversationId?: number | null },
    event: React.MouseEvent
  ) => {
    event.stopPropagation()
    event.preventDefault()
    const conversationId = chat.conversationId ?? null
    setLocalChats((current) => current.filter((entry) => entry.id !== chat.id))
    onDeleteChat?.(chat.id)
    if (conversationId != null) {
      setServerHistory((current) => current.filter((summary) => summary.id !== conversationId))
      setSavedServerIds((current) => current.filter((id) => id !== conversationId))
      onDeleteServerConversation?.(conversationId)
    }
    void (async () => {
      try {
        await deleteRecentChat(chat.id)
        if (conversationId != null) {
          if (user != null) {
            await deleteConversation(apiClient, conversationId)
          }
          await deleteRecentChatsByConversationId(conversationId)
        }
      } catch {
        await reloadHistory()
      }
    })()
  }

  const handleDeleteServer = (conversationId: number, event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    setServerHistory((current) => current.filter((summary) => summary.id !== conversationId))
    setLocalChats((current) => current.filter((chat) => chat.conversationId !== conversationId))
    setSavedServerIds((current) => current.filter((id) => id !== conversationId))
    onDeleteServerConversation?.(conversationId)
    void (async () => {
      try {
        await deleteConversation(apiClient, conversationId)
        await deleteRecentChatsByConversationId(conversationId)
      } catch {
        await reloadHistory()
      }
    })()
  }

  const handleKeepToggle = (item: MergedRecentHistoryItem, saved: boolean) => {
    if (item.kind === 'local') {
      const conversationId = item.chat.conversationId ?? null
      setLocalChats((current) =>
        current.map((chat) => (chat.id === item.chat.id ? { ...chat, saved } : chat))
      )
      if (conversationId != null) {
        setSavedServerIds((current) => {
          const next = new Set(current)
          if (saved) next.add(conversationId)
          else next.delete(conversationId)
          return [...next]
        })
      }
      void (async () => {
        try {
          await setRecentChatSaved(item.chat.id, saved)
          const [local, savedIds] = await Promise.all([
            listRecentChatSummaries(),
            listSavedServerConversationIds(),
          ])
          setLocalChats(local)
          setSavedServerIds(savedIds)
        } catch {
          await reloadHistory()
        }
      })()
      return
    }

    const conversationId = item.summary.id
    setSavedServerIds((current) => {
      const next = new Set(current)
      if (saved) next.add(conversationId)
      else next.delete(conversationId)
      return [...next]
    })
    void setServerConversationSaved(conversationId, saved)
      .then((savedIds) => setSavedServerIds(savedIds))
      .catch(() => {
        void reloadHistory().catch(() => undefined)
      })
  }

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
        </button>
        {!loading && (
          <span className="section-count" aria-label={`${items.length} recent chats`}>
            {items.length}
          </span>
        )}
      </div>

      {expanded && (
        <div className="recent-chats-list">
          {loading && <div className="recent-chats-empty">Loading chats…</div>}
          {!loading && items.length === 0 && (
            <div className="recent-chats-empty">
              Completed comparisons will appear here for quick access.
            </div>
          )}
          {!loading &&
            items.map((item) => {
              if (item.kind === 'local') {
                const chat = item.chat
                return (
                  <div
                    key={itemKey(item)}
                    className={`recent-chat-row${activeChatId === chat.id ? ' active' : ''}${
                      item.saved ? ' saved' : ''
                    }`}
                  >
                    <KeepCheckbox
                      saved={item.saved}
                      onChange={(saved) => handleKeepToggle(item, saved)}
                    />
                    <button
                      type="button"
                      className="recent-chat-item"
                      onClick={() => {
                        setExpanded(false)
                        onSelectChat(chat.id)
                      }}
                    >
                      <span className="recent-chat-title">{chat.title}</span>
                      <span className="recent-chat-meta">
                        {item.saved ? 'Saved · ' : ''}
                        {formatRelativeTime(chat.updatedAt)}
                        {chat.sourceTabTitle ? ` · ${chat.sourceTabTitle}` : ''}
                        <span className="history-source-badge">Extension</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="recent-chat-delete"
                      aria-label="Delete conversation"
                      onClick={(event) => handleDeleteLocal(chat, event)}
                    >
                      ×
                    </button>
                  </div>
                )
              }

              const summary = item.summary
              const isActive = activeConversationId === summary.id
              return (
                <div
                  key={itemKey(item)}
                  className={`recent-chat-row${isActive ? ' active' : ''}${
                    item.saved ? ' saved' : ''
                  }`}
                >
                  <KeepCheckbox
                    saved={item.saved}
                    onChange={(saved) => handleKeepToggle(item, saved)}
                  />
                  <button
                    type="button"
                    className="recent-chat-item"
                    onClick={() => {
                      setExpanded(false)
                      void loadServerConversationState(summary.id).then((state) => {
                        if (state) onSelectServerConversation(state)
                      })
                    }}
                  >
                    <span className="recent-chat-title">{truncateTitle(summary.input_data)}</span>
                    <span className="recent-chat-meta">
                      {item.saved ? 'Saved · ' : ''}
                      {formatRelativeTime(summary.created_at)}
                      <span className="history-source-badge">
                        {formatClientSource(summary.client_source)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="recent-chat-delete"
                    aria-label="Delete conversation"
                    onClick={(event) => handleDeleteServer(summary.id, event)}
                  >
                    ×
                  </button>
                </div>
              )
            })}
        </div>
      )}
    </section>
  )
}
