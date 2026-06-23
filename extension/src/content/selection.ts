import { extractPageContent } from '../shared/extractPageContent'

const SELECTION_DEBOUNCE_MS = 300
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function extractSimplePageContent() {
  const selection = window.getSelection()?.toString() ?? ''
  const url = location.href
  const title = document.title
  const body = document.body?.cloneNode(true) as HTMLElement | null
  if (body) {
    body.querySelectorAll('script, style, noscript, iframe').forEach((el) => el.remove())
    return {
      url,
      title,
      text: body.innerText?.trim() ?? '',
      selection,
    }
  }
  return { url, title, text: '', selection }
}

document.addEventListener('mouseup', () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const text = window.getSelection()?.toString().trim() ?? ''
    if (text) {
      chrome.runtime.sendMessage({ type: 'SELECTION_CAPTURED', text }).catch(() => {
        // extension context may be invalidated
      })
    }
  }, SELECTION_DEBOUNCE_MS)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'EXTRACT_PAGE_CONTENT') {
    try {
      sendResponse({ type: 'PAGE_CONTENT', content: extractPageContent() })
    } catch {
      try {
        sendResponse({ type: 'PAGE_CONTENT', content: extractSimplePageContent() })
      } catch {
        sendResponse({
          type: 'PAGE_CONTENT',
          content: { url: location.href, title: document.title, text: '', selection: '' },
        })
      }
    }
    return true
  }
  return false
})
