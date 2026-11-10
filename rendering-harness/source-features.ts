/**
 * Detect which renderable features are present in the *source* markdown of a
 * model reply. Used to distinguish "the model never wrote this" (not-covered)
 * from "the model wrote it and the renderer dropped it" (fail).
 */

import {
  LITERAL_DOLLAR,
  extractInlineCode,
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
  hasFootnotes: boolean
  hasTaskLists: boolean
  hasStrikethrough: boolean
  hasAutolinks: boolean
  hasBareUrls: boolean
  hasBreakHtml: boolean
  hasSupHtml: boolean
  hasDetailsHtml: boolean
  hasNestedBlockquote: boolean
  hasTableAlignment: boolean
  hasTablePipes: boolean
  hasTableInlineMath: boolean
  hasMermaid: boolean
  hasChemistry: boolean
  hasCases: boolean
  hasAligned: boolean
  hasBoxed: boolean
  hasTextUnicode: boolean
  hasEmoji: boolean
  hasRtl: boolean
  hasCjk: boolean
  hasLongUnbroken: boolean
  hasWideTable: boolean
  hasLongCodeLine: boolean
  hasCurrencyBesideMath: boolean
}

const CURRENCY_AFTER_LITERAL = new RegExp(`${LITERAL_DOLLAR}\\d`)

function stripFencedCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '')
}

function stripInlineCode(markdown: string): string {
  const { text } = extractInlineCode(markdown)
  return text.replace(/\uE001\d+\uE002/g, '')
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

const EMOJI_RE = /\p{Extended_Pictographic}/u
const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F]/
const CJK_RE = /[\u3040-\u30FF\u3400-\u9FFF]/
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/

function quoteDepth(line: string): number {
  let rest = line
  let depth = 0
  while (/^[ \t]{0,3}>/.test(rest)) {
    depth += 1
    rest = rest.replace(/^[ \t]{0,3}>[ \t]?/, '')
  }
  return depth
}

function quoteInner(line: string, depth: number): string {
  let rest = line
  for (let i = 0; i < depth; i++) {
    rest = rest.replace(/^[ \t]{0,3}>[ \t]?/, '')
  }
  return rest
}

/** Nested `>` quote that itself holds a list item and a fenced code block. */
function hasNestedBlockquote(markdown: string): boolean {
  let list = false
  let code = false
  let inFence = false
  for (const line of markdown.split('\n')) {
    const depth = quoteDepth(line)
    if (depth < 2) {
      if (inFence) inFence = false
      continue
    }
    const inner = quoteInner(line, depth).trim()
    if (/^```/.test(inner)) {
      inFence = !inFence
      code = true
      continue
    }
    if (inFence) code = true
    if (/^(?:[-*+]|\d+\.)[ \t]+\S/.test(inner)) list = true
  }
  return list && code
}

function tableLines(text: string): string[] {
  return text.split('\n').filter(line => /^\s*\|.+\|\s*$/.test(line) || TABLE_SEPARATOR_RE.test(line))
}

function separatorColumnCount(line: string): number {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return body.split('|').filter(cell => /-{2,}/.test(cell)).length
}

function hasWideTable(text: string): boolean {
  return text.split('\n').some(line => TABLE_SEPARATOR_RE.test(line) && separatorColumnCount(line) >= 8)
}

function hasAlignedTable(text: string): boolean {
  return text.split('\n').some(line => TABLE_SEPARATOR_RE.test(line) && line.includes(':'))
}

function hasTablePipes(text: string): boolean {
  return tableLines(text).some(line => line.includes('\\|'))
}

function hasTableInlineMath(text: string): boolean {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|.+\|\s*$/.test(lines[i])) continue
    if (!TABLE_SEPARATOR_RE.test(lines[i + 1])) continue
    const block = lines.slice(i, Math.min(lines.length, i + 8)).join('\n')
    if (/\$|(?<!\\)\\\(/.test(block)) return true
  }
  return false
}

function autolinkUrls(text: string): string[] {
  return [...text.matchAll(/<(https?:\/\/[^>\s]+)>/gi)].map(match => match[1])
}

function bareUrls(text: string): string[] {
  const hidden = text
    .replace(/<(https?:\/\/[^>\s]+)>/gi, ' ')
    .replace(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, ' ')
  return [...hidden.matchAll(/https?:\/\/[^\s<>)"']+/gi)].map(match => match[0].replace(/[.,;:]+$/, ''))
}

function hasLongUnbroken(text: string): boolean {
  return text.split('\n').some(line => {
    if (line.trim().length < 160) return false
    return line.split(/\s+/).some(token => token.length >= 160)
  })
}

function fenceBodies(markdown: string): string[] {
  return extractFencedBlocks(markdown)
}

function hasLongCodeLine(markdown: string): boolean {
  return fenceBodies(markdown).some(body => body.split('\n').some(line => line.length >= 120))
}

function hasCurrencyBesideMath(text: string): boolean {
  return text.split('\n').some(line => {
    if (!/(?<!\\)\$\d/.test(line)) return false
    return (
      /(?<!\\)\$(?!\$)(?:\\\$|[^$\n])+?(?<!\\)\$/.test(line) ||
      /\\\([\s\S]+?\\\)/.test(line) ||
      /\$\$[\s\S]+?\$\$/.test(line)
    )
  })
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

  const proseLines = prose
  return {
    hasDisplayMath: hasDisplayMath(proseProtected),
    hasInlineMath: hasInlineMath(proseProtected),
    hasCodeBlocks: fenced.length > 0 || /```/.test(markdown),
    hasTables: hasMarkdownTable(proseNoMath) || hasMarkdownTable(prose),
    hasLinks: /\[[^\]]+\]\([^)\s]+\)/.test(prose) || autolinkUrls(prose).length > 0,
    hasNestedLists: hasNestedLists(prose),
    hasCurrency: CURRENCY_AFTER_LITERAL.test(proseProtected) || /\$\d/.test(proseNoMath),
    hasCodeDollars: fenced.some(block => block.includes('$')),
    hasFootnotes: /\[\^[^\]]+\]/.test(prose),
    hasTaskLists: /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+\S/m.test(prose),
    hasStrikethrough: /~~[^~\n]+~~/.test(prose),
    hasAutolinks: autolinkUrls(prose).length > 0,
    hasBareUrls: bareUrls(prose).length > 0,
    hasBreakHtml: /<br\s*\/?>/i.test(prose),
    hasSupHtml: /<sup\b/i.test(prose),
    hasDetailsHtml: /<details\b/i.test(prose),
    hasNestedBlockquote: hasNestedBlockquote(markdown),
    hasTableAlignment: hasAlignedTable(prose),
    hasTablePipes: hasTablePipes(prose),
    hasTableInlineMath: hasTableInlineMath(prose),
    hasMermaid: /```mermaid\b/i.test(markdown),
    hasChemistry: /\\ce\{/.test(prose),
    hasCases: /\\begin\{cases\}/.test(prose),
    hasAligned: /\\begin\{aligned\}/.test(prose),
    hasBoxed: /\\boxed\{/.test(prose),
    hasTextUnicode: /\\text\{[^}]*[^\u0000-\u007F][^}]*\}/.test(prose),
    hasEmoji: EMOJI_RE.test(prose),
    hasRtl: RTL_RE.test(prose),
    hasCjk: CJK_RE.test(prose),
    hasLongUnbroken: hasLongUnbroken(proseLines),
    hasWideTable: hasWideTable(prose),
    hasLongCodeLine: hasLongCodeLine(markdown),
    hasCurrencyBesideMath: hasCurrencyBesideMath(prose),
  }
}

export function autolinkUrlsIn(markdown: string): string[] {
  return autolinkUrls(proseOutsideCode(markdown))
}

export function bareUrlsIn(markdown: string): string[] {
  return bareUrls(proseOutsideCode(markdown))
}

/** Visible phrases the rare-format prompt asks the renderer to keep intact. */
export function preservedPhrases(markdown: string): { emoji: string[]; rtl: string[]; cjk: string[] } {
  const prose = proseOutsideCode(markdown)
  const emoji = [...prose.matchAll(/\p{Extended_Pictographic}+/gu)].map(match => match[0])
  const rtl = [...prose.matchAll(/[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F][\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\s،.!?؟]*/gu)]
    .map(match => match[0].trim())
    .filter(Boolean)
  const cjk = [...prose.matchAll(/[\u3040-\u30FF\u3400-\u9FFF]{2,}/gu)].map(match => match[0])
  return { emoji, rtl, cjk }
}

export function longUnbrokenTokens(markdown: string): string[] {
  const prose = proseOutsideCode(markdown)
  const tokens: string[] = []
  for (const line of prose.split('\n')) {
    for (const token of line.split(/\s+/)) {
      if (token.length >= 160) tokens.push(token)
    }
  }
  return tokens
}
