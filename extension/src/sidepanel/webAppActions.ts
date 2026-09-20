import browser from 'webextension-polyfill'

import type { ExtensionHandoffPayload } from '../shared/messages'
import { extensionLogout, getAuthTokens, getWebAppUrl } from './api'
import type { ExtensionShellPersistedState } from './types/shellState'

function buildWebAppLoginUrl(): string {
  const url = new URL(getWebAppUrl())
  url.searchParams.set('auth', 'login')
  url.searchParams.set('source', 'extension')
  return url.toString()
}

function buildWebAppHandoffUrl(): string {
  const url = new URL(getWebAppUrl())
  url.searchParams.set('handoff', '1')
  return url.toString()
}

async function openWebAppTab(url: string): Promise<void> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: 'OPEN_TAB_WITHOUT_PANEL',
      url,
    })) as { type?: string } | undefined
    if (response?.type === 'OK') return
  } catch {
    // Fall back to a normal tab open if the background helper is unavailable.
  }
  await browser.tabs.create({ url })
}

export async function openWebAppLogin(): Promise<void> {
  await openWebAppTab(buildWebAppLoginUrl())
}

export async function openWebAppWithHandoff(
  shellState: ExtensionShellPersistedState | undefined,
  browserFingerprint?: string
): Promise<void> {
  const tokens = await getAuthTokens()
  const payload: ExtensionHandoffPayload = {
    input: shellState?.input ?? '',
    selectedModels: shellState?.selectedModels ?? [],
    results: shellState?.results ?? [],
    conversationHistory: shellState?.conversationHistory ?? [],
    conversationId: shellState?.conversationId ?? null,
    browserFingerprint,
    accessToken: tokens.accessToken ?? undefined,
    refreshToken: tokens.refreshToken ?? undefined,
  }

  await browser.runtime.sendMessage({ type: 'STORE_HANDOFF', payload })
  await openWebAppTab(buildWebAppHandoffUrl())
}

export async function signOutFromExtension(): Promise<void> {
  await extensionLogout()
  await browser.runtime.sendMessage({ type: 'BROADCAST_LOGOUT' }).catch(() => undefined)
}
