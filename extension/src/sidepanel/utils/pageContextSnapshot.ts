import { DEFAULT_TAB_CONTEXT_SETTINGS } from '@compareintel/core'

export interface SavedPageContext {
  url: string
  title: string
  favIconUrl?: string
  source: 'active' | 'pinned'
}

export const MAX_PINNED_TABS = DEFAULT_TAB_CONTEXT_SETTINGS.maxPinnedTabs

export function normalizePageUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }
    return parsed.href
  } catch {
    return url
  }
}

export function samePageContexts(
  left: SavedPageContext[],
  right: SavedPageContext[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (context, index) =>
        normalizePageUrl(context.url) === normalizePageUrl(right[index]?.url ?? '') &&
        context.source === right[index]?.source &&
        context.title === right[index]?.title &&
        context.favIconUrl === right[index]?.favIconUrl
    )
  )
}

function pinnedContexts(saved: SavedPageContext[]): SavedPageContext[] {
  return saved.filter((context) => context.source === 'pinned')
}

/** Keep user pins; replace the ephemeral active-tab chip. Never adds pins from live browser state. */
export function replaceActiveContext(
  saved: SavedPageContext[],
  activeTab: { url: string; title: string; favIconUrl?: string } | null,
  sharePageContext: boolean
): SavedPageContext[] {
  const pinned = pinnedContexts(saved)
  const pinnedKeys = new Set(pinned.map((context) => normalizePageUrl(context.url)))

  if (!sharePageContext) return pinned

  if (!activeTab) {
    const active = saved.filter(
      (context) =>
        context.source === 'active' && !pinnedKeys.has(normalizePageUrl(context.url))
    )
    return [...active, ...pinned]
  }

  const key = normalizePageUrl(activeTab.url)
  if (pinnedKeys.has(key)) return pinned

  return [
    {
      url: activeTab.url,
      title: activeTab.title,
      favIconUrl: activeTab.favIconUrl,
      source: 'active',
    },
    ...pinned,
  ]
}

/** Promote restored active pages to pins so they are not replaced by the current tab. */
export function promoteActiveContextsToPinned(saved: SavedPageContext[]): SavedPageContext[] {
  const next: SavedPageContext[] = []
  const seen = new Set<string>()
  for (const context of saved) {
    const key = normalizePageUrl(context.url)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(context.source === 'active' ? { ...context, source: 'pinned' } : context)
  }
  return next
}

export function addPinnedContext(
  saved: SavedPageContext[],
  tab: { url: string; title: string; favIconUrl?: string }
): SavedPageContext[] {
  const key = normalizePageUrl(tab.url)
  const pinnedEntry: SavedPageContext = {
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    source: 'pinned',
  }
  const alreadyPinned = saved.some(
    (context) => context.source === 'pinned' && normalizePageUrl(context.url) === key
  )
  if (!alreadyPinned && pinnedContexts(saved).length >= MAX_PINNED_TABS) {
    return saved
  }

  let replaced = false
  const next = saved.map((context) => {
    if (normalizePageUrl(context.url) !== key) return context
    replaced = true
    return pinnedEntry
  })
  if (replaced) return next
  return [...next, pinnedEntry]
}

export function removePageContext(saved: SavedPageContext[], url: string): SavedPageContext[] {
  const key = normalizePageUrl(url)
  return saved.filter((context) => normalizePageUrl(context.url) !== key)
}

export function matchOpenTabsToContexts(
  contexts: SavedPageContext[],
  openTabs: Array<{ tabId: number; url: string }>
): number[] {
  const byUrl = new Map(
    openTabs.map((tab) => [normalizePageUrl(tab.url), tab.tabId] as const)
  )
  const tabIds: number[] = []
  const seen = new Set<number>()
  for (const context of contexts) {
    if (context.source !== 'pinned') continue
    const tabId = byUrl.get(normalizePageUrl(context.url))
    if (tabId == null || seen.has(tabId)) continue
    seen.add(tabId)
    tabIds.push(tabId)
  }
  return tabIds
}
