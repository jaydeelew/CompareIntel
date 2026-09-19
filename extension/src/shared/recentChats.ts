import browser from 'webextension-polyfill'

import type { ExtensionShellPersistedState } from '../sidepanel/types/shellState'
import { trimRecentChats } from './recentChatLimits'

export { MAX_RECENT_CHATS } from './recentChatLimits'

export interface RecentChat {
  id: string
  title: string
  updatedAt: number
  sourceTabId?: number
  sourceTabTitle?: string
  sourceTabUrl?: string
  saved?: boolean
  state: ExtensionShellPersistedState
}

export type RecentChatSummary = Pick<
  RecentChat,
  'id' | 'title' | 'updatedAt' | 'sourceTabId' | 'sourceTabTitle' | 'sourceTabUrl' | 'saved'
> & {
  conversationId?: number | null
}

const STORAGE_KEY = 'recentChats'
const SAVED_SERVER_IDS_KEY = 'savedRecentConversationIds'

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
  return {
    ...(candidate as RecentChat),
    saved: candidate.saved === true,
  }
}

function toSummary(chat: RecentChat): RecentChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    updatedAt: chat.updatedAt,
    sourceTabId: chat.sourceTabId,
    sourceTabTitle: chat.sourceTabTitle,
    sourceTabUrl: chat.sourceTabUrl,
    saved: chat.saved === true,
    conversationId: chat.state.conversationId ?? null,
  }
}

function chatFingerprint(chats: RecentChat[]): string {
  return chats.map((chat) => `${chat.id}:${chat.saved ? 1 : 0}`).join(',')
}

function dedupeStoredChats(chats: RecentChat[]): RecentChat[] {
  const seen = new Map<number, number>()
  const result: RecentChat[] = []
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)

  for (const chat of sorted) {
    const conversationId = chat.state.conversationId
    if (conversationId == null) {
      result.push(chat)
      continue
    }

    const existingIndex = seen.get(conversationId)
    if (existingIndex == null) {
      seen.set(conversationId, result.length)
      result.push(chat)
      continue
    }

    if (chat.saved) {
      const existing = result[existingIndex]
      if (existing && !existing.saved) {
        result[existingIndex] = { ...existing, saved: true }
      }
    }
  }

  return result
}

async function persistChats(chats: RecentChat[]): Promise<RecentChat[]> {
  const next = trimRecentChats(dedupeStoredChats(chats))
  await browser.storage.local.set({ [STORAGE_KEY]: next })
  return next
}

async function readStoredChats(): Promise<RecentChat[]> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const chats = result[STORAGE_KEY]
  if (!Array.isArray(chats)) return []
  const savedIds = new Set(await readSavedServerIds())
  const normalized = chats
    .map(normalizeChat)
    .filter((chat): chat is RecentChat => chat != null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chat) => ({
      ...chat,
      saved:
        chat.saved === true ||
        (chat.state.conversationId != null && savedIds.has(chat.state.conversationId)),
    }))
  const trimmed = trimRecentChats(dedupeStoredChats(normalized))
  if (chatFingerprint(normalized) !== chatFingerprint(trimmed)) {
    await persistChats(trimmed)
  }
  return trimmed
}

function normalizeSavedServerIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
    ),
  ]
}

async function readSavedServerIds(): Promise<number[]> {
  const result = await browser.storage.local.get(SAVED_SERVER_IDS_KEY)
  return normalizeSavedServerIds(result[SAVED_SERVER_IDS_KEY])
}

async function persistSavedServerIds(ids: number[]): Promise<number[]> {
  const next = normalizeSavedServerIds(ids)
  await browser.storage.local.set({ [SAVED_SERVER_IDS_KEY]: next })
  return next
}

export async function listRecentChats(): Promise<RecentChat[]> {
  return readStoredChats()
}

export async function listRecentChatSummaries(): Promise<RecentChatSummary[]> {
  const chats = await readStoredChats()
  return chats.map(toSummary)
}

export async function listSavedServerConversationIds(): Promise<number[]> {
  return readSavedServerIds()
}

export async function getRecentChat(id: string): Promise<RecentChat | null> {
  const chats = await readStoredChats()
  return chats.find((chat) => chat.id === id) ?? null
}

export async function deleteRecentChat(id: string): Promise<void> {
  const chats = await readStoredChats()
  const removed = chats.find((chat) => chat.id === id)
  const next = chats.filter((chat) => chat.id !== id)
  await persistChats(next)
  if (removed?.state.conversationId != null) {
    await setServerConversationSaved(removed.state.conversationId, false)
  }
}

export async function deleteRecentChatsByConversationId(conversationId: number): Promise<void> {
  const chats = await readStoredChats()
  const next = chats.filter((chat) => chat.state.conversationId !== conversationId)
  await persistChats(next)
  await setServerConversationSaved(conversationId, false)
}

export async function setServerConversationSaved(
  conversationId: number,
  saved: boolean
): Promise<number[]> {
  const current = await readSavedServerIds()
  const next = saved
    ? [...new Set([...current, conversationId])]
    : current.filter((id) => id !== conversationId)
  return persistSavedServerIds(next)
}

export async function setRecentChatSaved(id: string, saved: boolean): Promise<void> {
  const chats = await readStoredChats()
  const target = chats.find((chat) => chat.id === id)
  if (!target) return

  const next = chats.map((chat) => (chat.id === id ? { ...chat, saved } : chat))
  await persistChats(next)
  if (target.state.conversationId != null) {
    await setServerConversationSaved(target.state.conversationId, saved)
  }
}

export async function upsertRecentChat(params: {
  id?: string | null
  state: ExtensionShellPersistedState
  sourceTabId?: number
  sourceTabTitle?: string
  sourceTabUrl?: string
}): Promise<RecentChat> {
  const chats = await readStoredChats()
  const savedServerIds = new Set(await readSavedServerIds())
  const conversationId = params.state.conversationId ?? null
  const existingById = params.id ? chats.find((chat) => chat.id === params.id) : undefined
  const existingByConversation =
    conversationId != null
      ? chats.find((chat) => chat.state.conversationId === conversationId)
      : undefined
  const id = params.id ?? existingByConversation?.id ?? crypto.randomUUID()
  const existing = chats.find((chat) => chat.id === id) ?? existingById ?? existingByConversation

  const entry: RecentChat = {
    id,
    title: deriveTitle(params.state),
    updatedAt: Date.now(),
    sourceTabId: params.sourceTabId,
    sourceTabTitle: params.sourceTabTitle,
    sourceTabUrl: params.sourceTabUrl,
    saved:
      existing?.saved === true || (conversationId != null && savedServerIds.has(conversationId)),
    state: {
      ...params.state,
      activeRecentChatId: id,
    },
  }

  const filtered = chats.filter((chat) => {
    if (chat.id === id) return false
    if (conversationId != null && chat.state.conversationId === conversationId) return false
    return true
  })
  await persistChats([entry, ...filtered])
  return entry
}
