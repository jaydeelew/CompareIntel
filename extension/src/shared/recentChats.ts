import browser from 'webextension-polyfill'

import type { ExtensionShellPersistedState } from '../sidepanel/types/shellState'

export interface RecentChat {
  id: string
  title: string
  updatedAt: number
  sourceTabId?: number
  sourceTabTitle?: string
  state: ExtensionShellPersistedState
}

export type RecentChatSummary = Pick<
  RecentChat,
  'id' | 'title' | 'updatedAt' | 'sourceTabId' | 'sourceTabTitle'
>

const STORAGE_KEY = 'recentChats'
export const MAX_RECENT_CHATS = 20

function deriveTitle(state: ExtensionShellPersistedState): string {
  const firstUser = state.conversationHistory.find((message) => message.role === 'user')
  const text = firstUser?.content || state.submittedPrompt || state.input
  const trimmed = text.trim()
  if (!trimmed) return 'Untitled comparison'
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
}

function normalizeChat(value: unknown): RecentChat | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<RecentChat>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.updatedAt !== 'number' ||
    !candidate.state
  ) {
    return null
  }
  return candidate as RecentChat
}

async function readStoredChats(): Promise<RecentChat[]> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const chats = result[STORAGE_KEY]
  if (!Array.isArray(chats)) return []
  return chats
    .map(normalizeChat)
    .filter((chat): chat is RecentChat => chat != null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function listRecentChats(): Promise<RecentChat[]> {
  return readStoredChats()
}

export async function listRecentChatSummaries(): Promise<RecentChatSummary[]> {
  const chats = await readStoredChats()
  return chats.map(({ id, title, updatedAt, sourceTabId, sourceTabTitle }) => ({
    id,
    title,
    updatedAt,
    sourceTabId,
    sourceTabTitle,
  }))
}

export async function getRecentChat(id: string): Promise<RecentChat | null> {
  const chats = await readStoredChats()
  return chats.find((chat) => chat.id === id) ?? null
}

export async function upsertRecentChat(params: {
  id?: string | null
  state: ExtensionShellPersistedState
  sourceTabId?: number
  sourceTabTitle?: string
}): Promise<RecentChat> {
  const chats = await readStoredChats()
  const id = params.id ?? crypto.randomUUID()
  const entry: RecentChat = {
    id,
    title: deriveTitle(params.state),
    updatedAt: Date.now(),
    sourceTabId: params.sourceTabId,
    sourceTabTitle: params.sourceTabTitle,
    state: {
      ...params.state,
      activeRecentChatId: id,
    },
  }

  const filtered = chats.filter((chat) => chat.id !== id)
  const next = [entry, ...filtered].slice(0, MAX_RECENT_CHATS)
  await browser.storage.local.set({ [STORAGE_KEY]: next })
  return entry
}
