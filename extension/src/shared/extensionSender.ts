/** Content scripts (sender.tab or a non-extension origin) may send only these types. */
const CONTENT_SCRIPT_ALLOWED_TYPES = new Set([
  'GET_HANDOFF',
  'BROADCAST_LOGOUT',
  'WEB_APP_BRIDGE_READY',
])

export const CONTENT_SCRIPT_DENIED_TYPES = [
  'GET_SELECTION',
  'GET_ACTIVE_TAB',
  'SET_PINNED_TABS',
  'UNPIN_TAB',
  'CLEAR_CONTEXT_CACHE',
  'GET_PINNED_TABS',
  'SET_PANEL_SCOPE',
  'OPEN_TAB_WITHOUT_PANEL',
  'STORE_HANDOFF',
  'GET_TAB_CONTEXT',
  'LIST_TABS',
  'PIN_TAB',
] as const

export type ExtensionMessageSender = {
  tab?: { id?: number } | null
  url?: string
}

export function isContentScriptAllowedMessage(type: unknown): boolean {
  return typeof type === 'string' && CONTENT_SCRIPT_ALLOWED_TYPES.has(type)
}

/** Side panel / extension pages only. Content scripts (sender.tab + page URL) are rejected. */
export function isExtensionPageSender(sender: ExtensionMessageSender): boolean {
  try {
    const extensionOrigin = new URL(chrome.runtime.getURL('')).origin
    if (sender.url) {
      return new URL(sender.url).origin === extensionOrigin
    }
    return !sender.tab
  } catch {
    return false
  }
}

/**
 * Default deny. Extension pages may send any runtime type.
 * Content scripts (sender.tab or non-extension-page origin) may only send
 * GET_HANDOFF, BROADCAST_LOGOUT, and WEB_APP_BRIDGE_READY.
 */
export function authorizeRuntimeMessage(
  type: unknown,
  sender: ExtensionMessageSender,
): boolean {
  if (isExtensionPageSender(sender)) return true
  return isContentScriptAllowedMessage(type)
}

/** STORE_HANDOFF tokens are accepted only from extension pages. Page-supplied tokens are dropped. */
export function acceptHandoffTokensFromSender<T>(
  sender: ExtensionMessageSender,
  tokens: T | undefined,
): T | undefined {
  return isExtensionPageSender(sender) ? tokens : undefined
}
