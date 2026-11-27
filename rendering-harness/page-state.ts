/**
 * Predicate passed to Playwright's page.waitForFunction.
 * It is serialized into the page, so it must not close over Node state.
 * Ready means the harness container has real text, KaTeX is done measuring,
 * images are settled (the harness forces eager loading before waiting),
 * document.fonts has finished, and every mermaid fence has either its SVG
 * or a parse-error code block. It is not a sleep and not networkidle.
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
  // Inlined: Playwright serializes this function alone, so it cannot call a helper.
  if (container.querySelector('[data-mermaid-pending]')) return false
  const diagrams = container.querySelectorAll('.mermaid-diagram')
  for (const diagram of diagrams) {
    if (diagram.hasAttribute('data-mermaid-fallback')) continue
    if (!diagram.querySelector('svg')) return false
  }
  return container.hasAttribute('data-render-complete')
}
