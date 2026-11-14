import { useEffect, type RefObject } from 'react'

import { applyClipboardPayload, serializeSelectionForClipboard } from '../utils/renderedClipboard'

/**
 * Intercept copy inside rendered model output so clipboard payloads paste cleanly elsewhere.
 */
export function useRenderedCopyHandler(
  contentRef: RefObject<HTMLElement | null>,
  markdownSource: string | undefined
): void {
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const onCopy = (event: ClipboardEvent) => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

      const range = selection.getRangeAt(0)
      const payload = serializeSelectionForClipboard(range, el, markdownSource)
      if (!payload) return

      event.preventDefault()
      applyClipboardPayload(event, payload)
    }

    el.addEventListener('copy', onCopy)
    return () => el.removeEventListener('copy', onCopy)
  }, [contentRef, markdownSource])
}
