import browser from 'webextension-polyfill'

import type { ExtensionHandoffPayload } from '@compareintel/core'

const HANDOFF_KEY = 'pendingHandoff'
const HANDOFF_TTL_MS = 5 * 60 * 1000

export interface HandoffTokens {
  accessToken?: string
  refreshToken?: string
}

interface StoredHandoff {
  payload: ExtensionHandoffPayload
  tokens?: HandoffTokens
  nonce: string
  storedAt: number
}

export function stripHandoffSecrets(
  payload: ExtensionHandoffPayload,
  nonce?: string,
): ExtensionHandoffPayload {
  return {
    input: payload.input,
    selectedModels: payload.selectedModels,
    results: payload.results,
    conversationHistory: payload.conversationHistory,
    conversationId: payload.conversationId,
    browserFingerprint: payload.browserFingerprint,
    handoffNonce: nonce ?? payload.handoffNonce,
  }
}

function createNonce(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function readStored(): Promise<StoredHandoff | undefined> {
  const result = await browser.storage.session.get(HANDOFF_KEY)
  return result[HANDOFF_KEY] as StoredHandoff | undefined
}

async function clearStored(): Promise<void> {
  await browser.storage.session.remove(HANDOFF_KEY)
}

export async function storeHandoff(
  payload: ExtensionHandoffPayload,
  tokens?: HandoffTokens,
): Promise<string> {
  const nonce = createNonce()
  const stored: StoredHandoff = {
    payload: stripHandoffSecrets(payload, nonce),
    tokens,
    nonce,
    storedAt: Date.now(),
  }
  await browser.storage.session.set({ [HANDOFF_KEY]: stored })
  return nonce
}

/** Public conversation state + nonce. Never includes access/refresh tokens. */
export async function consumeHandoff(): Promise<ExtensionHandoffPayload | null> {
  const stored = await readStored()
  if (!stored?.payload) return null

  if (Date.now() - stored.storedAt > HANDOFF_TTL_MS) {
    await clearStored()
    return null
  }

  return stripHandoffSecrets(stored.payload, stored.nonce)
}

/** One-time token claim for the web app via chrome.runtime.sendMessage(extensionId). */
export async function claimHandoffTokens(nonce: string): Promise<HandoffTokens | null> {
  const stored = await readStored()
  if (!stored?.nonce || stored.nonce !== nonce) return null

  await clearStored()

  if (Date.now() - stored.storedAt > HANDOFF_TTL_MS) return null
  return stored.tokens ?? null
}
