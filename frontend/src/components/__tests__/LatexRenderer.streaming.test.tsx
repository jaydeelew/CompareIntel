/**
 * Streaming replies keep closed blocks mounted and hide unclosed delimiters.
 * A finished reply (streaming unset) still uses the single-pass renderer.
 */
import { render, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { initializeRegistry } from '../../config/loadModelConfigs'
import LatexRenderer from '../LatexRenderer'

function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml, annotation, script, style').forEach(node => node.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

describe('LatexRenderer streaming', () => {
  beforeAll(async () => {
    await initializeRegistry()
  })

  it('does not mount the streaming shell for a finished reply', () => {
    const { container } = render(
      <LatexRenderer modelId="openai/gpt-4o-mini">Hello $x$</LatexRenderer>
    )
    expect(container.querySelector('[data-streaming-render]')).toBeNull()
    expect(container.querySelector('.latex-content')).not.toBeNull()
    expect(visibleText(container)).not.toContain('$$')
  })

  it('hides an unclosed display equation and keeps the settled paragraph', () => {
    const partial = 'The quadratic formula is settled.\n\n$$\nE = mc^2'
    const { container } = render(
      <LatexRenderer modelId="openai/gpt-4o-mini" streaming>
        {partial}
      </LatexRenderer>
    )
    const root = container.querySelector('[data-streaming-render]')
    expect(root).not.toBeNull()
    const text = visibleText(root as Element)
    expect(text).toContain('The quadratic formula is settled.')
    expect(text).not.toContain('$$')
    expect(text).not.toContain('mc^2')
  })

  it('keeps the same block element when a later chunk arrives', () => {
    const open = 'The quadratic formula is settled.\n\n$$\nE = mc^2'
    const closed = 'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.'
    const { container, rerender } = render(
      <LatexRenderer modelId="openai/gpt-4o-mini" streaming>
        {open}
      </LatexRenderer>
    )
    const block = container.querySelector('[data-stream-block]')
    expect(block).not.toBeNull()

    rerender(
      <LatexRenderer modelId="openai/gpt-4o-mini" streaming>
        {closed}
      </LatexRenderer>
    )

    expect(container.querySelector('[data-stream-block]')).toBe(block)
    const text = visibleText(container)
    expect(text).toContain('Next sentence.')
    expect(text).not.toContain('$$')
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('hides an unclosed fence, a partial table, and an unclosed align environment', () => {
    const partial = [
      'Settled paragraph.',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '',
      '| Method | Result |',
      '| --- |',
      '',
      '\\begin{align}',
      'y &= 2',
    ].join('\n')
    const { container } = render(
      <LatexRenderer modelId="openai/gpt-4o-mini" streaming>
        {partial}
      </LatexRenderer>
    )
    const text = visibleText(container)
    expect(text).toContain('Settled paragraph.')
    expect(text).not.toContain('```')
    expect(text).not.toContain('graph TD')
    expect(text).not.toContain('| --- |')
    expect(text).not.toContain('\\begin')
    expect(text).not.toContain('y &=')
  })

  it('settles a closed mermaid fence without waiting for Prism', async () => {
    const closed = [
      'The quadratic formula is settled.',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
      '',
      'After the fence.',
    ].join('\n')
    const { container } = render(
      <LatexRenderer modelId="openai/gpt-4o-mini" streaming>
        {closed}
      </LatexRenderer>
    )
    await waitFor(() => {
      const blocks = Array.from(container.querySelectorAll('[data-stream-block]'))
      expect(blocks.length).toBeGreaterThan(0)
      expect(blocks.every(block => block.getAttribute('data-stream-settled') === 'true')).toBe(true)
    })
    const text = visibleText(container)
    expect(text).toContain('graph TD')
    expect(text).toContain('After the fence.')
    expect(text).not.toContain('```')
  })
})
