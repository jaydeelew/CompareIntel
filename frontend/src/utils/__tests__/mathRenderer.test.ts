/**
 * Tests for math rendering, including quadratic formula and other LaTeX
 */

import { describe, it, expect } from 'vitest'

import type { MathRendererConfig } from '../../types/rendererConfig'
import { renderMathContent } from '../latex/mathRenderer'

// Config matching GPT 5.2 Pro: \( \) has priority over $
const parenFirstConfig: MathRendererConfig = {
  displayMathDelimiters: [
    { pattern: /\\\[\s*([\s\S]*?)\s*\\\]/g, name: 'bracket', priority: 1 },
    { pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar', priority: 2 },
  ],
  inlineMathDelimiters: [
    { pattern: /\\\(\s*([\s\S]*?)\s*\\\)/g, name: 'paren', priority: 1 },
    { pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar', priority: 2 },
  ],
  katexOptions: { throwOnError: false, strict: false },
}

describe('mathRenderer', () => {
  describe('renderMathContent - delimiter order (GPT 5.2 Pro style)', () => {
    it('should render fractions in \\( \\) delimited content correctly', () => {
      const input = 'Start with \\(x^2+\\frac{b}{a}x+\\frac{c}{a}=0\\)'
      const result = renderMathContent(input, parenFirstConfig)

      // KaTeX renders fractions as mfrac in MathML - visible output should have fraction structure
      expect(result).toContain('katex')
      expect(result).toContain('mfrac') // Proper fraction rendering in MathML
    })

    it('should render quadratic formula with \\displaystyle in \\( \\) correctly', () => {
      const input = 'Solve: \\(\\displaystyle x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\\).'
      const result = renderMathContent(input, parenFirstConfig)

      // Should be fully rendered - check for proper structure, not character corruption
      expect(result).toContain('katex')
      expect(result).toContain('mfrac') // Fraction rendered
      expect(result).toContain('msqrt') // Square root rendered
      expect(result).not.toMatch(/62-4a[cs]/) // No b→6, ac→ас corruption
    })

    it('should render \\Rightarrow and \\pm in \\( \\) content', () => {
      const input = '\\(x^2+\\frac{b}{a}x=-\\frac{c}{a} \\Rightarrow x=\\pm 1\\)'
      const result = renderMathContent(input, parenFirstConfig)

      // KaTeX renders ⇒ and ± - check for proper output
      expect(result).toContain('katex')
      expect(result).toContain('mfrac')
      // Rendered symbols: ⇒ (Unicode U+21D2) and ± (Unicode U+00B1) appear in HTML
      expect(result).toMatch(/⇒|&#x21D2;/)
      expect(result).toMatch(/±|&#x00B1;/)
    })

    it('should render full quadratic formula derivation (user-reported sample)', () => {
      const input = `Starting with \\(ax^2+bx+c=0\\) \\((a\\neq 0)\\), divide by \\(a\\): \\(x^2+\\frac{b}{a}x+\\frac{c}{a}=0\\Rightarrow x^2+\\frac{b}{a}x=-\\frac{c}{a}\\).
Complete the square: \\(x^2+\\frac{b}{a}x+\\left(\\frac{b}{2a}\\right)^2=-\\frac{c}{a}+\\left(\\frac{b}{2a}\\right)^2\\).
Thus \\(\\left(x+\\frac{b}{2a}\\right)^2=\\frac{b^2-4ac}{4a^2}\\).
Take square roots: \\(x+\\frac{b}{2a}=\\pm\\frac{\\sqrt{b^2-4ac}}{2a}\\).
So \\(x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\\).`
      const result = renderMathContent(input, parenFirstConfig)

      expect(result).toContain('katex')
      expect(result).toContain('mfrac')
      // All math should be rendered - no raw LaTeX commands in visible output
      // (KaTeX puts LaTeX in <annotation> for accessibility - check we have proper structure)
      expect(result).toContain('msqrt')
      // No garbled output
      expect(result).not.toMatch(/62-4a[cs]/)
      expect(result).not.toMatch(/b2-4ac√/)
    })
  })
})
