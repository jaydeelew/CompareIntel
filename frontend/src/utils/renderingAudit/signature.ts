export interface HtmlSignature {
  visibleText: string
  codeSpans: string[]
  fencedCode: string[]
  headings: string[]
  tableCells: string[][]
  linkHrefs: string[]
  literalDollars: string[]
  strayBackticks: string[]
  leftoverPlaceholders: string[]
  leftoverDelimiters: string[]
  katexErrors: string[]
  texSources: string[]
  displayMathCount: number
  inlineMathCount: number
}

const PLACEHOLDER_RE = /__(?:DISPLAY_MATH|INLINE_MATH|CODE_BLOCK|UL|OL|HR_PLACEHOLDER)_\d+__/g

function visibleTextOf(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml').forEach(n => n.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function proseClone(el: Element): Element {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex, .katex-mathml, pre, code').forEach(n => n.remove())
  return clone
}

export function signatureFromElement(el: Element): HtmlSignature {
  const html = el.innerHTML
  const leftoverPlaceholders = [...new Set(html.match(PLACEHOLDER_RE) ?? [])]
  const katexErrors = Array.from(el.querySelectorAll('.katex-error')).map(n =>
    (n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
  )
  const codeSpans = Array.from(el.querySelectorAll('code'))
    .filter(c => !c.closest('pre'))
    .map(c => c.textContent ?? '')
  const fencedCode = Array.from(el.querySelectorAll('pre code')).map(c => c.textContent ?? '')
  const headings = Array.from(el.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(
    h => `${h.tagName.toLowerCase()}:${(h.textContent ?? '').trim()}`
  )
  const tableCells = Array.from(el.querySelectorAll('table')).map(table =>
    Array.from(table.querySelectorAll('th,td')).map(c =>
      (c.textContent ?? '').replace(/\s+/g, ' ').trim()
    )
  )
  const linkHrefs = Array.from(el.querySelectorAll('a[href]')).map(
    a => a.getAttribute('href') || ''
  )
  const texSources = Array.from(
    el.querySelectorAll('annotation[encoding="application/x-tex"]')
  ).map(n => n.textContent ?? '')
  const displayMathCount = el.querySelectorAll('.katex-display').length
  const inlineMathCount = el.querySelectorAll('.katex:not(.katex-display)').length

  const literalDollars: string[] = []
  const strayBackticks: string[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = (node as Text).parentElement
    if (!parent) continue
    if (parent.closest('.katex, .katex-mathml, pre, code')) continue
    const t = node.textContent || ''
    for (const m of t.matchAll(/\$[A-Za-z0-9.,]*/g)) literalDollars.push(m[0])
    for (const m of t.matchAll(/`+/g)) strayBackticks.push(m[0])
  }
  const prose = visibleTextOf(proseClone(el))
  const leftoverDelimiters: string[] = []
  if (/\\begin\{/.test(prose)) leftoverDelimiters.push('\\begin{')
  if (/\\\[/.test(prose)) leftoverDelimiters.push('\\[')
  if (/\\\]/.test(prose)) leftoverDelimiters.push('\\]')
  if (/\\\(/.test(prose)) leftoverDelimiters.push('\\(')
  if (/\\frac/.test(prose)) leftoverDelimiters.push('\\frac')
  if (prose.includes('__')) leftoverDelimiters.push('__')

  return {
    visibleText: visibleTextOf(el),
    codeSpans,
    fencedCode,
    headings,
    tableCells,
    linkHrefs,
    literalDollars,
    strayBackticks,
    leftoverPlaceholders,
    leftoverDelimiters,
    katexErrors,
    texSources,
    displayMathCount,
    inlineMathCount,
  }
}

export function signatureFromHtml(html: string): HtmlSignature {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  return signatureFromElement(wrap)
}
