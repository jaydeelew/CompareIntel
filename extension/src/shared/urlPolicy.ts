export const BLOCKED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
  'moz-extension://',
]

export const RESTRICTED_PAGE_MESSAGE =
  "CompareIntel can't read this page. Chrome blocks extensions on chrome:// pages, the Chrome Web Store, and similar restricted pages. Open a normal website and try again."

export const INVOKE_TO_READ_MESSAGE =
  'Click the CompareIntel toolbar icon on this tab to use it as page context. Chrome also blocks chrome:// pages and the Chrome Web Store.'

export function isChromeWebStoreUrl(url: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    if (hostname === 'chromewebstore.google.com') return true
    return hostname === 'chrome.google.com' && (pathname === '/webstore' || pathname.startsWith('/webstore/'))
  } catch {
    return false
  }
}

export function isBlockedUrl(url: string | undefined): boolean {
  if (!url) return true
  return BLOCKED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
}

export function isRestrictedPage(url: string | undefined): boolean {
  if (!url) return false
  return isBlockedUrl(url) || isChromeWebStoreUrl(url)
}

export function canExtractTab(url: string | undefined): boolean {
  if (!url) return false
  if (isRestrictedPage(url)) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

/** User-facing reason we cannot read a tab, or null when extraction may proceed. */
export function pageAccessMessage(url: string | undefined): string | null {
  if (!url) return INVOKE_TO_READ_MESSAGE
  if (!canExtractTab(url)) return RESTRICTED_PAGE_MESSAGE
  return null
}
