import { useEffect, useMemo, useState } from 'react'

import type { ConversationSummary, User } from '@compareintel/core'
import {
  deleteConversation,
  fetchConversations,
  setConversationSaved,
} from '@compareintel/core'

import { chatTitleFromPrompt } from '../../shared/chatTitle'
import {
  MAX_RECENT_CHATS,
  mergeRecentHistory,
  type MergedRecentHistoryItem,
} from '../../shared/recentChatLimits'
import {
  deleteRecentChat,
  deleteRecentChatsByConversationId,
  linkRecentChatsToServer,
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

function displayChatTitle(value: string): string {
  const title = chatTitleFromPrompt(value)
  return /[A-Za-z0-9]/.test(title) ? title : 'Untitled comparison'
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
        title="Keep this chat"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="recent-chat-keep-label">Save</span>
    </label>
  )
}

function RecentChatCopy({
  title,
  meta,
}: {
  title: string
  meta: string
}) {
  const label = displayChatTitle(title)
  return (
    <>
      <div className="recent-chat-title" title={label}>
        {label}
      </div>
      <div className="recent-chat-meta">{meta}</div>
    </>
  )
}

function RecentChatOpenButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="recent-chat-item"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
    >
      {children}
    </div>
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
      .then(async ([local, server, savedIds]) => {
        if (cancelled) return
        let nextLocal = local
        if (user != null && server.length > 0) {
          const linked = await linkRecentChatsToServer(server)
          if (cancelled) return
          if (linked) nextLocal = await listRecentChatSummaries().catch(() => local)
        }
        if (cancelled) return
        setLocalChats(nextLocal)
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
        serverHistory: user != null ? serverHistory : [],
        savedServerIds,
        max: MAX_RECENT_CHATS,
      }),
    [localChats, savedServerIds, serverHistory, user]
  )

  const applyHistory = async () => {
    const [local, server, savedIds] = await Promise.all([
      listRecentChatSummaries().catch(() => [] as RecentChatSummary[]),
      user != null
        ? fetchConversations(apiClient).catch(() => [] as ConversationSummary[])
        : Promise.resolve([] as ConversationSummary[]),
      listSavedServerConversationIds().catch(() => [] as number[]),
    ])
    let nextLocal = local
    if (user != null && server.length > 0) {
      const linked = await linkRecentChatsToServer(server)
      if (linked) nextLocal = await listRecentChatSummaries().catch(() => local)
    }
    return { local: nextLocal, server, savedIds }
  }

  const reloadHistory = async () => {
    const { local, server, savedIds } = await applyHistory()
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

  const persistSaved = async (conversationId: number | null, saved: boolean) => {
    if (conversationId != null) {
      setSavedServerIds((current) => {
        const next = new Set(current)
        if (saved) next.add(conversationId)
        else next.delete(conversationId)
        return [...next]
      })
      setServerHistory((current) =>
        current.map((summary) =>
          summary.id === conversationId ? { ...summary, saved } : summary
        )
      )
    }
    if (user != null && conversationId != null) {
      await setConversationSaved(apiClient, conversationId, saved)
    }
    if (conversationId != null) {
      await setServerConversationSaved(conversationId, saved)
    }
  }

  const handleKeepToggle = (item: MergedRecentHistoryItem, saved: boolean) => {
    if (item.kind === 'local') {
      const conversationId = item.chat.conversationId ?? null
      setLocalChats((current) =>
        current.map((chat) => (chat.id === item.chat.id ? { ...chat, saved } : chat))
      )
      void (async () => {
        try {
          await setRecentChatSaved(item.chat.id, saved)
          await persistSaved(conversationId, saved)
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
    void persistSaved(conversationId, saved).catch(() => {
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
                    <RecentChatOpenButton
                      onClick={() => {
                        setExpanded(false)
                        onSelectChat(chat.id)
                      }}
                    >
                      <RecentChatCopy
                        title={chat.title}
                        meta={`${item.saved ? 'Saved · ' : ''}${formatRelativeTime(chat.updatedAt)}${
                          chat.sourceTabTitle ? ` · ${chat.sourceTabTitle}` : ''
                        } · Extension`}
                      />
                    </RecentChatOpenButton>
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
                  <RecentChatOpenButton
                    onClick={() => {
                      setExpanded(false)
                      void loadServerConversationState(summary.id).then((state) => {
                        if (state) onSelectServerConversation(state)
                      })
                    }}
                  >
                    <RecentChatCopy
                      title={summary.input_data}
                      meta={`${item.saved ? 'Saved · ' : ''}${formatRelativeTime(
                        summary.created_at
                      )} · ${formatClientSource(summary.client_source)}`}
                    />
                  </RecentChatOpenButton>
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
