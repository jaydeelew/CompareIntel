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
  tabId?: number
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
  return crypto.randomUUID()
}

async function readStored(): Promise<StoredHandoff | undefined> {
  const result = await browser.storage.session.get(HANDOFF_KEY)
  return result[HANDOFF_KEY] as StoredHandoff | undefined
}

async function clearStored(): Promise<void> {
  await browser.storage.session.remove(HANDOFF_KEY)
}

function isExpired(stored: StoredHandoff): boolean {
  return Date.now() - stored.storedAt > HANDOFF_TTL_MS
}

function tabMatches(stored: StoredHandoff, tabId: number | undefined): boolean {
  return stored.tabId != null && tabId != null && stored.tabId === tabId
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

/** Bind a pending handoff to the tab opened for ?handoff=1. No-op if already bound. */
export async function bindHandoffTab(tabId: number): Promise<void> {
  const stored = await readStored()
  if (!stored || isExpired(stored)) {
    if (stored) await clearStored()
    return
  }
  if (stored.tabId != null) return
  await browser.storage.session.set({
    [HANDOFF_KEY]: { ...stored, tabId },
  })
}

/** Public conversation state + nonce. Never includes access/refresh tokens. */
export async function consumeHandoff(tabId?: number): Promise<ExtensionHandoffPayload | null> {
  const stored = await readStored()
  if (!stored?.payload) return null

  if (isExpired(stored)) {
    await clearStored()
    return null
  }

  if (!tabMatches(stored, tabId)) return null
  return stripHandoffSecrets(stored.payload, stored.nonce)
}

/** One-time token claim for the web app via chrome.runtime.sendMessage(extensionId). */
export async function claimHandoffTokens(
  nonce: string,
  tabId?: number,
): Promise<HandoffTokens | null> {
  const stored = await readStored()
  if (!stored?.nonce || stored.nonce !== nonce) return null
  if (!tabMatches(stored, tabId)) return null

  await clearStored()

  if (isExpired(stored)) return null
  return stored.tokens ?? null
}
