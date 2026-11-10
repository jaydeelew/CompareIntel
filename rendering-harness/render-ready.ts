/**
 * Page-state predicate for the harness renderer.
 *
 * Playwright passes `harnessRenderReady` to `page.waitForFunction`, which
 * serializes the function into the browser. It must not close over Node
 * imports. Success is visible text, finished KaTeX (no hidden `.katex-html`
 * still measuring), and loaded images. It is never a sleep and never
 * `networkidle`. A reply that mentions math but never produces KaTeX is still
 * ready: the assertions, not this wait, decide pass or fail.
 */
export function harnessRenderReady(): boolean {
  const container = document.querySelector('[data-render-container]')
  if (!container) return false
  if (
    container.hasAttribute('data-render-failed') ||
    document.querySelector('[data-render-failed]')
  ) {
    return true
  }
  if (!container.hasAttribute('data-render-complete')) return false
  const text = (container.textContent || '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  if (container.querySelectorAll('.katex-html[style*="visibility: hidden"]').length > 0) {
    return false
  }
  return true
}

/**
 * True when the saved reply contains math the harness must see as KaTeX
 * before it treats the page as ready. A bare currency amount (`$5`), a fenced
 * code sample, or a mention of the delimiter itself (`$$...$$`, `\[...\]`) does not.
 */
export function contentExpectsKatex(content: string): boolean {
  const withoutFences = content.replace(/```[\s\S]*?```/g, '')
  const prose = withoutFences
    .replace(/\$\$\s*\.{2,}\s*\$\$/g, '')
    .replace(/\\\[\s*\.{2,}\s*\\\]/g, '')
    .replace(/\\\(\s*\.{2,}\s*\\\)/g, '')
    .replace(/(?<!\\)\$\s*\.{2,}\s*\$/g, '')
  const delimited = [
    /\$\$([\s\S]*?)\$\$/g,
    /\\\[([\s\S]*?)\\\]/g,
    /\\\(([\s\S]*?)\\\)/g,
  ]
  for (const pattern of delimited) {
    for (const match of prose.matchAll(pattern)) {
      const body = (match[1] ?? '').trim()
      if (!body || /^\.{2,}$/.test(body)) continue
      if (/[\\=^_{}0-9A-Za-z]/.test(body)) return true
    }
  }
  return /(?<!\\)\$(?!\d)[^$\n]*[\\=^_{}][^$\n]*\$/.test(prose)
}
