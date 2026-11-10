/**
 * Predicate passed to Playwright's page.waitForFunction.
 * It is serialized into the page, so it must not close over Node state.
 * Ready means the harness container has real text, KaTeX is done measuring,
 * and document.fonts has finished. It is not a sleep and not networkidle.
 */
export function pageStateReady(expectedGeneration?: string): boolean {
  const container = document.querySelector('[data-render-container]')
  if (!container) return false
  if (
    container.hasAttribute('data-render-failed') ||
    document.querySelector('[data-render-failed]')
  ) {
    return true
  }
  if (expectedGeneration && container.getAttribute('data-render-generation') !== expectedGeneration) {
    return false
  }
  const text = (container.textContent || '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  if (document.fonts && document.fonts.status !== 'loaded') return false
  if (container.querySelectorAll('.katex-html[style*="visibility: hidden"]').length > 0) return false
  return container.hasAttribute('data-render-complete')
}
