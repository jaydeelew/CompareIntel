import type { TabContextMessage, TabContextResponse } from '@compareintel/core'
import { getPanelScope, setPanelScope, type PanelScope } from '../shared/extensionSettings'
import browser from 'webextension-polyfill'

import { authStorage, lockRefreshTokenToTrustedContexts } from '../shared/authStorage'
import {
  parseCiAuthTokens,
  parseCiClaimHandoffNonce,
  senderWebOrigin,
} from '../shared/externalAuth'
import { authorizeTabContextMessage } from '../shared/extensionSender'
import { claimHandoffTokens, consumeHandoff, storeHandoff } from '../shared/handoff'
import type { CiExternalMessage } from '../shared/messages'
import { isAllowedWebAppOrigin } from '../shared/webAppOrigins'
import {
  applyPanelScope,
  handleNewTab,
  handleTabActivated,
  handleTabRemoved,
  initializeSidePanel,
  openPanelForTab,
  openUrlWithoutSidePanel,
} from './sidePanelController'
import { TabContextManager } from './tabContextManager'

const tabContextManager = new TabContextManager()

type BackgroundMessage =
  | TabContextMessage
  | { type: 'GET_PANEL_SCOPE' }
  | { type: 'SET_PANEL_SCOPE'; scope: PanelScope }
  | { type: 'GET_HANDOFF' }
  | { type: 'STORE_HANDOFF'; payload: Parameters<typeof storeHandoff>[0]; tokens?: Parameters<typeof storeHandoff>[1] }
  | { type: 'BROADCAST_LOGOUT' }
  | { type: 'WEB_APP_BRIDGE_READY' }
  | { type: 'OPEN_TAB_WITHOUT_PANEL'; url: string; windowId?: number }

type BackgroundResponse =
  | TabContextResponse
  | { type: 'OK' }
  | { type: 'PANEL_SCOPE'; scope: PanelScope }
  | { type: 'ERROR'; message: string }
  | { type: 'HANDOFF'; payload: Awaited<ReturnType<typeof consumeHandoff>> }
  | { type: 'HANDOFF_TOKENS'; tokens: Awaited<ReturnType<typeof claimHandoffTokens>> }

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
  void lockRefreshTokenToTrustedContexts()
  void initializeSidePanel()
})

browser.runtime.onStartup.addListener(() => {
  void lockRefreshTokenToTrustedContexts()
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

browser.tabs.onActivated.addListener((activeInfo) => {
  void handleTabActivated(activeInfo.tabId, activeInfo.windowId)
})

browser.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    tabContextManager.rememberInvokedTab(tab)
    await openPanelForTab(tab.id)
  }
})

browser.runtime.onMessageExternal.addListener(
  (
    message: unknown,
    sender,
    sendResponse: (response?: { ok: boolean; tokens?: { accessToken?: string; refreshToken?: string } | null }) => void,
  ) => {
    const origin = senderWebOrigin(sender)
    if (!isAllowedWebAppOrigin(origin)) {
      sendResponse({ ok: false })
      return true
    }

    const typed = message as CiExternalMessage
    const authTokens = parseCiAuthTokens(message)
    if (authTokens) {
      void authStorage
        .setTokens(authTokens)
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

    const nonce = parseCiClaimHandoffNonce(message)
    if (nonce) {
      void claimHandoffTokens(nonce)
        .then((tokens) => sendResponse({ ok: Boolean(tokens), tokens }))
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

    if (!authorizeTabContextMessage(typedMessage.type, sender)) {
      sendResponse({ type: 'ERROR', message: 'Unauthorized' })
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
      void storeHandoff(typedMessage.payload, typedMessage.tokens)
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

      void openUrlWithoutSidePanel(typedMessage.url, typedMessage.windowId)
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
