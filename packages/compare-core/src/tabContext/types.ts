export interface TabContextEntry {
  tabId: number
  url: string
  title: string
  text: string
  selection: string
  extractedAt: number
  favIconUrl?: string
}

export interface TabContextBundle {
  tabs: TabContextEntry[]
  tokenEstimate: number
}

export interface TabContextSettings {
  shareCurrentTab: boolean
  pinnedTabIds: number[]
  maxPinnedTabs: number
  maxCharsPerTab: number
}

export const DEFAULT_TAB_CONTEXT_SETTINGS: TabContextSettings = {
  shareCurrentTab: true,
  pinnedTabIds: [],
  maxPinnedTabs: 10,
  maxCharsPerTab: 50_000,
}

export type TabContextMessage =
  | { type: 'GET_TAB_CONTEXT'; tabIds: number[]; includeSelection?: boolean }
  | { type: 'GET_ACTIVE_TAB' }
  | { type: 'LIST_TABS' }
  | { type: 'PIN_TAB'; tabId: number }
  | { type: 'UNPIN_TAB'; tabId: number }
  | { type: 'GET_PINNED_TABS' }
  | { type: 'GET_SELECTION'; tabId: number }
  | { type: 'CLEAR_CONTEXT_CACHE' }

export type TabContextResponse =
  | { type: 'TAB_CONTEXT'; bundle: TabContextBundle }
  | { type: 'ACTIVE_TAB'; tab: { tabId: number; url: string; title: string; favIconUrl?: string } | null }
  | { type: 'TABS_LIST'; tabs: Array<{ tabId: number; url: string; title: string; favIconUrl?: string; pinned: boolean }> }
  | { type: 'PINNED_TABS'; tabIds: number[] }
  | { type: 'SELECTION'; text: string }
  | { type: 'ERROR'; message: string }
  | { type: 'OK' }
