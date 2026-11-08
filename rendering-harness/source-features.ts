/**
 * Detect which renderable features are present in the *source* markdown of a
 * model reply. Used to distinguish "the model never wrote this" (not-covered)
 * from "the model wrote it and the renderer dropped it" (fail).
 */

import {
  LITERAL_DOLLAR,
  protectCurrencyDollars,
  protectEscapedDollars,
} from '../frontend/src/utils/latex/protection.ts'
import {
  findMatchedExplicitMathEnvs,
  unmatchedExplicitMathEnvOpens,
} from '../frontend/src/utils/latex/mathRenderer.ts'

export interface SourceFeatures {
  hasDisplayMath: boolean
  hasInlineMath: boolean
  hasCodeBlocks: boolean
  hasTables: boolean
  hasLinks: boolean
  hasNestedLists: boolean
  hasCurrency: boolean
  hasCodeDollars: boolean
}

const CURRENCY_AFTER_LITERAL = new RegExp(`${LITERAL_DOLLAR}\\d`)

function stripFencedCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '')
}

function stripInlineCode(markdown: string): string {
  return markdown.replace(/`[^`\n]*`/g, '')
}

function extractFencedBlocks(markdown: string): string[] {
  const blocks: string[] = []
  const re = /```[^\n]*\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    blocks.push(m[1])
  }
  return blocks
}

function stripMathSpans(markdown: string): string {
  return markdown
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/(?<!\\)\$(?!\$)(?:\\\$|[^$\n])+?(?<!\\)\$/g, ' ')
}

function hasDisplayMath(text: string): boolean {
  return (
    /\$\$[\s\S]+?\$\$/.test(text) ||
    /\\\[[\s\S]+?\\\]/.test(text) ||
    /\\begin\{(?:align\*?|equation\*?|gather\*?|multline\*?)\}/.test(text) ||
    hasMultilineDollarWrappedExplicitEnv(text)
  )
}

/** `$ \begin{cases}...\end{cases} $` spanning newlines is display math, not a source omission. */
function hasMultilineDollarWrappedExplicitEnv(text: string): boolean {
  for (const env of findMatchedExplicitMathEnvs(text)) {
    const span = text.slice(Math.max(0, env.start - 80), env.end + 8)
    if (span.includes('\n') && /(?<!\$)\$(?!\$)/.test(span)) return true
  }
  return false
}

function proseOutsideCode(markdown: string): string {
  return stripInlineCode(stripFencedCode(markdown))
}

/** Explicit `\begin{env}...\end{env}` in source prose (not fenced/inline code). */
export function explicitMathEnvsOutsideCode(markdown: string): {
  matched: string[]
  unmatchedOpens: string[]
} {
  const prose = proseOutsideCode(markdown)
  return {
    matched: findMatchedExplicitMathEnvs(prose).map(env => env.name),
    unmatchedOpens: unmatchedExplicitMathEnvOpens(prose),
  }
}

function hasInlineMath(text: string): boolean {
  if (/\\\([\s\S]+?\\\)/.test(text)) return true
  return /(?<!\\)\$(?!\$)(?:\\\$|[^$\n])+?(?<!\\)\$/.test(text)
}

/** GFM table: a pipe row followed by a separator. `|x|` piecewise math is not a table. */
function hasMarkdownTable(text: string): boolean {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|.+\|\s*$/.test(lines[i])) continue
    if (/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      return true
    }
  }
  return false
}

function hasNestedLists(text: string): boolean {
  const indents: number[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^([ \t]*)(?:[-*+]|\d+\.)[ \t]+\S/)
    if (!m) continue
    indents.push(m[1].replace(/\t/g, '    ').length)
  }
  if (indents.length === 0) return false
  const min = Math.min(...indents)
  const levels = new Set(indents.map(i => i - min))
  return levels.size >= 3
}

export function detectSourceFeatures(markdown: string): SourceFeatures {
  const fenced = extractFencedBlocks(markdown)
  const withoutFences = stripFencedCode(markdown)
  const prose = stripInlineCode(withoutFences)
  // Match the renderer: currency `$5 … $10` must not be stripped as one `$...$`
  // math span (GLM 01 / Gemini 01 false not-covered).
  const proseProtected = protectCurrencyDollars(protectEscapedDollars(prose))
  const proseNoMath = stripMathSpans(proseProtected)

  return {
    hasDisplayMath: hasDisplayMath(proseProtected),
    hasInlineMath: hasInlineMath(proseProtected),
    hasCodeBlocks: fenced.length > 0 || /```/.test(markdown),
    hasTables: hasMarkdownTable(proseNoMath) || hasMarkdownTable(prose),
    hasLinks: /\[[^\]]+\]\([^)\s]+\)/.test(prose),
    hasNestedLists: hasNestedLists(prose),
    hasCurrency: CURRENCY_AFTER_LITERAL.test(proseProtected) || /\$\d/.test(proseNoMath),
    hasCodeDollars: fenced.some(block => block.includes('$')),
  }
}
