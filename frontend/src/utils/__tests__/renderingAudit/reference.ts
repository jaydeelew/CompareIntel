/**
 * Independent CommonMark/GFM + KaTeX reference for a source section.
 *
 * 1. Fences and CommonMark inline-code pairing (same rules as the spec).
 * 2. Escaped `\$` → literal `$`.
 * 3. Real math delimiters become KaTeX: `$$...$$`, `\[...\]`, `\(...\)`,
 *    and `$...$` that is not currency. Empty / ellipsis / list-crossing
 *    `\[...\]` is left for markdown-it to unescape (`\[` → `[`).
 * 4. markdown-it (GFM tables, no typographer) for structure and backslash
 *    escapes.
 *
 * This pipeline does not call LatexRenderer, wrapBareLatexBlocks, or
 * leftover `\frac` recovery.
 */
import MarkdownIt from 'markdown-it'

import { renderCodeBlock } from '../../latex/codeBlocks'
import { safeRenderKatex } from '../../latex/helpers'
import {
  displaySpanCrossesListItem,
  isEllipsisDelimiterExample,
  leaveDelimiterExample,
} from '../../latex/mathRenderer'
import {
  extractInlineCode,
  protectCurrencyDollars,
  protectEscapedDollars,
  restoreInlineCode,
  restoreLiteralDollars,
} from '../../latex/protection'

const md = new MarkdownIt({ html: false, linkify: false, breaks: false, typographer: false })

const DISPLAY_PH = (i: number) => `\uE010${i}\uE011`
const INLINE_PH = (i: number) => `\uE012${i}\uE013`

interface Fence {
  language: string
  content: string
}

function extractFences(markdown: string): { text: string; fences: Fence[] } {
  const fences: Fence[] = []
  const text = markdown.replace(
    /^[ \t]*```([a-zA-Z0-9+#-]*)\n([\s\S]*?)^[ \t]*```/gm,
    (_m, language: string, content: string) => {
      fences.push({ language: (language || '').trim(), content: content.replace(/^\n+|\n+$/g, '') })
      return `__CODE_BLOCK_${fences.length - 1}__`
    }
  )
  return { text, fences }
}

export function renderReferenceHtml(markdown: string): string {
  const { text: fenced, fences } = extractFences(markdown)
  const inline = extractInlineCode(fenced)
  let text = protectEscapedDollars(inline.text)

  const display: string[] = []
  // `[^$]` so a leftover `$$` cannot swallow `$...$` / later `$$...$$`.
  text = text.replace(/\$\$([^$]+?)\$\$/gs, (full, inner: string) => {
    if (displaySpanCrossesListItem(full) || isEllipsisDelimiterExample(full)) {
      return leaveDelimiterExample(full)
    }
    display.push(inner)
    return DISPLAY_PH(display.length - 1)
  })
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (full, inner: string) => {
    if (displaySpanCrossesListItem(full) || isEllipsisDelimiterExample(full)) {
      return leaveDelimiterExample(full)
    }
    display.push(inner)
    return DISPLAY_PH(display.length - 1)
  })

  const inlineMath: string[] = []
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (full, inner: string) => {
    if (isEllipsisDelimiterExample(full)) return leaveDelimiterExample(full)
    inlineMath.push(inner)
    return INLINE_PH(inlineMath.length - 1)
  })

  text = protectCurrencyDollars(text)
  text = text.replace(/\$(?!\$)([^$\n]+?)\$/g, (full, inner: string) => {
    if (!inner.trim() || isEllipsisDelimiterExample(full)) return leaveDelimiterExample(full)
    inlineMath.push(inner)
    return INLINE_PH(inlineMath.length - 1)
  })

  let html = md.render(text)
  html = restoreLiteralDollars(html)
  html = restoreInlineCode(html, inline.spans)

  html = html.replace(/\uE010(\d+)\uE011/g, (_m, i: string) =>
    safeRenderKatex(display[Number(i)] || '', true)
  )
  html = html.replace(/\uE012(\d+)\uE013/g, (_m, i: string) =>
    safeRenderKatex(inlineMath[Number(i)] || '', false)
  )

  html = html.replace(/__CODE_BLOCK_(\d+)__/g, (_m, i: string) => {
    const block = fences[Number(i)]
    return block ? renderCodeBlock(block.language, block.content) : ''
  })

  return html
}
