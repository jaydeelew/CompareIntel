const SENSITIVE_TAB_MESSAGE_TYPES = new Set(['GET_TAB_CONTEXT', 'LIST_TABS', 'PIN_TAB'])

export type ExtensionMessageSender = {
  tab?: { id?: number } | null
  url?: string
}

export function isSensitiveTabContextMessage(type: unknown): boolean {
  return typeof type === 'string' && SENSITIVE_TAB_MESSAGE_TYPES.has(type)
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

export function authorizeTabContextMessage(
  type: unknown,
  sender: ExtensionMessageSender,
): boolean {
  if (!isSensitiveTabContextMessage(type)) return true
  return isExtensionPageSender(sender)
}
