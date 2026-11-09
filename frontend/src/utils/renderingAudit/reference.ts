/**
 * CommonMark/GFM + KaTeX reference for a source section.
 * Fences and code spans follow CommonMark; remaining math delimiters that are
 * not currency become KaTeX. Markdown structure is markdown-it (GFM tables).
 */
import MarkdownIt from 'markdown-it'

import { renderCodeBlock } from '../latex/codeBlocks'
import { safeRenderKatex } from '../latex/helpers'
import {
  extractInlineCode,
  protectCurrencyDollars,
  protectEscapedDollars,
  protectParenthesizedDelimiterExamples,
  restoreInlineCode,
  restoreLiteralDollars,
} from '../latex/protection'

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
    /```([a-zA-Z0-9+#-]*)\n?([\s\S]*?)```/g,
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
  text = protectParenthesizedDelimiterExamples(text)

  const display: string[] = []
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => {
    display.push(inner)
    return DISPLAY_PH(display.length - 1)
  })
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => {
    display.push(inner)
    return DISPLAY_PH(display.length - 1)
  })

  const inlineMath: string[] = []
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner: string) => {
    inlineMath.push(inner)
    return INLINE_PH(inlineMath.length - 1)
  })

  text = protectCurrencyDollars(text)
  text = text.replace(/\$(?!\$)([^$\n]+?)\$/g, (full, inner: string) => {
    if (!inner.trim()) return full
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
