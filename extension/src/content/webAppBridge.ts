import {
  CI_BRIDGE_SOURCE,
  CI_PAGE_MESSAGE,
  isCiPageMessage,
  type CiPageMessage,
  type ExtensionHandoffPayload,
} from '@compareintel/core'

import { addExtensionMessageListener, sendExtensionMessage } from '../shared/extensionRuntime'

function postToPage(message: CiPageMessage): void {
  window.postMessage(message, window.location.origin)
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (!isCiPageMessage(event.data)) return

  const { type } = event.data

  if (type === CI_PAGE_MESSAGE.HANDOFF_REQUEST) {
    void sendExtensionMessage({ type: 'GET_HANDOFF' })
      .then((response) => {
        const handoffResponse = response as { type?: string; payload?: ExtensionHandoffPayload | null }
        postToPage({
          source: CI_BRIDGE_SOURCE,
          type: CI_PAGE_MESSAGE.HANDOFF_RESPONSE,
          payload: handoffResponse?.payload ?? null,
        })
      })
    return
  }

  if (type === CI_PAGE_MESSAGE.LOGOUT) {
    void sendExtensionMessage({ type: 'BROADCAST_LOGOUT' })
  }
})

addExtensionMessageListener((message: unknown) => {
  if (!message || typeof message !== 'object') return
  const typed = message as { type?: string }
  if (typed.type === 'CI_EXTENSION_LOGOUT') {
    postToPage({
      source: CI_BRIDGE_SOURCE,
      type: CI_PAGE_MESSAGE.EXTENSION_LOGOUT,
    })
  }
})

void sendExtensionMessage({ type: 'WEB_APP_BRIDGE_READY' })

export {}
