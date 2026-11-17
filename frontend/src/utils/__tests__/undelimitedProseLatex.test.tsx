/**
 * Undelimited LaTeX in prose must render as inline KaTeX; false-positive guards unchanged.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'
import modelConfigs from '../../config/model_renderer_configs.json'

const MODEL = 'google/gemma-3-27b-it'

const CUBE_PARAGRAPH =
  '(the height is \\sqrt{3}), and the space diagonal of a unit cube is \\sqrt{3}.'

const TRIG_LINE = 'tan(60°) = \\sqrt{3} and sin(60°) = \\sqrt{3}/2.'

function renderReply(markdown: string, modelId = MODEL): HTMLElement {
  const { container } = render(<LatexRenderer modelId={modelId}>{markdown}</LatexRenderer>)
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

function texSources(el: Element): string[] {
  return Array.from(el.querySelectorAll('annotation[encoding="application/x-tex"]')).map(
    node => node.textContent ?? ''
  )
}

beforeAll(async () => {
  await initializeRegistry()
})

describe('undelimited LaTeX in prose', () => {
  it('renders the cube diagonal paragraph with prose parentheses intact', () => {
    const el = renderReply(CUBE_PARAGRAPH)
    expect(el.querySelector('.katex-error')).toBeNull()
    expect(markedSentence(el)).toBe(
      '(the height is ⟨\\sqrt{3}⟩), and the space diagonal of a unit cube is ⟨\\sqrt{3}⟩.'
    )
    expect(visibleText(el)).toBe('(the height is 3), and the space diagonal of a unit cube is 3.')
    expect(visibleText(el)).not.toContain('\\sqrt')
  })

  it('renders the trig line including \\sqrt{3}/2', () => {
    const el = renderReply(TRIG_LINE)
    expect(texSources(el)).toEqual(expect.arrayContaining(['\\sqrt{3}', '\\sqrt{3}/2']))
    expect(visibleText(el)).toBe('tan(60°) = 3 and sin(60°) = 3/2.')
    expect(visibleText(el)).not.toMatch(/\\sqrt/)
  })

  it('renders adjacent forms 2\\sqrt{3}, \\frac{1}{2}, \\pi, \\theta, x^2, a_n in a mathy line', () => {
    const el = renderReply(
      'Values: 2\\sqrt{3}, \\frac{1}{2}, \\pi, \\theta, x^2 and a_n with tan(60°) = \\sqrt{3}.'
    )
    expect(texSources(el).length).toBeGreaterThanOrEqual(6)
    expect(visibleText(el)).not.toContain('\\frac')
    expect(visibleText(el)).not.toContain('\\sqrt')
  })

  it('keeps Gemma bare (\\sqrt{2}) regression', () => {
    const el = renderReply(
      'The square root of 2 (\\sqrt{2}) is an irrational number, meaning it cannot be expressed as a simple fraction.'
    )
    expect(markedSentence(el)).toBe(
      'The square root of 2 (⟨\\sqrt{2}⟩) is an irrational number, meaning it cannot be expressed as a simple fraction.'
    )
  })

  it('leaves currency, code, fences, paths, and regex alone', () => {
    const md = [
      'Costs $5 and $1,200.50 with shipping $3 and $4.',
      'Use `\\sqrt{x}` inline and a fence:',
      '```tex',
      '\\sqrt{x}',
      '```',
      'Path C:\\Users\\docs and capture (\\d+) (\\w+).',
    ].join('\n\n')
    const el = renderReply(md)
    expect(el.querySelector('code.inline-code')?.textContent).toBe('\\sqrt{x}')
    expect(el.querySelector('pre code')?.textContent).toContain('\\sqrt{x}')
    const prose = visibleText(el)
    const clone = el.cloneNode(true) as Element
    clone.querySelectorAll('pre, code').forEach(node => node.remove())
    const proseOnly = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
    expect(prose).toContain('$5')
    expect(proseOnly).toContain('C:\\Users\\docs')
    expect(proseOnly).toContain('(\\d+)')
    expect(texSources(el)).toEqual([])
  })

  it('does not corrupt a GFM table row', () => {
    const el = renderReply('| label | value |\n| --- | --- |\n| sqrt | \\sqrt{9} |')
    const cell = el.querySelector('td:last-child')
    expect(cell?.querySelector('.katex')).not.toBeNull()
  })
})

const SYNTHETIC_MARKDOWN = readFileSync(
  path.resolve(
    __dirname,
    '../../../../rendering-harness/fixtures/undelimited-prose-latex-response.md'
  ),
  'utf8'
)

describe('undelimited prose LaTeX uses each model renderer config', () => {
  it.each(modelConfigs.map(row => row.modelId))(
    '%s renders synthetic undelimited prose fixture without raw TeX',
    modelId => {
      const el = renderReply(SYNTHETIC_MARKDOWN, modelId)
      expect(el.querySelector('.katex-error')).toBeNull()
      const clone = el.cloneNode(true) as Element
      clone.querySelectorAll('pre, code, .katex-mathml').forEach(node => node.remove())
      const prose = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
      expect(prose).not.toMatch(/\\sqrt\b/)
      expect(prose).not.toMatch(/\\frac\b/)
      expect(texSources(el).length).toBeGreaterThanOrEqual(4)
    }
  )
})
