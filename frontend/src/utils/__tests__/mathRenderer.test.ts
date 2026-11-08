/**
 * Tests for math rendering, including quadratic formula and other LaTeX
 */

import { describe, it, expect } from 'vitest'

import type { MathRendererConfig } from '../../types/rendererConfig'
import { extractDisplayMath, restoreDisplayMath, renderMathContent } from '../latex/mathRenderer'

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

const qwenCoderDisplayDelimiters: MathRendererConfig['displayMathDelimiters'] = [
  {
    pattern: /\\begin\{align\}([\s\S]*?)\\end\{align\}/g,
    name: 'align-env',
    priority: 1,
  },
  {
    pattern: /\$\$([^$]+?)\$\$/gs,
    name: 'double-dollar',
    priority: 2,
  },
]

describe('extractDisplayMath - $$\\begin{align}$$ is one outer block', () => {
  it('does not nest __DISPLAY_MATH_0__ inside a later $$ capture (Qwen3 Coder 01)', () => {
    const input = `## Display Math with Aligned Equations
$$\\begin{align}
x + y &= 5 \\\\
2x - y &= 1
\\end{align}$$

$$E = mc^2$$`
    const { text, mathBlocks } = extractDisplayMath(input, qwenCoderDisplayDelimiters)
    expect(text).not.toContain('\\begin{align}')
    expect(mathBlocks.some(block => block.includes('__DISPLAY_MATH_'))).toBe(false)
    expect(mathBlocks.some(block => /\\begin\{align\}/.test(block))).toBe(true)
    const restored = restoreDisplayMath(text, mathBlocks)
    expect(restored).toContain('\\begin{align}')
    expect(restored).not.toContain('__DISPLAY_MATH_')
  })

  it('renders $$\\begin{align}$$ without KaTeX errors', () => {
    const input = `$$\\begin{align}
x + y &= 5 \\\\
2x - y &= 1
\\end{align}$$`
    const result = renderMathContent(input, {
      displayMathDelimiters: qwenCoderDisplayDelimiters,
      inlineMathDelimiters: [],
      katexOptions: { throwOnError: false, strict: false },
    })
    expect(result).toContain('katex-display')
    expect(result).not.toContain('katex-error')
    expect(result).not.toContain('__DISPLAY_MATH_')
  })
})

const gpt5DisplayDelimiters: MathRendererConfig['displayMathDelimiters'] = [
  { pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar', priority: 1 },
]

describe('extractDisplayMath - multiline $ \\begin{cases} $ is one display block', () => {
  const piecewise = `$f(x) = \\begin{cases}
x^2, & x \\ge 0 \\\\
-\\,|x|, & x < 0
\\end{cases}$`

  it('extracts GPT-5 05 cases as $$...$$ (not leftover wrapping $)', () => {
    const { text, mathBlocks } = extractDisplayMath(piecewise, gpt5DisplayDelimiters)
    expect(text).not.toContain('\\begin{cases}')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0]).toMatch(/^\$\$/)
    expect(mathBlocks[0]).toContain('\\begin{cases}')
    expect(mathBlocks[0]).not.toMatch(/^\$[^$]/)
  })

  it('does not extract currency or single-line pmatrix as display', () => {
    const currency = 'Prices: Laptop costs $1,499.99, monitor $329.00, keyboard $49.95.'
    const { mathBlocks: moneyBlocks } = extractDisplayMath(currency, gpt5DisplayDelimiters)
    expect(moneyBlocks).toHaveLength(0)

    const inlinePmatrix = '$A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$'
    const { text, mathBlocks } = extractDisplayMath(inlinePmatrix, gpt5DisplayDelimiters)
    expect(mathBlocks).toHaveLength(0)
    expect(text).toContain('\\begin{pmatrix}')
  })
})
