type TabListenerCleanup = () => void

function debounce(fn: () => void, ms: number): (() => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const wrapped = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn()
    }, ms)
  }
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  return wrapped
}

function isUsefulTabUpdate(changeInfo: chrome.tabs.TabChangeInfo): boolean {
  return Boolean(
    changeInfo.status === 'complete' ||
      changeInfo.url ||
      changeInfo.title ||
      changeInfo.favIconUrl
  )
}

/**
 * Subscribe to Chrome tab/window changes instead of polling.
 * Returns an unsubscribe function.
 */
export function subscribeToTabChanges(
  onChange: () => void,
  debounceMs = 150
): TabListenerCleanup {
  const tabsApi = globalThis.chrome?.tabs
  const windowsApi = globalThis.chrome?.windows
  if (!tabsApi?.onActivated) {
    return () => undefined
  }

  const run = debounce(onChange, debounceMs)
  const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
    if (isUsefulTabUpdate(changeInfo)) run()
  }

  tabsApi.onActivated.addListener(run)
  tabsApi.onUpdated.addListener(onUpdated)
  tabsApi.onRemoved.addListener(run)
  tabsApi.onCreated.addListener(run)
  windowsApi?.onFocusChanged?.addListener(run)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', run)
  }

  return () => {
    run.cancel()
    tabsApi.onActivated.removeListener(run)
    tabsApi.onUpdated.removeListener(onUpdated)
    tabsApi.onRemoved.removeListener(run)
    tabsApi.onCreated.removeListener(run)
    windowsApi?.onFocusChanged?.removeListener(run)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', run)
    }
  }
}
