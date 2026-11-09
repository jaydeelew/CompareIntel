export interface HtmlSignature {
  visibleText: string
  codeSpans: string[]
  fencedCode: string[]
  headings: string[]
  tableCells: string[][]
  linkHrefs: string[]
  literalDollars: string[]
  dollarRuns: string[]
  emDashCount: number
  listItemCount: number
  listItems: string[]
  strayBackticks: string[]
  leftoverPlaceholders: string[]
  leftoverDelimiters: string[]
  katexErrors: string[]
  texSources: string[]
  displayMathCount: number
  inlineMathCount: number
  blockCodeCount: number
  strongTexts: string[]
  emTexts: string[]
  blockquoteCount: number
  listTags: string[]
}

const PLACEHOLDER_RE = /__(?:DISPLAY_MATH|INLINE_MATH|CODE_BLOCK|UL|OL|HR_PLACEHOLDER)_\d+__/g
const BLOCK_CODE_SEL = '.code-block-direct, .preformatted-text, .code-block, pre'
const CODE_CHROME_SEL = '.katex-mathml, button, .code-language-label, svg'

function visibleTextOf(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll(CODE_CHROME_SEL).forEach(n => n.remove())
  clone
    .querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div,tr,th,td,br,hr,table,ul,ol')
    .forEach(n => {
      n.insertAdjacentText('beforebegin', ' ')
      n.insertAdjacentText('afterend', ' ')
    })
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function outermostBlockCode(el: Element): Element[] {
  return Array.from(el.querySelectorAll(BLOCK_CODE_SEL)).filter(
    n => !n.parentElement?.closest(BLOCK_CODE_SEL)
  )
}

function proseClone(el: Element): Element {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll(`.katex, .katex-mathml, ${BLOCK_CODE_SEL}, code`).forEach(n => n.remove())
  return clone
}

function inBlockCode(c: Element): boolean {
  return Boolean(c.closest(BLOCK_CODE_SEL))
}

export function signatureFromElement(el: Element): HtmlSignature {
  const html = el.innerHTML
  const leftoverPlaceholders = [...new Set(html.match(PLACEHOLDER_RE) ?? [])]
  const katexErrors = Array.from(el.querySelectorAll('.katex-error')).map(n =>
    (n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
  )
  const codeSpans = Array.from(el.querySelectorAll('code'))
    .filter(c => !inBlockCode(c))
    .map(c => c.textContent ?? '')
  const fencedCode = outermostBlockCode(el).map(n => {
    const code = n.querySelector('code')
    return (code?.textContent ?? n.textContent ?? '').replace(/^\s+|\s+$/g, '')
  })
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
  ).map(n => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
  const displayMathCount = el.querySelectorAll('.katex-display').length
  const inlineMathCount = Array.from(el.querySelectorAll('.katex')).filter(
    n => !n.closest('.katex-display')
  ).length
  const listItems = Array.from(el.querySelectorAll('li')).map(li => visibleTextOf(li))
  const structureRoot = (n: Element) =>
    !n.closest('.katex, .katex-mathml, code, pre, .code-block-direct, .code-block')
  const strongTexts = Array.from(el.querySelectorAll('strong, b'))
    .filter(structureRoot)
    .map(n => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
  const emTexts = Array.from(el.querySelectorAll('em, i'))
    .filter(structureRoot)
    .map(n => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
  const listTags = Array.from(el.querySelectorAll('ul, ol'))
    .filter(structureRoot)
    .map(n => n.tagName.toLowerCase())

  const literalDollars: string[] = []
  const dollarRuns: string[] = []
  const strayBackticks: string[] = []
  let emDashCount = 0
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = (node as Text).parentElement
    if (!parent) continue
    if (parent.closest(`.katex, .katex-mathml, ${BLOCK_CODE_SEL}, code`)) continue
    const t = node.textContent || ''
    emDashCount += [...t].filter(c => c === '\u2014').length
    for (const m of t.matchAll(/\$[A-Za-z0-9.,]*/g)) literalDollars.push(m[0])
    for (const m of t.matchAll(/\$+/g)) dollarRuns.push(m[0])
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
    dollarRuns,
    emDashCount,
    listItemCount: el.querySelectorAll('li').length,
    listItems,
    strayBackticks,
    leftoverPlaceholders,
    leftoverDelimiters,
    katexErrors,
    texSources,
    displayMathCount,
    inlineMathCount,
    blockCodeCount: outermostBlockCode(el).length,
    strongTexts,
    emTexts,
    blockquoteCount: Array.from(el.querySelectorAll('blockquote')).filter(structureRoot).length,
    listTags,
  }
}

export function signatureFromHtml(html: string): HtmlSignature {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  return signatureFromElement(wrap)
}
