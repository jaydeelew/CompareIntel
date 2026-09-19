type RuntimeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void | Promise<unknown>

type ExtensionRuntime = {
  sendMessage: (message: unknown) => Promise<unknown> | void
  onMessage?: {
    addListener: (callback: RuntimeMessageListener) => void
  }
}

function getExtensionRuntime(): ExtensionRuntime | undefined {
  const chromeRuntime = globalThis.chrome?.runtime as ExtensionRuntime | undefined
  if (typeof chromeRuntime?.sendMessage === 'function') return chromeRuntime

  const browserRuntime = (
    globalThis as typeof globalThis & { browser?: { runtime?: ExtensionRuntime } }
  ).browser?.runtime
  if (typeof browserRuntime?.sendMessage === 'function') return browserRuntime

  return undefined
}

/**
 * Send a message to the extension service worker without throwing when the
 * content-script runtime is missing (page world, or context invalidated after reload).
 */
export function sendExtensionMessage(message: unknown): Promise<unknown> {
  try {
    const runtime = getExtensionRuntime()
    if (!runtime) return Promise.resolve(undefined)
    const result = runtime.sendMessage(message)
    if (result && typeof result.then === 'function') {
      return result.catch(() => undefined)
    }
    return Promise.resolve(result)
  } catch {
    return Promise.resolve(undefined)
  }
}

export function addExtensionMessageListener(listener: RuntimeMessageListener): void {
  try {
    getExtensionRuntime()?.onMessage?.addListener(listener)
  } catch {
    // runtime unavailable
  }
}
