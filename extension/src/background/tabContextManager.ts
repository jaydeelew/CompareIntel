import {
  buildTabContextBundle,
  DEFAULT_TAB_CONTEXT_SETTINGS,
  type TabContextBundle,
  type TabContextEntry,
  type TabContextMessage,
  type TabContextResponse,
  type TabContextSettings,
} from '@compareintel/core'

import type { ExtractedPageContent } from '../shared/extractPageContent'
import { canExtractTab } from '../shared/urlPolicy'

interface CachedEntry {
  entry: TabContextEntry
  contentHash: string
}

type PageContentResponse = { type: 'PAGE_CONTENT'; content: ExtractedPageContent }

const CONTENT_SCRIPT_RETRY_MS = [0, 50, 100, 200, 400, 800]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  clearPageContext(): void {
    this.cache.clear()
    this.pinnedTabIds.clear()
    this.selectionByTab.clear()
  }

  async handleMessage(message: TabContextMessage): Promise<TabContextResponse> {
    try {
      switch (message.type) {
        case 'GET_ACTIVE_TAB': {
          const window = await chrome.windows.getLastFocused().catch(() => null)
          let tab = window?.id
            ? (await chrome.tabs.query({ active: true, windowId: window.id }))[0]
            : undefined
          if (!tab?.id || !tab.url) {
            tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
          }
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
          this.clearPageContext()
          return { type: 'OK' }
        case 'GET_TAB_CONTEXT': {
          const bundle = await this.buildContext(
            message.tabIds,
            message.includeSelection ?? true,
            message.preloaded
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

  private async buildContext(
    tabIds: number[],
    includeSelection: boolean,
    preloaded?: Record<number, ExtractedPageContent>
  ): Promise<TabContextBundle> {
    const entries: TabContextEntry[] = []
    const extractionFailures: TabContextBundle['extractionFailures'] = []

    for (const tabId of tabIds) {
      const tab = await chrome.tabs.get(tabId).catch(() => null)
      const entry = await this.extractTab(tabId, includeSelection, preloaded?.[tabId])
      if (entry) {
        entries.push(entry)
      } else if (tab?.url && canExtractTab(tab.url)) {
        extractionFailures.push({
          tabId,
          url: tab.url,
          title: tab.title ?? tab.url,
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
    preloaded?: ExtractedPageContent
  ): Promise<TabContextEntry | null> {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url || !canExtractTab(tab.url)) return null

    const cached = this.cache.get(tabId)
    const selection = includeSelection ? (this.selectionByTab.get(tabId) ?? '') : ''

    if (cached && !selection && !preloaded) return cached.entry

    const result = preloaded ?? (await this.readTabContent(tabId))
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
  }

  private async readTabContent(tabId: number): Promise<ExtractedPageContent | null> {
    const fromContentScript = await this.extractViaContentScript(tabId)
    if (fromContentScript) return fromContentScript

    const fromScript = await this.extractViaExecuteScript(tabId)
    if (fromScript) return fromScript

    return null
  }

  private async extractViaContentScript(tabId: number): Promise<ExtractedPageContent | null> {
    for (const delayMs of CONTENT_SCRIPT_RETRY_MS) {
      try {
        const response = (await chrome.tabs.sendMessage(tabId, {
          type: 'EXTRACT_PAGE_CONTENT',
        })) as PageContentResponse | undefined
        if (response?.type === 'PAGE_CONTENT' && response.content) {
          return response.content
        }
      } catch {
        await this.injectBundledContentScript(tabId)
        try {
          const response = (await chrome.tabs.sendMessage(tabId, {
            type: 'EXTRACT_PAGE_CONTENT',
          })) as PageContentResponse | undefined
          if (response?.type === 'PAGE_CONTENT' && response.content) {
            return response.content
          }
        } catch {
          // Still unavailable; retry after delay.
        }
      }
      if (delayMs > 0) await sleep(delayMs)
    }
    return null
  }

  /** Re-inject the bundled content script when a tab predates the extension (requires activeTab). */
  private async injectBundledContentScript(tabId: number): Promise<void> {
    const manifest = chrome.runtime.getManifest()
    const scripts = manifest.content_scripts?.[0]?.js ?? []
    if (!scripts.length) return

    for (const file of scripts) {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: [file] })
      } catch {
        // activeTab not granted or page blocks injection
      }
    }
  }

  private async extractViaExecuteScript(tabId: number): Promise<ExtractedPageContent | null> {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const selection = window.getSelection()?.toString() ?? ''
          const url = location.href
          const title = document.title
          const body = document.body?.cloneNode(true) as HTMLElement | null
          if (body) {
            body.querySelectorAll('script, style, noscript, iframe').forEach((el) => el.remove())
            return {
              url,
              title,
              text: body.innerText?.trim() ?? '',
              selection,
            }
          }
          return { url, title, text: '', selection }
        },
      })
      return (result as ExtractedPageContent) ?? null
    } catch {
      return null
    }
  }
}
