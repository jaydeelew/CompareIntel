/**
 * Extract external http(s) URLs from assistant answer text (markdown links + bare URLs).
 */

const MARKDOWN_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi
const BARE_URL = /https?:\/\/[^\s<>\]"')]+/gi

const MAX_LINK_PREVIEW_CARDS = 6

function normalizeUrl(raw: string): string | null {
  const url = raw.trim().replace(/[),.]+$/g, '')
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    const host = parsed.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      return null
    }
    return parsed.href
  } catch {
    return null
  }
}

export function extractExternalUrlsFromAnswer(
  text: string,
  max = MAX_LINK_PREVIEW_CARDS
): string[] {
  if (!text?.trim()) return []
  const seen = new Set<string>()
  const ordered: string[] = []

  const add = (candidate: string) => {
    const url = normalizeUrl(candidate)
    if (!url || seen.has(url)) return
    seen.add(url)
    ordered.push(url)
  }

  let match: RegExpExecArray | null
  MARKDOWN_LINK.lastIndex = 0
  while ((match = MARKDOWN_LINK.exec(text)) !== null) {
    add(match[2])
    if (ordered.length >= max) return ordered
  }

  BARE_URL.lastIndex = 0
  while ((match = BARE_URL.exec(text)) !== null) {
    add(match[0])
    if (ordered.length >= max) return ordered
  }

  return ordered
}

export { MAX_LINK_PREVIEW_CARDS }
