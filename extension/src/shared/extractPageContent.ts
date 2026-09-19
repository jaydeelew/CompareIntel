export interface ExtractedPageContent {
  url: string
  title: string
  text: string
  selection: string
}

/** Keep in sync with DEFAULT_TAB_CONTEXT_SETTINGS.maxCharsPerTab */
export const MAX_PAGE_TEXT_CHARS = 50_000
export const MAX_SELECTION_CHARS = 2_000

/**
 * Extract visible page text without cloning the live document.
 *
 * `document.cloneNode(true)` / `body.cloneNode(true)` duplicates the renderer
 * tree (including decoded images, canvases, and media) and can spike tab
 * memory to multiple GB on heavy pages. This walker copies text only and
 * stops once the char cap is reached.
 *
 * Must stay self-contained: chrome.scripting.executeScript serializes only
 * this function body, not module imports.
 */
export function extractPageContent(): ExtractedPageContent {
  const maxPageChars = 50_000
  const maxSelectionChars = 2_000
  const skipSelector =
    'script, style, noscript, iframe, object, embed, svg, canvas, video, audio, picture, source, template'

  const selection = (window.getSelection()?.toString() ?? '').slice(0, maxSelectionChars)
  const url = location.href
  const title = document.title

  const isSkippedElement = (el: Element | null): boolean => {
    if (!el) return true
    switch (el.tagName) {
      case 'SCRIPT':
      case 'STYLE':
      case 'NOSCRIPT':
      case 'IFRAME':
      case 'OBJECT':
      case 'EMBED':
      case 'SVG':
      case 'CANVAS':
      case 'VIDEO':
      case 'AUDIO':
      case 'PICTURE':
      case 'SOURCE':
      case 'TEMPLATE':
      case 'LINK':
        return true
      default:
        break
    }
    if (el.getAttribute('aria-hidden') === 'true') return true
    if (el instanceof HTMLElement && el.hidden) return true
    return false
  }

  const collectText = (root: Element | null, maxChars: number): string => {
    if (!root || maxChars <= 0) return ''
    const parts: string[] = []
    let size = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement
        if (!parent || isSkippedElement(parent)) return NodeFilter.FILTER_REJECT
        if (parent.closest(skipSelector)) return NodeFilter.FILTER_REJECT
        const value = node.nodeValue
        if (!value || !value.trim()) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })

    let current: Node | null
    while (size < maxChars && (current = walker.nextNode())) {
      const piece = (current.nodeValue ?? '').replace(/\s+/g, ' ').trim()
      if (!piece) continue
      if (parts.length > 0) {
        parts.push(' ')
        size += 1
        if (size >= maxChars) break
      }
      if (size + piece.length > maxChars) {
        parts.push(piece.slice(0, maxChars - size))
        break
      }
      parts.push(piece)
      size += piece.length
    }
    return parts.join('')
  }

  const article =
    document.querySelector('article') ??
    document.querySelector('[role="main"]') ??
    document.querySelector('main')
  let text = collectText(article, maxPageChars)
  if (text.length < 80) {
    text = collectText(document.body ?? document.documentElement, maxPageChars)
  }

  return { url, title, text, selection }
}
