import type { TabContextMessage, TabContextResponse } from '@compareintel/core'
import type { PanelScope } from '../shared/extensionSettings'
import browser from 'webextension-polyfill'

import {
  applyPanelScope,
  handleNewTab,
  handleTabRemoved,
  initializeSidePanel,
  openPanelForTab,
} from './sidePanelController'
import { TabContextManager } from './tabContextManager'

const tabContextManager = new TabContextManager()

type BackgroundMessage =
  | TabContextMessage
  | { type: 'SELECTION_CAPTURED'; text: string }
  | { type: 'GET_PANEL_SCOPE' }
  | { type: 'SET_PANEL_SCOPE'; scope: PanelScope }

type BackgroundResponse =
  | TabContextResponse
  | { type: 'OK' }
  | { type: 'PANEL_SCOPE'; scope: PanelScope }
  | { type: 'ERROR'; message: string }

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
      import('../shared/extensionSettings')
        .then(({ getPanelScope }) => getPanelScope())
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
      import('../shared/extensionSettings')
        .then(({ setPanelScope }) => setPanelScope(typedMessage.scope))
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
