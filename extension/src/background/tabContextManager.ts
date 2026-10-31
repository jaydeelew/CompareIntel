import {
  buildTabContextBundle,
  DEFAULT_TAB_CONTEXT_SETTINGS,
  type ActiveTabInfo,
  type TabAccessRestriction,
  type TabContextBundle,
  type TabContextEntry,
  type TabContextMessage,
  type TabContextResponse,
  type TabContextSettings,
} from '@compareintel/core'

import {
  MAX_PAGE_TEXT_CHARS,
  MAX_SELECTION_CHARS,
  type ExtractedPageContent,
} from '../shared/extractPageContent'
import { executeExtractPageContent } from '../shared/pageInjection'
import { canExtractTab, isRestrictedPage, pageAccessMessage } from '../shared/urlPolicy'

interface CachedEntry {
  entry: TabContextEntry
  contentHash: string
}

const MAX_CACHED_TABS = 20

function tabTitle(tab: { title?: string; url?: string }, fallback = 'This tab'): string {
  return tab.title || tab.url || fallback
}

export class TabContextManager {
  private cache = new Map<number, CachedEntry>()
  private pinnedTabIds = new Set<number>()
  private settings: TabContextSettings = { ...DEFAULT_TAB_CONTEXT_SETTINGS }
  private selectionByTab = new Map<number, string>()
  private lastInvoked: ActiveTabInfo | null = null

  constructor() {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        this.cache.delete(tabId)
      }
    })
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cache.delete(tabId)
      this.pinnedTabIds.delete(tabId)
      this.selectionByTab.delete(tabId)
      if (this.lastInvoked?.tabId === tabId) this.lastInvoked = null
    })
  }

  setShareCurrentTab(enabled: boolean): void {
    this.settings.shareCurrentTab = enabled
  }

  getShareCurrentTab(): boolean {
    return this.settings.shareCurrentTab
  }

  async pinTab(tabId: number): Promise<void> {
    if (this.pinnedTabIds.has(tabId)) return
    if (this.pinnedTabIds.size >= this.settings.maxPinnedTabs) {
      throw new Error(`Maximum ${this.settings.maxPinnedTabs} pinned tabs`)
    }
    this.pinnedTabIds.add(tabId)
  }

  unpinTab(tabId: number): void {
    this.pinnedTabIds.delete(tabId)
  }

  getPinnedTabIds(): number[] {
    return [...this.pinnedTabIds]
  }

  setSelection(tabId: number, text: string): void {
    this.selectionByTab.set(tabId, text.slice(0, MAX_SELECTION_CHARS))
  }

  clearPageContext(): void {
    this.cache.clear()
    this.pinnedTabIds.clear()
    this.selectionByTab.clear()
  }

  rememberInvokedTab(tab: { id?: number; url?: string; title?: string; favIconUrl?: string }): void {
    if (tab.id == null) return
    this.lastInvoked = {
      tabId: tab.id,
      url: tab.url ?? '',
      title: tabTitle(tab),
      favIconUrl: tab.favIconUrl,
    }
  }

  /** Snapshot selection + page text after a user gesture (action, panel open, submit). */
  async captureTab(tab: {
    id?: number
    url?: string
    title?: string
    favIconUrl?: string
  }): Promise<void> {
    this.rememberInvokedTab(tab)
    if (tab.id == null) return
    if (tab.url && !canExtractTab(tab.url)) return
    const content = await executeExtractPageContent(tab.id)
    if (!content) return
    if (content.selection) this.setSelection(tab.id, content.selection)
    await this.extractTab(tab.id, true, content)
  }

  async handleMessage(message: TabContextMessage): Promise<TabContextResponse> {
    try {
      switch (message.type) {
        case 'GET_ACTIVE_TAB': {
          if (message.capture) {
            const live = await this.queryActiveTab()
            if (live) await this.captureTab(live)
          }
          return this.buildActiveTabResponse()
        }
        case 'LIST_TABS': {
          const tabs = await chrome.tabs.query(message.allWindows ? {} : { currentWindow: true })
          const listed = new Map<number, ActiveTabInfo & { pinned: boolean }>()
          for (const tab of tabs) {
            if (!tab.id || !tab.url || !canExtractTab(tab.url)) continue
            listed.set(tab.id, {
              tabId: tab.id,
              url: tab.url,
              title: tabTitle(tab, tab.url),
              favIconUrl: tab.favIconUrl,
              pinned: this.pinnedTabIds.has(tab.id),
            })
          }
          const invoked = this.lastInvoked
          if (invoked && canExtractTab(invoked.url) && !listed.has(invoked.tabId)) {
            listed.set(invoked.tabId, { ...invoked, pinned: this.pinnedTabIds.has(invoked.tabId) })
          }
          return { type: 'TABS_LIST', tabs: [...listed.values()] }
        }
        case 'PIN_TAB':
          await this.pinTab(message.tabId)
          return { type: 'OK' }
        case 'UNPIN_TAB':
          this.unpinTab(message.tabId)
          return { type: 'OK' }
        case 'SET_PINNED_TABS':
          this.pinnedTabIds = new Set(message.tabIds.slice(0, this.settings.maxPinnedTabs))
          return { type: 'OK' }
        case 'GET_PINNED_TABS':
          return { type: 'PINNED_TABS', tabIds: this.getPinnedTabIds() }
        case 'GET_SELECTION': {
          const cached = this.selectionByTab.get(message.tabId) ?? ''
          if (cached) return { type: 'SELECTION', text: cached }
          const content = await executeExtractPageContent(message.tabId)
          const text = content?.selection ?? ''
          if (text) this.setSelection(message.tabId, text)
          return { type: 'SELECTION', text }
        }
        case 'CLEAR_CONTEXT_CACHE':
          this.clearPageContext()
          return { type: 'OK' }
        case 'GET_TAB_CONTEXT': {
          const bundle = await this.buildContext(
            message.tabIds,
            message.includeSelection ?? true,
            message.preloaded,
          )
          return { type: 'TAB_CONTEXT', bundle }
        }
        default:
          return { type: 'ERROR', message: 'Unknown message type' }
      }
    } catch (err) {
      return {
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Tab context error',
      }
    }
  }

  async buildContextForSubmit(activeTabId?: number): Promise<TabContextBundle> {
    const tabIds = new Set<number>(this.pinnedTabIds)
    if (this.settings.shareCurrentTab && activeTabId) {
      tabIds.add(activeTabId)
    }
    return this.buildContext([...tabIds], true)
  }

  private async queryActiveTab(): Promise<chrome.tabs.Tab | null> {
    const window = await chrome.windows.getLastFocused().catch(() => null)
    let tab = window?.id
      ? (await chrome.tabs.query({ active: true, windowId: window.id }))[0]
      : undefined
    if (!tab?.id) {
      tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
    }
    return tab?.id ? tab : null
  }

  private resolveTabInfo(tab: chrome.tabs.Tab): ActiveTabInfo {
    const invoked = this.lastInvoked?.tabId === tab.id ? this.lastInvoked : null
    return {
      tabId: tab.id!,
      url: tab.url || invoked?.url || '',
      title: tabTitle(tab, invoked?.title || 'This tab'),
      favIconUrl: tab.favIconUrl || invoked?.favIconUrl,
    }
  }

  private async buildActiveTabResponse(): Promise<TabContextResponse> {
    const tab = await this.queryActiveTab()
    if (!tab?.id) return { type: 'ACTIVE_TAB', tab: null }

    const info = this.resolveTabInfo(tab)
    const message = pageAccessMessage(info.url)
    if (message) {
      const restriction: TabAccessRestriction = { tabId: tab.id, message }
      return { type: 'ACTIVE_TAB', tab: canExtractTab(info.url) ? info : null, restriction }
    }

    return { type: 'ACTIVE_TAB', tab: info }
  }

  private async buildContext(
    tabIds: number[],
    includeSelection: boolean,
    preloaded?: Record<number, ExtractedPageContent>,
  ): Promise<TabContextBundle> {
    const entries: TabContextEntry[] = []
    const extractionFailures: TabContextBundle['extractionFailures'] = []

    for (const tabId of tabIds) {
      const tab = await chrome.tabs.get(tabId).catch(() => null)
      const knownUrl = tab?.url || this.cache.get(tabId)?.entry.url || ''
      if (knownUrl && isRestrictedPage(knownUrl)) {
        extractionFailures.push({
          tabId,
          url: knownUrl,
          title: tabTitle(tab ?? {}, knownUrl),
        })
        continue
      }

      const entry = await this.extractTab(tabId, includeSelection, preloaded?.[tabId])
      if (entry) {
        entries.push(entry)
      } else {
        extractionFailures.push({
          tabId,
          url: knownUrl || `tab:${tabId}`,
          title: tabTitle(tab ?? {}, knownUrl || 'This tab'),
        })
      }
    }

    return {
      ...buildTabContextBundle(entries, this.settings.maxCharsPerTab),
      extractionFailures: extractionFailures.length > 0 ? extractionFailures : undefined,
    }
  }

  private async extractTab(
    tabId: number,
    includeSelection: boolean,
    preloaded?: ExtractedPageContent,
  ): Promise<TabContextEntry | null> {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    if (!tab) return null
    if (tab.url && !canExtractTab(tab.url)) return null

    const cached = this.cache.get(tabId)
    const selection = includeSelection ? (this.selectionByTab.get(tabId) ?? '') : ''

    if (cached && !selection && !preloaded) return cached.entry

    const extracted = preloaded ?? (await executeExtractPageContent(tabId))
    if (!extracted) {
      if (!cached) return null
      return includeSelection
        ? { ...cached.entry, selection: selection.slice(0, MAX_SELECTION_CHARS) }
        : cached.entry
    }

    const entry: TabContextEntry = {
      tabId,
      url: extracted.url,
      title: extracted.title || tab.title || extracted.url,
      text: extracted.text.slice(0, MAX_PAGE_TEXT_CHARS),
      selection: (selection || extracted.selection).slice(0, MAX_SELECTION_CHARS),
      extractedAt: Date.now(),
      favIconUrl: tab.favIconUrl,
    }

    const contentHash = `${entry.url}:${entry.text.length}`
    this.rememberCache(tabId, { entry, contentHash })
    return entry
  }

  private rememberCache(tabId: number, value: CachedEntry): void {
    this.cache.delete(tabId)
    this.cache.set(tabId, value)
    while (this.cache.size > MAX_CACHED_TABS) {
      const oldest = this.cache.keys().next().value
      if (oldest == null) break
      this.cache.delete(oldest)
    }
  }
}
