/**
 * DOM assertion validation for rendered responses.
 * Distinguishes renderer loss (source had the feature, DOM does not) from
 * not-covered (the model never wrote the feature).
 */

import { JSDOM } from 'jsdom'
import {
  detectSourceFeatures,
  explicitMathEnvsOutsideCode,
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
}

/** Visible leftover `\begin{env}` after stripping MathML, annotations, and code. */
function visibleUnrenderedMathEnvs(container: Element, envNames: string[]): string[] {
  const unique = [...new Set(envNames)]
  if (unique.length === 0) return []
  const clone = container.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml, pre, code, annotation').forEach(node => node.remove())
  const text = clone.textContent || ''
  return unique.filter(name => text.includes(`\\begin{${name}}`))
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
  }

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
