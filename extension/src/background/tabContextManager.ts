import {
  buildTabContextBundle,
  DEFAULT_TAB_CONTEXT_SETTINGS,
  type TabContextBundle,
  type TabContextEntry,
  type TabContextMessage,
  type TabContextResponse,
  type TabContextSettings,
} from '@compareintel/core'

import { extractPageContent } from '../shared/extractPageContent'
import { canExtractTab } from '../shared/urlPolicy'

interface CachedEntry {
  entry: TabContextEntry
  contentHash: string
}

export class TabContextManager {
  private cache = new Map<number, CachedEntry>()
  private pinnedTabIds = new Set<number>()
  private settings: TabContextSettings = { ...DEFAULT_TAB_CONTEXT_SETTINGS }
  private selectionByTab = new Map<number, string>()

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
    })
  }

  setShareCurrentTab(enabled: boolean): void {
    this.settings.shareCurrentTab = enabled
  }

  getShareCurrentTab(): boolean {
    return this.settings.shareCurrentTab
  }

  async pinTab(tabId: number): Promise<void> {
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
    this.selectionByTab.set(tabId, text)
  }

  clearCache(): void {
    this.cache.clear()
  }

  async handleMessage(message: TabContextMessage): Promise<TabContextResponse> {
    try {
      switch (message.type) {
        case 'GET_ACTIVE_TAB': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          if (!tab?.id || !tab.url) return { type: 'ACTIVE_TAB', tab: null }
          return {
            type: 'ACTIVE_TAB',
            tab: {
              tabId: tab.id,
              url: tab.url,
              title: tab.title ?? tab.url,
              favIconUrl: tab.favIconUrl,
            },
          }
        }
        case 'LIST_TABS': {
          const tabs = await chrome.tabs.query({ currentWindow: true })
          return {
            type: 'TABS_LIST',
            tabs: tabs
              .filter((t) => t.id && t.url && canExtractTab(t.url))
              .map((t) => ({
                tabId: t.id!,
                url: t.url!,
                title: t.title ?? t.url!,
                favIconUrl: t.favIconUrl,
                pinned: this.pinnedTabIds.has(t.id!),
              })),
          }
        }
        case 'PIN_TAB':
          await this.pinTab(message.tabId)
          return { type: 'OK' }
        case 'UNPIN_TAB':
          this.unpinTab(message.tabId)
          return { type: 'OK' }
        case 'GET_PINNED_TABS':
          return { type: 'PINNED_TABS', tabIds: this.getPinnedTabIds() }
        case 'GET_SELECTION':
          return {
            type: 'SELECTION',
            text: this.selectionByTab.get(message.tabId) ?? '',
          }
        case 'CLEAR_CONTEXT_CACHE':
          this.clearCache()
          return { type: 'OK' }
        case 'GET_TAB_CONTEXT': {
          const bundle = await this.buildContext(message.tabIds, message.includeSelection ?? true)
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

  private async buildContext(tabIds: number[], includeSelection: boolean): Promise<TabContextBundle> {
    const entries: TabContextEntry[] = []
    for (const tabId of tabIds) {
      const entry = await this.extractTab(tabId, includeSelection)
      if (entry) entries.push(entry)
    }
    return buildTabContextBundle(entries, this.settings.maxCharsPerTab)
  }

  private async extractTab(tabId: number, includeSelection: boolean): Promise<TabContextEntry | null> {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url || !canExtractTab(tab.url)) return null

    const cached = this.cache.get(tabId)
    const selection = includeSelection ? (this.selectionByTab.get(tabId) ?? '') : ''

    if (cached && !selection) return cached.entry

    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPageContent,
      })

      if (!result) return null

      const entry: TabContextEntry = {
        tabId,
        url: result.url,
        title: result.title || tab.title || result.url,
        text: result.text,
        selection: selection || result.selection,
        extractedAt: Date.now(),
        favIconUrl: tab.favIconUrl,
      }

      const contentHash = `${entry.url}:${entry.text.length}`
      this.cache.set(tabId, { entry, contentHash })
      return entry
    } catch {
      return null
    }
  }
}
