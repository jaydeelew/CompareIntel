import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { normalizeComparableTex, renderReferenceHtml } from './reference'
import { signatureFromHtml } from './signature'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('independent reference', () => {
  it('does not import LatexRenderer or production protection helpers', () => {
    const src = fs.readFileSync(path.join(here, 'reference.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/latex\//)
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/components\//)
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/utils\/latex/)
    expect(src).not.toMatch(/from ['"][^'"]*LatexRenderer['"]/)
    expect(src).not.toMatch(
      /from ['"][^'"]*(?:protection|codeBlockPreservation|mathRenderer|lists)['"]/
    )
    expect(src).not.toMatch(/function extractInlineCode/)
    expect(src).not.toMatch(/tablesToPlaceholders/)
    expect(src).not.toMatch(/gfm_table/)
    expect(src).not.toMatch(/registerGfmTables/)
    expect(src).toMatch(/new MarkdownIt/)
  })

  it('does not pair a ($$) label with the next real $$ equation (bug 29)', () => {
    const html = renderReferenceHtml(
      '**Display math ($$):**\n$$x^2 + y^2 = r^2$$\n**Inline math ($):**\n$a + b$'
    )
    const sig = signatureFromHtml(html)
    expect(sig.texSources.some(t => /x\^2/.test(t) && /r\^2/.test(t))).toBe(true)
    expect(sig.texSources.some(t => /a\s*\+\s*b/.test(t))).toBe(true)
    expect(sig.texSources.some(t => /label|\):\*\*/.test(t))).toBe(false)
    expect(sig.visibleText).toMatch(/\$\$/)
  })

  it('does not pair leftover $$ as delimiter. with $$E=mc^2$$', () => {
    const html = renderReferenceHtml('For display math use $$ as delimiter.\n\n$$E=mc^2$$')
    const sig = signatureFromHtml(html)
    expect(sig.texSources.some(t => /E\s*=\s*mc\^2/.test(t))).toBe(true)
    expect(sig.texSources.some(t => /as delimiter/.test(t))).toBe(false)
    expect(sig.visibleText).toContain('$$')
    expect(sig.displayMathCount).toBe(1)
  })

  it('renders The formula is $$ / E=mc^2 / $$ as one display equation', () => {
    const html = renderReferenceHtml('The formula is $$\nE=mc^2\n$$')
    const sig = signatureFromHtml(html)
    expect(sig.displayMathCount).toBe(1)
    expect(sig.texSources.some(t => /E\s*=\s*mc\^2/.test(t))).toBe(true)
    expect(sig.visibleText).not.toMatch(/\$\$/)
  })

  it('unescapes \\| inside table-cell code (GFM example 200)', () => {
    const html = renderReferenceHtml(
      '| Feature | Challenge | Solution |\n|---------|-----------|----------|\n| Tables with math | `\\|` conflicts, complex fractions | Escape pipes |\n'
    )
    const sig = signatureFromHtml(html)
    expect(sig.codeSpans).toContain('|')
    expect(sig.codeSpans.some(s => s.includes('\\|'))).toBe(false)
    expect(sig.tableCells[0]?.some(c => c.includes('| conflicts'))).toBe(true)
  })

  it('treats blockquote markers inside display math as the same formula', () => {
    const ours = String.raw`\begin{aligned} > x + y &= 5 \\ > 2x - y &= 1 > \end{aligned}`
    const ref = String.raw`\begin{aligned} x + y &= 5 \\ 2x - y &= 1 \end{aligned}`
    expect(normalizeComparableTex(ours)).toBe(normalizeComparableTex(ref))
    expect(normalizeComparableTex('> C(q)=100+5q >')).toBe('C(q)=100+5q')
    expect(normalizeComparableTex(String.raw`\|\mathbf{x}\|_2`)).toBe(String.raw`|\mathbf{x}|_2`)
  })

  it('keeps $...$ as a label so the following example stays math', () => {
    const html = renderReferenceHtml('Inline math uses $...$ (e.g., $a^2 + b^2 = c^2$).')
    const sig = signatureFromHtml(html)
    expect(sig.texSources.some(t => /a\^2/.test(t))).toBe(true)
    expect(sig.texSources.some(t => t.includes('e.g'))).toBe(false)
    expect(sig.visibleText).toContain('$...$')
  })

  it('does not swallow a code span when a prose $ comes first', () => {
    const html = renderReferenceHtml(
      'Matching the end of a line uses $, like `^foo$`, while $x^2$.'
    )
    const sig = signatureFromHtml(html)
    expect(sig.texSources.some(t => t.includes('foo'))).toBe(false)
    expect(sig.texSources.some(t => /x\^2/.test(t))).toBe(true)
    expect(sig.codeSpans.some(s => s.includes('^foo'))).toBe(true)
  })
})
