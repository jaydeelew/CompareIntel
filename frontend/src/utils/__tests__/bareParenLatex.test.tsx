/**
 * A parenthetical whose whole content is LaTeX renders as inline math.
 * The parentheses stay as text around the KaTeX, so `(\sqrt{2})` reads as (√2).
 * The CommonMark + KaTeX reference leaves these spans as literal text; keeping
 * the parentheses matches that reading and avoids swallowing them into the math.
 */
import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'

const MODEL = 'google/gemma-3-27b-it'

const SCREENSHOT =
  'The square root of 2 (\\sqrt{2}) is an irrational number, meaning it cannot be expressed as a simple fraction. Its approximate value is **1.41421356…** The decimal representation goes on forever without repeating.'

function renderReply(markdown: string): HTMLElement {
  const { container } = render(<LatexRenderer modelId={MODEL}>{markdown}</LatexRenderer>)
  return container.querySelector('.latex-content') as HTMLElement
}

function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml').forEach(node => node.remove())
  return (clone.textContent ?? '')
    .replace(/[\u200b\u2060]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Full sentence with each KaTeX span replaced by its TeX source. */
function markedSentence(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex').forEach(node => {
    const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? ''
    node.replaceWith(`⟨${tex}⟩`)
  })
  return (clone.textContent ?? '')
    .replace(/[\u200b\u2060]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

beforeAll(async () => {
  await initializeRegistry()
})

describe('bare parenthetical LaTeX', () => {
  it('renders the Gemma screenshot sentence with parentheses around √2', () => {
    const el = renderReply(SCREENSHOT)
    expect(el.querySelector('.katex-error')).toBeNull()
    expect(markedSentence(el)).toBe(
      'The square root of 2 (⟨\\sqrt{2}⟩) is an irrational number, meaning it cannot be expressed as a simple fraction. Its approximate value is 1.41421356… The decimal representation goes on forever without repeating.'
    )
    expect(visibleText(el)).toBe(
      'The square root of 2 (2) is an irrational number, meaning it cannot be expressed as a simple fraction. Its approximate value is 1.41421356… The decimal representation goes on forever without repeating.'
    )
    expect(el.querySelector('strong')?.textContent).toBe('1.41421356…')
  })

  it('renders each required expression as its full sentence', () => {
    const cases = [
      {
        source:
          'The square root of 2 (\\sqrt{2}) is an irrational number, meaning it cannot be expressed as a simple fraction.',
        marked:
          'The square root of 2 (⟨\\sqrt{2}⟩) is an irrational number, meaning it cannot be expressed as a simple fraction.',
        visible:
          'The square root of 2 (2) is an irrational number, meaning it cannot be expressed as a simple fraction.',
      },
      {
        source: 'One half is written (\\frac{1}{2}) in lowest terms.',
        marked: 'One half is written (⟨\\frac{1}{2}⟩) in lowest terms.',
        // KaTeX lays the denominator out before the numerator in the DOM,
        // so the fraction's text content is "21" while the TeX source stays \frac{1}{2}.
        visible: 'One half is written (21) in lowest terms.',
      },
      {
        source: 'The area of a circle is (\\pi r^2) when r is the radius.',
        marked: 'The area of a circle is (⟨\\pi r^2⟩) when r is the radius.',
        visible: 'The area of a circle is (πr2) when r is the radius.',
      },
      {
        source: 'Keep the variable in range (x \\le 5) for this step.',
        marked: 'Keep the variable in range (⟨x \\le 5⟩) for this step.',
        visible: 'Keep the variable in range (x≤5) for this step.',
      },
      {
        source: 'Add the angles (\\alpha + \\beta) before simplifying.',
        marked: 'Add the angles (⟨\\alpha + \\beta⟩) before simplifying.',
        visible: 'Add the angles (α+β) before simplifying.',
      },
    ]
    for (const item of cases) {
      const el = renderReply(item.source)
      expect(el.querySelector('.katex-error'), item.source).toBeNull()
      expect(markedSentence(el), item.source).toBe(item.marked)
      expect(visibleText(el), item.source).toBe(item.visible)
    }
  })

  it('leaves prose, paths, money, regex, code, and links untouched', () => {
    const untouched = [
      {
        source: 'Read the note (see \\n below) before continuing.',
        visible: 'Read the note (see \\n below) before continuing.',
      },
      {
        source: 'Use a short form (e.g. a \\ path) in the example.',
        visible: 'Use a short form (e.g. a \\ path) in the example.',
      },
      {
        source: 'Save the file at C:\\Users (path) on this machine.',
        visible: 'Save the file at C:\\Users (path) on this machine.',
      },
      {
        source: 'The tag price (\\$5) is not mathematics.',
        visible: 'The tag price ($5) is not mathematics.',
      },
      {
        source: 'The capture group (\\d+) and the word (\\w+) stay regex.',
        visible: 'The capture group (\\d+) and the word (\\w+) stay regex.',
      },
    ]
    for (const item of untouched) {
      const el = renderReply(item.source)
      expect(el.querySelector('.katex'), item.source).toBeNull()
      expect(visibleText(el), item.source).toBe(item.visible)
    }
  })

  it('does not render bare paren LaTeX inside inline code, fences, or link destinations', () => {
    const inline = renderReply('The command `(\\sqrt{2})` is code, not math.')
    expect(inline.querySelector('.katex')).toBeNull()
    expect(inline.querySelector('code.inline-code')?.textContent).toBe('(\\sqrt{2})')
    expect(visibleText(inline)).toBe('The command (\\sqrt{2}) is code, not math.')

    const fence = renderReply(
      'A sample:\n\n```latex\n(\\sqrt{2})\n(\\frac{1}{2})\n```\n\nAfter the fence.'
    )
    expect(fence.querySelector('.katex')).toBeNull()
    expect(fence.querySelector('pre code')?.textContent).toContain('(\\sqrt{2})')
    expect(fence.querySelector('pre code')?.textContent).toContain('(\\frac{1}{2})')
    expect(visibleText(fence)).toContain('(\\sqrt{2})')

    const untagged = renderReply('A sample:\n\n```\n(\\sqrt{2})\n```\n\nAfter the fence.')
    expect(untagged.querySelector('.katex')).toBeNull()
    expect(untagged.querySelector('.preformatted-text code')?.textContent).toContain('(\\sqrt{2})')

    const link = renderReply('See [the note](https://example.com/sqrt) and [docs](\\sqrt{2}).')
    expect(link.querySelector('.katex')).toBeNull()
    expect(link.querySelectorAll('a')).toHaveLength(2)
    expect(visibleText(link)).toBe('See the note and docs.')
  })
})
