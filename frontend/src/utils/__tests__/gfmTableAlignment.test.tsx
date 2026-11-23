import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'

import {
  compareSignatures,
  renderReferenceHtml,
  signatureFromElement,
  signatureFromHtml,
} from './renderingAudit'

const SECTION = `## Table with alignment, inline math, and a pipe
| left | center | right | pipe |
| :--- | :---: | ---: | :--- |
| $\\alpha$ | $x^2$ | $1$ | a \\| b |
`

beforeAll(async () => {
  await initializeRegistry()
})

function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml').forEach(node => node.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function renderSection(): HTMLElement {
  const { container } = render(
    <LatexRenderer modelId="anthropic/claude-haiku-4.5">{SECTION}</LatexRenderer>
  )
  return container.querySelector('.latex-content') as HTMLElement
}

describe('GFM table column alignment', () => {
  it('matches the markdown-it+KaTeX reference for the full section', () => {
    const ref = signatureFromHtml(renderReferenceHtml(SECTION))
    const actual = signatureFromElement(renderSection())
    const { pass, diffs } = compareSignatures(ref, actual)
    expect(diffs, diffs.map(d => `${d.field}: ${JSON.stringify(d.actual)}`).join('\n')).toEqual([])
    expect(pass).toBe(true)
  })

  it('renders heading, cell text, KaTeX, pipe literal, and per-column alignment', () => {
    const el = renderSection()
    const h2 = el.querySelector('h2')
    expect(h2?.textContent?.trim()).toBe('Table with alignment, inline math, and a pipe')

    const cells = Array.from(el.querySelectorAll('th, td'))
    expect(cells).toHaveLength(8)
    expect(cells.map(c => visibleText(c))).toEqual([
      'left',
      'center',
      'right',
      'pipe',
      'α',
      'x2',
      '1',
      'a | b',
    ])

    const tex = Array.from(el.querySelectorAll('annotation[encoding="application/x-tex"]')).map(n =>
      n.textContent?.trim()
    )
    expect(tex).toEqual(['\\alpha', 'x^2', '1'])

    const aligns = cells.map(c => {
      const style = (c.getAttribute('style') ?? '').replace(/\s+/g, '').toLowerCase()
      const m = style.match(/text-align:(left|center|right)/)
      return m?.[1] ?? ''
    })
    expect(aligns).toEqual(['left', 'center', 'right', 'left', 'left', 'center', 'right', 'left'])
  })

  it('leaves unaligned separator columns without text-align', () => {
    const md = `| plain | cols |
|---|---|
| a | b |`
    const { container } = render(<LatexRenderer>{md}</LatexRenderer>)
    const el = container.querySelector('.latex-content') as HTMLElement
    const cells = el.querySelectorAll('th, td')
    for (const cell of cells) {
      expect(cell.getAttribute('style') ?? '').not.toMatch(/text-align/)
    }
  })
})
