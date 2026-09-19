import browser from 'webextension-polyfill'

import type { ExtensionHandoffPayload } from '@compareintel/core'

const HANDOFF_KEY = 'pendingHandoff'
const HANDOFF_TTL_MS = 5 * 60 * 1000

interface StoredHandoff {
  payload: ExtensionHandoffPayload
  storedAt: number
}

export async function storeHandoff(payload: ExtensionHandoffPayload): Promise<void> {
  const stored: StoredHandoff = { payload, storedAt: Date.now() }
  await browser.storage.session.set({ [HANDOFF_KEY]: stored })
}

export async function consumeHandoff(): Promise<ExtensionHandoffPayload | null> {
  const result = await browser.storage.session.get(HANDOFF_KEY)
  const stored = result[HANDOFF_KEY] as StoredHandoff | undefined
  if (!stored?.payload) return null

  await browser.storage.session.remove(HANDOFF_KEY)

  if (Date.now() - stored.storedAt > HANDOFF_TTL_MS) {
    return null
  }

  return stored.payload
}
