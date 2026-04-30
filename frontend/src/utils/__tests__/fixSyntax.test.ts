/**
 * Tests for LaTeX syntax normalization (bare-math wrapping must not corrupt delimited math).
 */

import { describe, it, expect } from 'vitest'

import { wrapBareLatexBlocks } from '../latex/fixSyntax'

describe('wrapBareLatexBlocks', () => {
  it('does not wrap markdown-bold inline math (prompt style **$...$**)', () => {
    const input = 'The quadratic formula is:\n**$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$**'
    expect(wrapBareLatexBlocks(input)).toBe(input)
  })

  it('does not wrap lines that already use display math', () => {
    const input = 'Thus $$x = \\frac{1}{2}$$.'
    expect(wrapBareLatexBlocks(input)).toBe(input)
  })

  it('still wraps a truly bare LaTeX line (no delimiters)', () => {
    const input = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'
    const out = wrapBareLatexBlocks(input)
    expect(out).toMatch(/^\$\$/)
    expect(out).toMatch(/\$\$$/)
    expect(out).toContain('frac')
  })
})
