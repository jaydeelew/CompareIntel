export const MAX_RECENT_CHATS = 10

export interface RecentHistoryLocalChat {
  id: string
  title: string
  updatedAt: number
  saved?: boolean
  conversationId?: number | null
  sourceTabTitle?: string
}

export interface RecentHistoryServerSummary {
  id: number
  input_data: string
  created_at: string
  client_source?: string
  saved?: boolean
}

export type MergedRecentHistoryItem =
  | { kind: 'local'; chat: RecentHistoryLocalChat; saved: boolean; updatedAt: number }
  | { kind: 'server'; summary: RecentHistoryServerSummary; saved: boolean; updatedAt: number }

function isSaved(item: { saved?: boolean }): boolean {
  return item.saved === true
}

export function trimRecentChats<T extends { updatedAt: number; saved?: boolean }>(
  items: T[],
  max = MAX_RECENT_CHATS
): T[] {
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt)
  const saved = sorted.filter(isSaved)
  const unsaved = sorted.filter((item) => !isSaved(item))
  const unsavedBudget = saved.length >= max ? 1 : Math.max(0, max - saved.length)
  return [...saved, ...unsaved.slice(0, unsavedBudget)].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function mergeRecentHistory(params: {
  localChats: RecentHistoryLocalChat[]
  serverHistory: RecentHistoryServerSummary[]
  savedServerIds?: Iterable<number>
  max?: number | null
}): MergedRecentHistoryItem[] {
  const savedServerIds = new Set(params.savedServerIds ?? [])
  const seenServerIds = new Set<number>()
  const items: MergedRecentHistoryItem[] = []

  for (const chat of params.localChats) {
    if (chat.conversationId != null) seenServerIds.add(chat.conversationId)
    items.push({
      kind: 'local',
      chat,
      saved:
        isSaved(chat) ||
        (chat.conversationId != null && savedServerIds.has(chat.conversationId)),
      updatedAt: chat.updatedAt,
    })
  }

  for (const summary of params.serverHistory) {
    if (seenServerIds.has(summary.id)) continue
    const updatedAt = new Date(summary.created_at).getTime()
    items.push({
      kind: 'server',
      summary,
      saved: savedServerIds.has(summary.id) || summary.saved === true,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    })
  }

  const sorted = items.sort((a, b) => b.updatedAt - a.updatedAt)
  if (params.max == null) return sorted
  return trimRecentChats(sorted, params.max)
}
