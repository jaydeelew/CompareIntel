import type { TabContextMessage, TabContextResponse } from '@compareintel/core'
import browser from 'webextension-polyfill'

import { TabContextManager } from './tabContextManager'

const tabContextManager = new TabContextManager()

browser.runtime.onInstalled.addListener(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // sidePanel may be unavailable in some contexts during install
  })
})

browser.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await browser.sidePanel.open({ tabId: tab.id })
  }
})

browser.runtime.onMessage.addListener(
  (
    message: TabContextMessage | { type: 'SELECTION_CAPTURED'; text: string },
    sender,
    sendResponse: (r: TabContextResponse | { type: 'OK' }) => void
  ) => {
    if (message.type === 'SELECTION_CAPTURED' && sender.tab?.id) {
      tabContextManager.setSelection(sender.tab.id, message.text)
      sendResponse({ type: 'OK' })
      return true
    }

    tabContextManager
      .handleMessage(message as TabContextMessage)
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

// Expose manager for tests
export { tabContextManager }
