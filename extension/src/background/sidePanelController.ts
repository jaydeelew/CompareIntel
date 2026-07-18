import browser from 'webextension-polyfill'

import { getPanelScope, type PanelScope } from '../shared/extensionSettings'

const panelEnabledTabs = new Set<number>()

async function setSidePanelEnabledForTab(tabId: number, enabled: boolean): Promise<void> {
  await chrome.sidePanel.setOptions({ tabId, enabled }).catch(() => undefined)
}

export async function applyPanelScope(scope: PanelScope): Promise<void> {
  if (scope === 'always_open') {
    await chrome.sidePanel.setOptions({ enabled: true }).catch(() => undefined)
    await chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => undefined)
    return
  }

  await chrome.sidePanel.setOptions({ enabled: false }).catch(() => undefined)
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined)

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
  if (scope === 'per_tab') {
    panelEnabledTabs.add(tabId)
    await setSidePanelEnabledForTab(tabId, true)
  }
  await chrome.sidePanel.open({ tabId }).catch(() => undefined)
}

export async function handleNewTab(tabId: number): Promise<void> {
  const scope = await getPanelScope()
  if (scope === 'per_tab') {
    await setSidePanelEnabledForTab(tabId, false)
  }
}

export function handleTabRemoved(tabId: number): void {
  panelEnabledTabs.delete(tabId)
}
