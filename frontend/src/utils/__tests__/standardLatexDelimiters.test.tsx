/**
 * Standard LaTeX delimiters render for every model, including dollar-only
 * configs such as Gemma 3 27B. Jack's production paragraph is the fixture.
 *
 * `\(\sqrt{2}\)` and `\[...\]` become KaTeX. Bare `(\sqrt{2})` does not:
 * convertImplicitMath skips a parenthetical that already contains `\sqrt`,
 * `\cdot`, or `\pm`, and there is no other paren-math heuristic for it.
 */
import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'
import rawConfigs from '../../config/model_renderer_configs.json'

const DOLLAR_ONLY = [
  'google/gemma-3-27b-it',
  'anthropic/claude-sonnet-4.6',
  'google/gemini-2.5-flash',
  'openai/gpt-5',
  'qwen/qwen3-coder',
] as const

/** Production sentence. The approximate value is bold, matching the phone screenshot. */
const ESCAPED_PARAGRAPH =
  'The square root of 2 \\(\\sqrt{2}\\) is an irrational number, meaning it cannot be expressed as a simple fraction. Its approximate value is **1.41421356…** The decimal representation goes on forever without repeating.'

const BARE_PARAGRAPH =
  'The square root of 2 (\\sqrt{2}) is an irrational number, meaning it cannot be expressed as a simple fraction. Its approximate value is **1.41421356…** The decimal representation goes on forever without repeating.'

const ESCAPED_VISIBLE =
  'The square root of 2 2 is an irrational number, meaning it cannot be expressed as a simple fraction. Its approximate value is 1.41421356… The decimal representation goes on forever without repeating.'

const BARE_VISIBLE =
  'The square root of 2 (\\sqrt{2}) is an irrational number, meaning it cannot be expressed as a simple fraction. Its approximate value is 1.41421356… The decimal representation goes on forever without repeating.'

function renderReply(markdown: string, modelId: string): HTMLElement {
  const { container } = render(<LatexRenderer modelId={modelId}>{markdown}</LatexRenderer>)
  return container.querySelector('.latex-content') as HTMLElement
}

/** Visible text. KaTeX MathML is dropped so the annotation source is not mixed in. */
function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml').forEach(node => node.remove())
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

describe('standard \\( \\) and \\[ \\] delimiters', () => {
  it('stores paren and bracket on every model config', () => {
    expect(rawConfigs.length).toBeGreaterThan(80)
    for (const config of rawConfigs) {
      expect(
        config.inlineMathDelimiters.map(delimiter => delimiter.name),
        config.modelId
      ).toContain('paren')
      expect(
        config.displayMathDelimiters.map(delimiter => delimiter.name),
        config.modelId
      ).toContain('bracket')
      const paren = config.inlineMathDelimiters.find(delimiter => delimiter.name === 'paren')
      expect(paren?.pattern, config.modelId).toContain('[\\s\\S]')
      expect(paren?.pattern, config.modelId).not.toContain('[^\\\\]')
    }
  })

  it.each(DOLLAR_ONLY)('renders Gemma-style \\(\\sqrt{2}\\) for %s', modelId => {
    const el = renderReply(ESCAPED_PARAGRAPH, modelId)
    expect(el.querySelector('.katex-error')).toBeNull()
    expect(texSources(el)).toEqual(['\\sqrt{2}'])
    expect(visibleText(el)).toBe(ESCAPED_VISIBLE)
    expect(el.querySelector('strong')?.textContent).toBe('1.41421356…')
    expect(visibleText(el)).not.toContain('\\sqrt')
  })

  it.each(DOLLAR_ONLY)('renders \\[ \\sqrt{2} \\] display math for %s', modelId => {
    const el = renderReply('Shown as display math:\n\n\\[\n\\sqrt{2}\n\\]', modelId)
    expect(el.querySelector('.katex-display')).not.toBeNull()
    expect(el.querySelector('.katex-error')).toBeNull()
    expect(texSources(el)).toEqual(['\\sqrt{2}'])
  })

  it('keeps money dollars, inline code, and fenced code literal for Gemma', () => {
    const markdown = [
      ESCAPED_PARAGRAPH,
      '',
      'The command `\\(\\sqrt{2}\\)` is code, and so is this fence:',
      '',
      '```latex',
      '\\(\\sqrt{2}\\)',
      '```',
      '',
      'It costs $5 and shipping is $10.',
    ].join('\n')
    const el = renderReply(markdown, 'google/gemma-3-27b-it')
    expect(texSources(el)).toEqual(['\\sqrt{2}'])
    expect(el.querySelector('code.inline-code')?.textContent).toBe('\\(\\sqrt{2}\\)')
    expect(el.querySelector('pre code')?.textContent).toContain('\\(\\sqrt{2}\\)')
    const text = visibleText(el)
    expect(text).toContain('It costs $5 and shipping is $10.')
    expect(text).toContain(ESCAPED_VISIBLE)
  })

  it('leaves bare (\\sqrt{2}) as text because the paren heuristic skips \\sqrt', () => {
    const el = renderReply(BARE_PARAGRAPH, 'google/gemma-3-27b-it')
    expect(el.querySelector('.katex')).toBeNull()
    expect(texSources(el)).toEqual([])
    expect(visibleText(el)).toBe(BARE_VISIBLE)
  })
})
