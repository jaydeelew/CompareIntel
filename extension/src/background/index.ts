import type { TabContextMessage, TabContextResponse } from '@compareintel/core'
import { getPanelScope, setPanelScope, type PanelScope } from '../shared/extensionSettings'
import browser from 'webextension-polyfill'

import { authStorage } from '../shared/authStorage'
import { consumeHandoff, storeHandoff } from '../shared/handoff'
import type { CiExternalMessage } from '../shared/messages'
import { isAllowedWebAppOrigin } from '../shared/webAppOrigins'
import {
  applyPanelScope,
  handleNewTab,
  handleTabRemoved,
  initializeSidePanel,
  openPanelForTab,
  openUrlWithoutSidePanel,
} from './sidePanelController'
import { TabContextManager } from './tabContextManager'

const tabContextManager = new TabContextManager()

type BackgroundMessage =
  | TabContextMessage
  | { type: 'SELECTION_CAPTURED'; text: string }
  | { type: 'GET_PANEL_SCOPE' }
  | { type: 'SET_PANEL_SCOPE'; scope: PanelScope }
  | { type: 'GET_HANDOFF' }
  | { type: 'STORE_HANDOFF'; payload: Parameters<typeof storeHandoff>[0] }
  | { type: 'BROADCAST_LOGOUT' }
  | { type: 'WEB_APP_BRIDGE_READY' }
  | { type: 'OPEN_TAB_WITHOUT_PANEL'; url: string }

type BackgroundResponse =
  | TabContextResponse
  | { type: 'OK' }
  | { type: 'PANEL_SCOPE'; scope: PanelScope }
  | { type: 'ERROR'; message: string }
  | { type: 'HANDOFF'; payload: Awaited<ReturnType<typeof consumeHandoff>> }

async function notifyWebAppTabsLogout(): Promise<void> {
  const tabs = await browser.tabs.query({})
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue
    try {
      const origin = new URL(tab.url).origin
      if (!isAllowedWebAppOrigin(origin)) continue
      await browser.tabs.sendMessage(tab.id, { type: 'CI_EXTENSION_LOGOUT' }).catch(() => undefined)
    } catch {
      // ignore invalid URLs
    }
  }
}

browser.runtime.onInstalled.addListener(() => {
  void initializeSidePanel()
})

browser.runtime.onStartup.addListener(() => {
  void initializeSidePanel()
})

browser.tabs.onCreated.addListener((tab) => {
  if (tab.id != null) {
    void handleNewTab(tab.id)
  }
})

browser.tabs.onRemoved.addListener((tabId) => {
  handleTabRemoved(tabId)
})

browser.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await openPanelForTab(tab.id)
  }
})

browser.runtime.onMessageExternal.addListener(
  (message: unknown, sender, sendResponse: (response?: { ok: boolean }) => void) => {
    if (!isAllowedWebAppOrigin(sender.url ? new URL(sender.url).origin : sender.origin)) {
      sendResponse({ ok: false })
      return true
    }

    const typed = message as CiExternalMessage
    if (typed.type === 'CI_AUTH') {
      void authStorage
        .setTokens({
          accessToken: typed.access_token,
          refreshToken: typed.refresh_token,
        })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }))
      return true
    }

    if (typed.type === 'CI_LOGOUT') {
      void authStorage
        .clearTokens()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }))
      return true
    }

    sendResponse({ ok: false })
    return true
  }
)

browser.runtime.onMessage.addListener(
  (
    message: unknown,
    sender,
    sendResponse: (response: BackgroundResponse) => void
  ) => {
    const typedMessage = message as BackgroundMessage

    if (typedMessage.type === 'SELECTION_CAPTURED' && sender.tab?.id) {
      tabContextManager.setSelection(sender.tab.id, typedMessage.text)
      sendResponse({ type: 'OK' })
      return true
    }

    if (typedMessage.type === 'GET_PANEL_SCOPE') {
      void getPanelScope()
        .then((scope) => sendResponse({ type: 'PANEL_SCOPE', scope }))
        .catch((err: unknown) => {
          sendResponse({
            type: 'ERROR',
            message: err instanceof Error ? err.message : 'Failed to load settings',
          })
        })
      return true
    }

    if (typedMessage.type === 'SET_PANEL_SCOPE') {
      void setPanelScope(typedMessage.scope)
        .then(() => applyPanelScope(typedMessage.scope))
        .then(() => sendResponse({ type: 'OK' }))
        .catch((err: unknown) => {
          sendResponse({
            type: 'ERROR',
            message: err instanceof Error ? err.message : 'Failed to save settings',
          })
        })
      return true
    }

    if (typedMessage.type === 'GET_HANDOFF') {
      void consumeHandoff()
        .then((payload) => sendResponse({ type: 'HANDOFF', payload }))
        .catch(() => sendResponse({ type: 'HANDOFF', payload: null }))
      return true
    }

    if (typedMessage.type === 'STORE_HANDOFF') {
      void storeHandoff(typedMessage.payload)
        .then(() => sendResponse({ type: 'OK' }))
        .catch((err: unknown) => {
          sendResponse({
            type: 'ERROR',
            message: err instanceof Error ? err.message : 'Failed to store handoff',
          })
        })
      return true
    }

    if (typedMessage.type === 'BROADCAST_LOGOUT') {
      void notifyWebAppTabsLogout().then(() => sendResponse({ type: 'OK' }))
      return true
    }

    if (typedMessage.type === 'OPEN_TAB_WITHOUT_PANEL') {
      let origin: string | undefined
      try {
        origin = new URL(typedMessage.url).origin
      } catch {
        origin = undefined
      }
      if (!isAllowedWebAppOrigin(origin)) {
        sendResponse({ type: 'ERROR', message: 'Invalid web app URL' })
        return true
      }

      void openUrlWithoutSidePanel(typedMessage.url)
        .then(() => sendResponse({ type: 'OK' }))
        .catch((err: unknown) => {
          sendResponse({
            type: 'ERROR',
            message: err instanceof Error ? err.message : 'Failed to open tab',
          })
        })
      return true
    }

    tabContextManager
      .handleMessage(typedMessage as TabContextMessage)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse({
          type: 'ERROR',
          message: err instanceof Error ? err.message : 'Background error',
        })
      })
    return true
  }
)

export { tabContextManager }
