/**
 * Extract external http(s) URLs from assistant answer text (markdown links + bare URLs).
 */

const MARKDOWN_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi
const BARE_URL = /https?:\/\/[^\s<>\]"')]+/gi

const MAX_LINK_PREVIEW_CARDS = 6

const LIST_ITEM_LINE = /^\s*([-*]|\d+\.)\s+/

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

/** URLs in a single block, markdown links first then bare URLs. */
export function extractUrlsFromBlock(text: string): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()

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
  }

  BARE_URL.lastIndex = 0
  while ((match = BARE_URL.exec(text)) !== null) {
    add(match[0])
  }

  return ordered
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

export interface AnswerContentBlock {
  text: string
  /** First-occurrence URLs in this block that should get inline previews (deduped globally). */
  previewUrls: string[]
}

/**
 * Split assistant markdown into paragraph / list-item blocks for inline link previews.
 */
export function splitAnswerIntoBlocksWithPreviewUrls(
  text: string,
  max = MAX_LINK_PREVIEW_CARDS
): AnswerContentBlock[] {
  if (!text?.trim()) return []

  const lines = text.split('\n')
  const rawBlocks: string[] = []
  let current: string[] = []

  const flush = () => {
    if (current.length === 0) return
    rawBlocks.push(current.join('\n'))
    current = []
  }

  for (const line of lines) {
    if (line.trim() === '') {
      flush()
      continue
    }
    const isListItem = LIST_ITEM_LINE.test(line)
    if (
      isListItem &&
      current.length > 0 &&
      LIST_ITEM_LINE.test(current[current.length - 1] ?? '')
    ) {
      flush()
    }
    current.push(line)
  }
  flush()

  const globalSeen = new Set<string>()
  let previewCount = 0

  return rawBlocks
    .map(blockText => {
      const previewUrls: string[] = []
      for (const candidate of extractUrlsFromBlock(blockText)) {
        const url = normalizeUrl(candidate)
        if (!url || globalSeen.has(url)) continue
        if (previewCount >= max) break
        globalSeen.add(url)
        previewUrls.push(url)
        previewCount++
      }
      return { text: blockText, previewUrls }
    })
    .filter(block => block.text.trim().length > 0)
}

export { MAX_LINK_PREVIEW_CARDS }
