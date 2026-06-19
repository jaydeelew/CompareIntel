const SELECTION_DEBOUNCE_MS = 300
let debounceTimer: ReturnType<typeof setTimeout> | null = null

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
