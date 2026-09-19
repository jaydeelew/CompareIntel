import {
  CI_BRIDGE_SOURCE,
  CI_PAGE_MESSAGE,
  isCiPageMessage,
  type ExtensionHandoffPayload,
} from '@compareintel/core'

export { type ExtensionHandoffPayload }

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'

export async function establishSessionFromRefreshToken(refreshToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    return response.ok
  } catch {
    return false
  }
}

export function requestExtensionHandoff(): Promise<ExtensionHandoffPayload | null> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve(null)
    }, 5000)

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      if (!isCiPageMessage(event.data)) return
      if (event.data.type !== CI_PAGE_MESSAGE.HANDOFF_RESPONSE) return

      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve(event.data.payload)
    }

    window.addEventListener('message', onMessage)
    window.postMessage(
      {
        source: CI_BRIDGE_SOURCE,
        type: CI_PAGE_MESSAGE.HANDOFF_REQUEST,
      },
      window.location.origin
    )
  })
}
