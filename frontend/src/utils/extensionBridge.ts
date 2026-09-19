type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    responseCallback?: (response: unknown) => void
  ) => void
  lastError?: { message?: string }
}

function getExtensionId(): string | null {
  const id = import.meta.env.VITE_EXTENSION_ID
  return id && id.trim() ? id.trim() : null
}

function getChromeRuntime(): ChromeRuntime | null {
  if (typeof window === 'undefined') return null
  const runtime = (window as Window & { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime
  if (!runtime?.sendMessage || !getExtensionId()) return null
  return runtime
}

export function syncAuthToExtension(tokens: {
  accessToken: string
  refreshToken: string
}): void {
  const runtime = getChromeRuntime()
  const extensionId = getExtensionId()
  if (!runtime || !extensionId) return

  runtime.sendMessage(extensionId, {
    type: 'CI_AUTH',
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  })
}

export function syncLogoutToExtension(): void {
  const runtime = getChromeRuntime()
  const extensionId = getExtensionId()
  if (!runtime || !extensionId) return

  runtime.sendMessage(extensionId, { type: 'CI_LOGOUT' })
}

export function isExtensionSourceLogin(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('source') === 'extension'
}

export function clearExtensionSourceParam(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('source')) return
  url.searchParams.delete('source')
  window.history.replaceState({}, '', url.toString())
}

export function shouldOpenExtensionLogin(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('auth') === 'login'
}

export function clearExtensionLoginParam(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('auth')) return
  url.searchParams.delete('auth')
  window.history.replaceState({}, '', url.toString())
}

export function shouldRequestExtensionHandoff(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('handoff') === '1'
}

export function clearExtensionHandoffParam(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('handoff')) return
  url.searchParams.delete('handoff')
  window.history.replaceState({}, '', url.toString())
}
