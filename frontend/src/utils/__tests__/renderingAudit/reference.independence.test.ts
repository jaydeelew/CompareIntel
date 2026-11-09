import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { renderReferenceHtml } from './reference'
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
  })
})
