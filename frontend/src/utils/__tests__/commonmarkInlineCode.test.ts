/**
 * extractInlineCode must pair backticks the same way CommonMark does.
 * Goldens come from the commonmark.js reference parser, not from our renderer.
 */
import { Parser, HtmlRenderer } from 'commonmark'
import { describe, expect, it } from 'vitest'

import { extractInlineCode, restoreInlineCode } from '../latex'

const STEP5_CURRENCY_LINE = '- Escaped currency: `$`100`, `$`0.99, or literal `$` signs'

function commonmarkHtml(markdown: string): string {
  const parser = new Parser()
  const renderer = new HtmlRenderer()
  return renderer.render(parser.parse(markdown)).trim()
}

function codeContents(html: string): string[] {
  return [...html.matchAll(/<code>([\s\S]*?)<\/code>/g)].map(m =>
    m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
  )
}

describe('CommonMark code-span pairing (commonmark.js)', () => {
  it('pairs the Step 5 Preview 05 escaped-currency line as spec §6.1', () => {
    const html = commonmarkHtml(STEP5_CURRENCY_LINE)
    expect(codeContents(html)).toEqual(['$', ', ', '0.99, or literal '])
    expect(html).toContain('</code>100<code>')
    expect(html).toMatch(/<\/code>\$<code>/)
    expect(html).toMatch(/<\/code>\$` signs/)
  })

  it('extractInlineCode matches commonmark.js on that line', () => {
    const { text, spans } = extractInlineCode(STEP5_CURRENCY_LINE)
    expect(spans).toEqual(codeContents(commonmarkHtml(STEP5_CURRENCY_LINE)))
    const restored = restoreInlineCode(text, spans)
    expect(restored).toContain('<code class="inline-code">$</code>100')
    expect(restored).toContain('</code>$<code class="inline-code">0.99, or literal </code>$` signs')
  })

  it.each([
    ['`foo`', ['foo']],
    ['`` foo ` bar ``', ['foo ` bar']],
    ['`` `$x$` ``', ['`$x$`']],
    ['`` `$` ``', ['`$`']],
    ['`foo``bar``', ['bar']],
    ['`foo', []],
  ])('matches commonmark.js spans for %j', (input, spans) => {
    expect(codeContents(commonmarkHtml(input))).toEqual(spans)
    expect(extractInlineCode(input).spans).toEqual(spans)
  })
})
