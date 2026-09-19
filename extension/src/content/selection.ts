import { extractPageContent, MAX_SELECTION_CHARS } from '../shared/extractPageContent'
import { addExtensionMessageListener, sendExtensionMessage } from '../shared/extensionRuntime'

declare global {
  interface Window {
    __compareIntelContentScript?: boolean
  }
}

const SELECTION_DEBOUNCE_MS = 300

if (!window.__compareIntelContentScript) {
  window.__compareIntelContentScript = true

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  document.addEventListener('mouseup', () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const text = (window.getSelection()?.toString() ?? '').trim().slice(0, MAX_SELECTION_CHARS)
      if (text) {
        void sendExtensionMessage({ type: 'SELECTION_CAPTURED', text })
      }
    }, SELECTION_DEBOUNCE_MS)
  })

  addExtensionMessageListener((message, _sender, sendResponse) => {
    if (message && typeof message === 'object' && (message as { type?: string }).type === 'EXTRACT_PAGE_CONTENT') {
      try {
        sendResponse({ type: 'PAGE_CONTENT', content: extractPageContent() })
      } catch {
        sendResponse({
          type: 'PAGE_CONTENT',
          content: {
            url: location.href,
            title: document.title,
            text: '',
            selection: (window.getSelection()?.toString() ?? '').slice(0, MAX_SELECTION_CHARS),
          },
        })
      }
      return true
    }
    return false
  })
}
