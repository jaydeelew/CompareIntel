/**
 * Tests for LaTeX syntax normalization (bare-math wrapping must not corrupt delimited math).
 */

import { describe, it, expect } from 'vitest'

import { wrapBareLatexBlocks, fixLatexIssues } from '../latex/fixSyntax'

describe('wrapBareLatexBlocks', () => {
  it('does not wrap markdown-bold inline math (prompt style **$...$**)', () => {
    const input = 'The quadratic formula is:\n**$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$**'
    expect(wrapBareLatexBlocks(input)).toBe(input)
  })

  it('does not wrap lines that already use display math', () => {
    const input = 'Thus $$x = \\frac{1}{2}$$.'
    expect(wrapBareLatexBlocks(input)).toBe(input)
  })

  it('does not wrap a bare LaTeX line (undelimited \\frac stays CommonMark text)', () => {
    const input = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'
    expect(wrapBareLatexBlocks(input)).toBe(input)
  })

  it('does not wrap inner lines of a list-prefixed \\[ display block', () => {
    const input = '- \\[\n  c = \\sqrt{3^2 + 4^2} = 5\n  \\]'
    expect(wrapBareLatexBlocks(input)).toBe(input)
    expect(wrapBareLatexBlocks(input)).not.toContain('$$')
  })

  it('does not strip a list-prefixed \\] closer or wrap a following bare \\frac', () => {
    const input = '- \\[\n  c = \\sqrt{3^2 + 4^2} = 5\n- \\]\n\\frac{1}{2}'
    const out = wrapBareLatexBlocks(input)
    expect(out).toBe(input)
    expect(out).toMatch(/^- \\]$/m)
    expect(out).not.toMatch(/\$\$/)
  })

  it('does not strip a list-prefixed $$ closer or wrap a following bare \\frac', () => {
    const input = '- $$\n  c = \\sqrt{3^2 + 4^2} = 5\n- $$\n\\frac{1}{2}'
    expect(wrapBareLatexBlocks(input)).toBe(input)
  })
})

describe('fixLatexIssues', () => {
  describe('plain English word preservation', () => {
    it('does not convert the word "times" to \\times (regression test)', () => {
      const input = 'How many times does the letter r appear in "strawberry"?'
      const output = fixLatexIssues(input)
      expect(output).toBe(input)
      expect(output).toContain('times')
      expect(output).not.toContain('\\times')
    })

    it('does not convert "times" in model responses', () => {
      const input =
        'The letter r appears 3 times in the word "strawberry". Let me count: once at position 3, once at position 4, and once at position 9.'
      const output = fixLatexIssues(input)
      expect(output).toBe(input)
      expect(output).toContain('times')
      expect(output).not.toContain('\\times')
    })

    it('does not convert "times" in various contexts', () => {
      const testCases = [
        'How many times should I repeat this?',
        'At times, the algorithm fails.',
        'Sometimes it works.',
        'The function was called 10 times.',
        'In ancient times, people believed...',
      ]

      testCases.forEach(input => {
        const output = fixLatexIssues(input)
        expect(output).toBe(input)
        expect(output).not.toContain('\\times')
      })
    })

    it('converts Unicode × symbol to \\times inside math delimiters', () => {
      expect(fixLatexIssues('$5 × 3 = 15$')).toBe('$5 \\times 3 = 15$')
      expect(fixLatexIssues('\\(5 × 3\\) and \\[(2×4)\\]')).toBe(
        '\\(5 \\times 3\\) and \\[(2 \\times 4)\\]'
      )
    })

    it('leaves Unicode × in prose alone', () => {
      const input = 'The 2×2 identity matrix is:'
      expect(fixLatexIssues(input)).toBe(input)
    })

    it('converts other math operators but not "times" word', () => {
      const input = 'x leq 5 and x neq 0 but how many times is x positive?'
      const output = fixLatexIssues(input)
      expect(output).toContain('\\leq')
      expect(output).toContain('\\neq')
      expect(output).toContain('times')
      expect(output).not.toContain('\\times')
    })
  })
})
