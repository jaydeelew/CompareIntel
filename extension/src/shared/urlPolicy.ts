export const BLOCKED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
]

export function isBlockedUrl(url: string | undefined): boolean {
  if (!url) return true
  return BLOCKED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
}

export function canExtractTab(url: string | undefined): boolean {
  if (isBlockedUrl(url)) return false
  return url.startsWith('http://') || url.startsWith('https://')
}
