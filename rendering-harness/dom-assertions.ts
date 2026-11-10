/**
 * DOM assertion validation for rendered responses.
 * Distinguishes renderer loss (source had the feature, DOM does not) from
 * not-covered (the model never wrote the feature).
 */

import { JSDOM } from 'jsdom'
import {
  autolinkUrlsIn,
  bareUrlsIn,
  detectSourceFeatures,
  explicitMathEnvsOutsideCode,
  longUnbrokenTokens,
  preservedPhrases,
  type SourceFeatures,
} from './source-features.js'

export type AssertionStatus = 'pass' | 'fail' | 'not-covered' | 'source-issue'

export interface AssertionResult {
  pass: boolean
  status: AssertionStatus
  expected: string
  actual: string
  message: string
}

export interface ValidationResult {
  /** False only on renderer loss, KaTeX errors, or unsafe links. */
  pass: boolean
  status: AssertionStatus
  assertions: AssertionResult[]
  coverage: {
    hasDisplayMath: boolean
    hasInlineMath: boolean
    hasCodeBlocks: boolean
    hasTables: boolean
    hasLinks: boolean
    hasNestedLists: boolean
    mathErrors: string[]
    preservedCurrency: boolean
    preservedCodeDollars: boolean
    linkDestinations: string[]
    tableCellCount: number
    codeBlockLanguages: string[]
    hasUnsafeLinks: boolean
  }
}

export interface ExpectedFeatures {
  displayMath?: boolean
  inlineMath?: boolean
  codeBlocks?: boolean
  tables?: boolean
  links?: boolean
  nestedLists?: boolean
  currency?: boolean
  noKatexErrors?: boolean
  safeLinksOnly?: boolean
  footnotes?: boolean
  taskLists?: boolean
  strikethrough?: boolean
  autolinks?: boolean
  bareUrls?: boolean
  breakHtml?: boolean
  supHtml?: boolean
  detailsHtml?: boolean
  nestedBlockquote?: boolean
  tableAlignment?: boolean
  tablePipes?: boolean
  tableInlineMath?: boolean
  mermaid?: boolean
  chemistry?: boolean
  cases?: boolean
  aligned?: boolean
  boxed?: boolean
  textUnicode?: boolean
  emoji?: boolean
  rtl?: boolean
  cjk?: boolean
  longUnbroken?: boolean
  wideTable?: boolean
  longCodeLine?: boolean
  currencyBesideMath?: boolean
}

function visibleMathText(container: Element): string {
  const clone = container.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml, pre, code, annotation').forEach(node => node.remove())
  return clone.textContent || ''
}

/** Visible leftover `\begin{env}` after stripping MathML, annotations, and code. */
function visibleUnrenderedMathEnvs(container: Element, envNames: string[]): string[] {
  const unique = [...new Set(envNames)]
  if (unique.length === 0) return []
  const text = visibleMathText(container)
  return unique.filter(name => text.includes(`\\begin{${name}}`))
}

/** Visible leftover `\[` (e.g. `\\[6pt]` collapsed to a fake display open). */
function visibleLeftoverDisplayBrackets(container: Element): boolean {
  // Parenthesized empty `(\[ \])` and ellipsis `\[...\]` are delimiter
  // documentation (Grok 4.3 06, Phi-4 05), not unrendered display math.
  const text = visibleMathText(container)
    .replace(/\(\\\[\s*\\\]\)/g, '')
    .replace(/\\\[\s*(?:\.{2,}|…)\s*\\\]/g, '')
  return text.includes('\\[')
}

function hrefsOf(container: Element): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map(anchor => {
    const raw = anchor.getAttribute('href') || ''
    const prop = (anchor as HTMLAnchorElement).href || ''
    return `${raw} ${prop}`
  })
}

function hasUrlAnchor(container: Element, url: string): boolean {
  return hrefsOf(container).some(href => href.includes(url))
}

function katexTex(container: Element): string {
  return Array.from(container.querySelectorAll('.katex annotation, annotation'))
    .map(node => node.textContent || '')
    .join('\n')
}

function katexErrorText(container: Element): string {
  return Array.from(container.querySelectorAll('.katex-error'))
    .map(node => node.textContent || '')
    .join('\n')
}

/** A command rendered by KaTeX, not left as an error or as raw source. */
function renderedTexCommand(container: Element, needle: string): boolean {
  const tex = katexTex(container)
  const errors = katexErrorText(container)
  return tex.includes(needle) && !errors.includes(needle)
}

function visibleTextOutsideKatex(container: Element): string {
  const clone = container.cloneNode(true) as Element
  clone.querySelectorAll('.katex, script, style').forEach(node => node.remove())
  return clone.textContent || ''
}

function maxTableColumns(container: Element): number {
  let max = 0
  container.querySelectorAll('tr').forEach(row => {
    max = Math.max(max, row.querySelectorAll('th, td').length)
  })
  return max
}

function codeHasLongLine(container: Element): boolean {
  const blocks = container.querySelectorAll('pre, code, .preformatted-text, .code-block-direct')
  for (const block of Array.from(blocks)) {
    const lines = (block.textContent || '').split('\n')
    if (lines.some(line => line.length >= 120)) return true
  }
  return false
}

function blockHasCurrencyAndMath(container: Element): boolean {
  const blocks = container.querySelectorAll('p, li, td, th, blockquote, div')
  for (const block of Array.from(blocks)) {
    if (!block.querySelector('.katex')) continue
    if (/\$\d/.test(visibleTextOutsideKatex(block))) return true
  }
  return false
}

function presentAssertion(
  expected: boolean | undefined,
  sourceHas: boolean | undefined,
  domHas: boolean,
  labels: { feature: string; expectedYes: string; expectedNo: string; actualYes: string; actualNo: string }
): AssertionResult | null {
  if (expected === undefined) return null
  if (expected === false) {
    const ok = !domHas
    return {
      pass: ok,
      status: ok ? 'pass' : 'fail',
      expected: labels.expectedNo,
      actual: domHas ? labels.actualYes : labels.actualNo,
      message: ok
        ? `${labels.feature} assertion passed`
        : `Did not expect ${labels.feature} but found it`,
    }
  }
  if (sourceHas === false) {
    return {
      pass: true,
      status: 'not-covered',
      expected: labels.expectedYes,
      actual: 'not present in source markdown',
      message: `Source reply does not contain ${labels.feature} (not-covered, not a renderer failure)`,
    }
  }
  const ok = domHas
  return {
    pass: ok,
    status: ok ? 'pass' : 'fail',
    expected: labels.expectedYes,
    actual: domHas ? labels.actualYes : labels.actualNo,
    message: ok
      ? `${labels.feature} assertion passed`
      : `Source included ${labels.feature} but rendered DOM lost it`,
  }
}

/**
 * Validate rendered HTML against expected features.
 * Pass `sourceMarkdown` (the model reply) to classify missing features as
 * not-covered instead of fail. Synthetic HTML tests omit it.
 */
export function validateRenderedHTML(
  html: string,
  expectedFeatures: ExpectedFeatures,
  sourceMarkdown?: string
): ValidationResult {
  const dom = new JSDOM(html)
  const container = dom.window.document.body
  const source = sourceMarkdown ? detectSourceFeatures(sourceMarkdown) : undefined
  const assertions: AssertionResult[] = []

  const displayMath = container.querySelectorAll('.katex-display')
  const hasDisplayMath = displayMath.length > 0
  const display = presentAssertion(expectedFeatures.displayMath, source?.hasDisplayMath, hasDisplayMath, {
    feature: 'display math',
    expectedYes: 'display math present',
    expectedNo: 'no display math',
    actualYes: `${displayMath.length} display math blocks`,
    actualNo: 'no display math',
  })
  if (display) assertions.push(display)

  const inlineMath = container.querySelectorAll('.katex:not(.katex-display)')
  const hasInlineMath = inlineMath.length > 0
  const inline = presentAssertion(expectedFeatures.inlineMath, source?.hasInlineMath, hasInlineMath, {
    feature: 'inline math',
    expectedYes: 'inline math present',
    expectedNo: 'no inline math',
    actualYes: `${inlineMath.length} inline math expressions`,
    actualNo: 'no inline math',
  })
  if (inline) assertions.push(inline)

  const codeBlocks = container.querySelectorAll('pre code')
  const hasCodeBlocks = codeBlocks.length > 0
  const codeBlockLanguages = Array.from(codeBlocks)
    .map(block => {
      const classes = Array.from(block.classList)
      const langClass = classes.find(c => c.startsWith('language-'))
      return langClass ? langClass.replace('language-', '') : 'plain'
    })
    .filter((v, i, a) => a.indexOf(v) === i)

  const code = presentAssertion(expectedFeatures.codeBlocks, source?.hasCodeBlocks, hasCodeBlocks, {
    feature: 'code blocks',
    expectedYes: 'code blocks present',
    expectedNo: 'no code blocks',
    actualYes: `${codeBlocks.length} code blocks (${codeBlockLanguages.join(', ')})`,
    actualNo: 'no code blocks',
  })
  if (code) assertions.push(code)

  const tables = container.querySelectorAll('table')
  const hasTables = tables.length > 0
  const tableCellCount = container.querySelectorAll('td, th').length
  const table = presentAssertion(expectedFeatures.tables, source?.hasTables, hasTables, {
    feature: 'tables',
    expectedYes: 'tables present',
    expectedNo: 'no tables',
    actualYes: `${tables.length} tables (${tableCellCount} cells)`,
    actualNo: 'no tables',
  })
  if (table) assertions.push(table)

  const links = container.querySelectorAll('a[href]')
  const hasLinks = links.length > 0
  const linkDestinations = Array.from(links)
    .map(a => (a as HTMLAnchorElement).href)
    .slice(0, 10)
  const unsafeLinks = linkDestinations.filter(href => href.startsWith('javascript:'))
  const hasUnsafeLinks = unsafeLinks.length > 0

  const link = presentAssertion(expectedFeatures.links, source?.hasLinks, hasLinks, {
    feature: 'links',
    expectedYes: 'links present',
    expectedNo: 'no links',
    actualYes: `${links.length} links`,
    actualNo: 'no links',
  })
  if (link) assertions.push(link)

  if (expectedFeatures.safeLinksOnly) {
    assertions.push({
      pass: !hasUnsafeLinks,
      status: hasUnsafeLinks ? 'fail' : 'pass',
      expected: 'all links safe (no javascript:)',
      actual: hasUnsafeLinks ? `${unsafeLinks.length} unsafe links: ${unsafeLinks.join(', ')}` : 'all links safe',
      message: hasUnsafeLinks
        ? `Found unsafe javascript: links: ${unsafeLinks.join(', ')}`
        : 'All links are safe',
    })
  }

  const nestedLists = container.querySelectorAll('ul ul ul, ol ol ol, ul ol ul, ol ul ol')
  const hasNestedLists = nestedLists.length > 0
  const nested = presentAssertion(
    expectedFeatures.nestedLists,
    source?.hasNestedLists,
    hasNestedLists,
    {
      feature: '3+ level nested lists',
      expectedYes: '3+ level nested lists',
      expectedNo: 'no nested lists',
      actualYes: `${nestedLists.length} nested list structures`,
      actualNo: 'no nested lists',
    }
  )
  if (nested) assertions.push(nested)

  const allText = container.textContent || ''
  const preservedCurrency = /\$\d+/.test(allText)
  const currency = presentAssertion(
    expectedFeatures.currency,
    source?.hasCurrency,
    preservedCurrency,
    {
      feature: 'preserved currency',
      expectedYes: 'preserved currency ($N)',
      expectedNo: 'no currency',
      actualYes: 'found $N patterns',
      actualNo: 'no currency found',
    }
  )
  if (currency) assertions.push(currency)

  const mathErrors = container.querySelectorAll('.katex-error')
  const hasMathErrors = mathErrors.length > 0
  if (expectedFeatures.noKatexErrors) {
    assertions.push({
      pass: !hasMathErrors,
      status: hasMathErrors ? 'fail' : 'pass',
      expected: 'no KaTeX errors',
      actual: hasMathErrors ? `${mathErrors.length} KaTeX errors` : 'no errors',
      message: hasMathErrors
        ? `Found ${mathErrors.length} KaTeX rendering errors`
        : 'No KaTeX errors',
    })
  }

  const preservedCodeDollars = Array.from(codeBlocks).some(block =>
    block.textContent?.includes('$')
  )

  // Always-on: leftover visible `\begin{env}` is a user-visible defect even when
  // the prompt's requiredFeatures dropped displayMath (GPT-5 05 cases).
  if (sourceMarkdown) {
    const envs = explicitMathEnvsOutsideCode(sourceMarkdown)
    const leftover = visibleUnrenderedMathEnvs(container, envs.matched)
    if (envs.matched.length > 0) {
      if (leftover.length > 0) {
        assertions.push({
          pass: false,
          status: 'fail',
          expected: 'explicit math environments rendered as KaTeX',
          actual: `visible raw \\begin{${leftover.join(',')}}`,
          message: `Source included explicit math environment but rendered DOM lost it: ${leftover.join(', ')}`,
        })
      } else {
        assertions.push({
          pass: true,
          status: 'pass',
          expected: 'explicit math environments rendered as KaTeX',
          actual: 'environments rendered (no visible raw \\begin)',
          message: 'explicit math environments rendered',
        })
      }
    }
    if (envs.unmatchedOpens.length > 0) {
      assertions.push({
        pass: true,
        status: 'source-issue',
        expected: 'well-formed \\begin{env}...\\end{env}',
        actual: `unmatched \\begin{${envs.unmatchedOpens.join(',')}} in source`,
        message: `Source math environment is malformed/unsupported (unmatched begin): ${envs.unmatchedOpens.join(', ')}`,
      })
    }
    // Always-on: leftover `\[` is a user-visible defect even when `\begin{env}`
    // was consumed (o3 01 `\\[6pt]` inside cases). Independent of requiredFeatures.
    if (visibleLeftoverDisplayBrackets(container)) {
      assertions.push({
        pass: false,
        status: 'fail',
        expected: 'no leftover \\[ in visible text',
        actual: 'visible raw \\[',
        message: 'Source math rendered with leftover \\[ — rendered DOM lost it',
      })
    }
  }

  const visible = container.textContent || ''
  const pushFeature = (
    expected: boolean | undefined,
    sourceHas: boolean | undefined,
    domHas: boolean,
    feature: string,
    actualYes: string,
    actualNo: string
  ) => {
    const assertion = presentAssertion(expected, sourceHas, domHas, {
      feature,
      expectedYes: `${feature} present`,
      expectedNo: `no ${feature}`,
      actualYes,
      actualNo,
    })
    if (assertion) assertions.push(assertion)
  }

  const footnoteDom =
    container.querySelector('sup a[href^="#"], a.footnote-ref, section.footnotes, .footnotes, [id^="fn"]') !=
    null
  pushFeature(
    expectedFeatures.footnotes,
    source?.hasFootnotes,
    footnoteDom,
    'footnotes',
    'footnote reference rendered',
    'no footnote element'
  )

  const taskDom = container.querySelector('ul.task-list input[type="checkbox"], li.task-list-item input[type="checkbox"]') != null
  pushFeature(expectedFeatures.taskLists, source?.hasTaskLists, taskDom, 'task lists', 'task checkbox rendered', 'no task checkbox')

  const strikeDom = container.querySelector('del, s, .markdown-strikethrough') != null
  pushFeature(
    expectedFeatures.strikethrough,
    source?.hasStrikethrough,
    strikeDom,
    'strikethrough',
    'strikethrough element rendered',
    'no strikethrough element'
  )

  if (sourceMarkdown && expectedFeatures.autolinks) {
    const urls = autolinkUrlsIn(sourceMarkdown)
    const ok = urls.length > 0 && urls.every(url => hasUrlAnchor(container, url))
    pushFeature(true, source?.hasAutolinks, ok, 'autolinks', urls.join(', '), 'autolink URL missing an anchor')
  }
  if (sourceMarkdown && expectedFeatures.bareUrls) {
    const urls = bareUrlsIn(sourceMarkdown)
    const ok = urls.length > 0 && urls.every(url => hasUrlAnchor(container, url))
    pushFeature(true, source?.hasBareUrls, ok, 'bare URLs', `${urls.length} bare URLs linked`, 'bare URL left unlinked')
  }

  const supOutsideMath = Array.from(container.querySelectorAll('sup')).some(node => !node.closest('.katex'))
  pushFeature(expectedFeatures.breakHtml, source?.hasBreakHtml, container.querySelector('br') != null, 'line-break HTML', '<br> kept', '<br> dropped')
  pushFeature(expectedFeatures.supHtml, source?.hasSupHtml, supOutsideMath, 'superscript HTML', '<sup> kept', '<sup> dropped')
  pushFeature(
    expectedFeatures.detailsHtml,
    source?.hasDetailsHtml,
    container.querySelector('details') != null,
    'details HTML',
    '<details> kept',
    '<details> dropped'
  )

  const nestedQuote = container.querySelector('blockquote blockquote')
  const nestedQuoteDom =
    nestedQuote != null &&
    nestedQuote.querySelector('li') != null &&
    nestedQuote.querySelector('pre, code') != null
  pushFeature(
    expectedFeatures.nestedBlockquote,
    source?.hasNestedBlockquote,
    nestedQuoteDom,
    'nested blockquote',
    'nested blockquote holds a list and code',
    'blockquote did not stay nested around the list and code'
  )

  const alignedCell = Array.from(container.querySelectorAll('th, td')).some(cell => {
    const style = (cell.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase()
    const align = (cell.getAttribute('align') || '').toLowerCase()
    return /text-align:(center|right)/.test(style) || align === 'center' || align === 'right'
  })
  pushFeature(
    expectedFeatures.tableAlignment,
    source?.hasTableAlignment,
    alignedCell,
    'table alignment',
    'a cell is center or right aligned',
    'no center or right aligned cell'
  )

  const pipeCell = Array.from(container.querySelectorAll('td, th')).some(cell =>
    (cell.textContent || '').includes('|')
  )
  pushFeature(
    expectedFeatures.tablePipes,
    source?.hasTablePipes,
    pipeCell,
    'escaped table pipes',
    'a cell shows a literal pipe',
    'escaped pipe was not kept inside a cell'
  )

  const mathCell = container.querySelector('td .katex, th .katex') != null
  pushFeature(
    expectedFeatures.tableInlineMath,
    source?.hasTableInlineMath,
    mathCell,
    'inline math in a table',
    'a table cell contains KaTeX',
    'table cell lost its inline math'
  )

  const mermaidDom =
    container.querySelector('[data-language="mermaid" i], code.language-mermaid, pre.language-mermaid') !=
      null ||
    Array.from(container.querySelectorAll('.code-language-label')).some(node =>
      /mermaid/i.test(node.textContent || '')
    )
  pushFeature(
    expectedFeatures.mermaid,
    source?.hasMermaid,
    mermaidDom,
    'mermaid fence',
    'mermaid language preserved on the fence',
    'mermaid fence lost its language'
  )

  pushFeature(
    expectedFeatures.chemistry,
    source?.hasChemistry,
    renderedTexCommand(container, '\\ce'),
    'mhchem chemistry',
    '\\ce rendered by KaTeX without an error',
    '\\ce was not rendered (mhchem is not loaded)'
  )
  pushFeature(
    expectedFeatures.cases,
    source?.hasCases,
    renderedTexCommand(container, 'cases'),
    'cases environment',
    'cases rendered',
    'cases environment lost'
  )
  pushFeature(
    expectedFeatures.aligned,
    source?.hasAligned,
    renderedTexCommand(container, 'aligned'),
    'aligned environment',
    'aligned rendered',
    'aligned environment lost'
  )
  pushFeature(
    expectedFeatures.boxed,
    source?.hasBoxed,
    renderedTexCommand(container, '\\boxed'),
    'boxed math',
    '\\boxed rendered',
    '\\boxed lost'
  )
  const unicodeTex = katexTex(container)
  const textUnicodeDom = /\\text\{[^}]*[^\u0000-\u007F]/.test(unicodeTex) && !/\\text\{/.test(katexErrorText(container))
  pushFeature(
    expectedFeatures.textUnicode,
    source?.hasTextUnicode,
    textUnicodeDom,
    'unicode inside \\text',
    '\\text kept its unicode',
    'unicode inside \\text was lost'
  )

  if (sourceMarkdown) {
    const phrases = preservedPhrases(sourceMarkdown)
    if (expectedFeatures.emoji) {
      const ok = phrases.emoji.length > 0 && phrases.emoji.every(token => visible.includes(token))
      pushFeature(true, source?.hasEmoji, ok, 'emoji', 'emoji kept', 'emoji dropped')
    }
    if (expectedFeatures.rtl) {
      const rtlNode = Array.from(container.querySelectorAll('[dir="rtl"], [dir="RTL"]')).some(node =>
        phrases.rtl.some(token => (node.textContent || '').includes(token))
      )
      const ok = phrases.rtl.length > 0 && phrases.rtl.every(token => visible.includes(token)) && rtlNode
      pushFeature(true, source?.hasRtl, ok, 'RTL text', 'RTL text kept with dir=rtl', 'RTL text missing dir=rtl or dropped')
    }
    if (expectedFeatures.cjk) {
      const ok = phrases.cjk.length > 0 && phrases.cjk.every(token => visible.includes(token))
      pushFeature(true, source?.hasCjk, ok, 'CJK text', 'CJK text kept', 'CJK text dropped')
    }
    if (expectedFeatures.longUnbroken) {
      const tokens = longUnbrokenTokens(sourceMarkdown)
      const ok = tokens.length > 0 && tokens.every(token => visible.includes(token))
      pushFeature(true, source?.hasLongUnbroken, ok, 'long unbroken token', 'long token kept intact', 'long token was split or dropped')
    }
  }

  pushFeature(
    expectedFeatures.wideTable,
    source?.hasWideTable,
    maxTableColumns(container) >= 8 && container.querySelector('.markdown-table-scroll, table') != null,
    'wide table',
    `${maxTableColumns(container)} columns inside a table`,
    'wide table lost columns'
  )
  pushFeature(
    expectedFeatures.longCodeLine,
    source?.hasLongCodeLine,
    codeHasLongLine(container),
    'long code line',
    'a code block kept a 120+ character line',
    'long code line was lost'
  )
  pushFeature(
    expectedFeatures.currencyBesideMath,
    source?.hasCurrencyBesideMath,
    blockHasCurrencyAndMath(container),
    'currency beside math',
    'a block kept $N next to KaTeX',
    'dollar amount beside math was swallowed'
  )

  const hasFail = assertions.some(a => a.status === 'fail')
  const hasSourceIssue = assertions.some(a => a.status === 'source-issue')
  const hasNotCovered = assertions.some(a => a.status === 'not-covered')
  const status: AssertionStatus = hasFail
    ? 'fail'
    : hasSourceIssue
      ? 'source-issue'
      : hasNotCovered
        ? 'not-covered'
        : 'pass'

  return {
    pass: !hasFail,
    status,
    assertions,
    coverage: {
      hasDisplayMath,
      hasInlineMath,
      hasCodeBlocks,
      hasTables,
      hasLinks,
      hasNestedLists,
      mathErrors: Array.from(mathErrors).map(e => e.textContent || '').slice(0, 5),
      preservedCurrency,
      preservedCodeDollars,
      linkDestinations,
      tableCellCount,
      codeBlockLanguages,
      hasUnsafeLinks,
    },
  }
}

export type { SourceFeatures }
