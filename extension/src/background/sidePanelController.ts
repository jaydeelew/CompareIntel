import browser from 'webextension-polyfill'

import { getPanelScope, type PanelScope } from '../shared/extensionSettings'

const panelEnabledTabs = new Set<number>()
const tabsWithoutPanel = new Set<number>()

type SidePanelApi = typeof chrome.sidePanel & {
  close?: (options: { tabId?: number; windowId?: number }) => Promise<void>
}

type FirefoxBrowser = typeof browser & {
  sidebarAction?: { close?: () => Promise<void> }
}

function getSidePanelApi(): SidePanelApi | undefined {
  return globalThis.chrome?.sidePanel as SidePanelApi | undefined
}

async function setSidePanelEnabledForTab(tabId: number, enabled: boolean): Promise<void> {
  await getSidePanelApi()?.setOptions({ tabId, enabled }).catch(() => undefined)
}

async function closeGlobalSidePanel(options: { tabId?: number; windowId?: number }): Promise<void> {
  const sidePanel = getSidePanelApi()
  if (typeof sidePanel?.close === 'function') {
    // A globally open panel (always_open / manifest default_path) is closed by
    // windowId. close({ tabId }) rejects on Chrome 145+ when only a global panel
    // is open, so windowId must come first.
    if (options.windowId != null) {
      await sidePanel.close({ windowId: options.windowId }).catch(() => undefined)
    }
    if (options.tabId != null) {
      await sidePanel.close({ tabId: options.tabId }).catch(() => undefined)
    }
  }

  const sidebarAction = (browser as FirefoxBrowser).sidebarAction
  if (typeof sidebarAction?.close === 'function') {
    await sidebarAction.close().catch(() => undefined)
  }
}

export async function applyPanelScope(scope: PanelScope): Promise<void> {
  const sidePanel = getSidePanelApi()
  if (scope === 'always_open') {
    await sidePanel?.setOptions({ enabled: true }).catch(() => undefined)
    await sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
    return
  }

  await sidePanel?.setOptions({ enabled: false }).catch(() => undefined)
  await sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)

  const tabs = await browser.tabs.query({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return
      await setSidePanelEnabledForTab(tab.id, panelEnabledTabs.has(tab.id))
    })
  )
}

export async function initializeSidePanel(): Promise<void> {
  const scope = await getPanelScope()
  await applyPanelScope(scope)
}

export async function openPanelForTab(tabId: number): Promise<void> {
  const scope = await getPanelScope()
  tabsWithoutPanel.delete(tabId)
  if (scope === 'per_tab') {
    panelEnabledTabs.add(tabId)
  }
  await setSidePanelEnabledForTab(tabId, true)
  await getSidePanelApi()?.open({ tabId }).catch(() => undefined)
}

export async function openUrlWithoutSidePanel(
  url: string,
  windowId?: number
): Promise<void> {
  const tab = await browser.tabs.create({
    url,
    active: false,
    ...(windowId != null ? { windowId } : {}),
  })
  if (tab.id == null) return

  tabsWithoutPanel.add(tab.id)
  await setSidePanelEnabledForTab(tab.id, false)
  await browser.tabs.update(tab.id, { active: true }).catch(() => undefined)
  await closeGlobalSidePanel({
    tabId: tab.id,
    windowId: tab.windowId ?? windowId,
  })
}

export async function handleTabActivated(tabId: number, windowId: number): Promise<void> {
  if (!tabsWithoutPanel.has(tabId)) return
  await setSidePanelEnabledForTab(tabId, false)
  await closeGlobalSidePanel({ tabId, windowId })
}

export async function handleNewTab(tabId: number): Promise<void> {
  const scope = await getPanelScope()
  if (scope === 'per_tab') {
    await setSidePanelEnabledForTab(tabId, false)
  }
}

export function handleTabRemoved(tabId: number): void {
  panelEnabledTabs.delete(tabId)
  tabsWithoutPanel.delete(tabId)
}
