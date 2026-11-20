import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { initializeRegistry } from '../../config/loadModelConfigs'
import {
  compareSignatures,
  renderReferenceHtml,
  signatureFromElement,
  signatureFromHtml,
} from '../../utils/__tests__/renderingAudit'
import LatexRenderer from '../LatexRenderer'

beforeAll(async () => {
  await initializeRegistry()
})

function renderSection(markdown: string): HTMLElement {
  const { container } = render(<LatexRenderer modelId="__default__">{markdown}</LatexRenderer>)
  return container.querySelector('.latex-content') as HTMLElement
}

describe('GFM footnotes and autolinks', () => {
  it('renders angle-bracket autolinks as safe anchors', () => {
    const section = 'Autolink: <https://example.com/lab-autolink>\n'
    const el = renderSection(section)
    const link = el.querySelector('a[href="https://example.com/lab-autolink"]')
    expect(link).not.toBeNull()
    expect(link?.textContent).toBe('https://example.com/lab-autolink')
    expect(el.innerHTML).not.toContain('<https://')
  })

  it('does not autolink inside inline code', () => {
    const section = 'Literal: `<https://example.com/not-a-link>`\n'
    const el = renderSection(section)
    expect(el.querySelectorAll('a[href*="not-a-link"]')).toHaveLength(0)
    expect(el.textContent).toContain('<https://example.com/not-a-link>')
  })

  it('renders GFM footnotes with back-links and keeps undefined refs literal', () => {
    const section = [
      'The boiling point needs a citation[^rare].',
      'Undefined [^missing] stays literal.',
      '',
      '[^rare]: Measured at standard pressure, 100 degrees Celsius.',
    ].join('\n')
    const el = renderSection(section)
    expect(el.querySelector('sup.footnote-ref a[href="#fn-rare"]')).not.toBeNull()
    expect(el.querySelector('#fn-rare.footnote-def')).not.toBeNull()
    expect(el.querySelector('.footnote-backref')).not.toBeNull()
    expect(el.textContent).toContain('[^missing]')
    expect(el.textContent).toContain('Measured at standard pressure')
  })

  it('renders footnotes when the definition is indented under a list item', () => {
    const section = [
      '1. **Math in Footnotes**:',
      '   The area is \\( A = \\pi r^2 \\).[^1]',
      '',
      '   [^1]: Derived from \\( \\pi \\approx 3.14 \\).',
    ].join('\n')
    const el = renderSection(section)
    expect(el.querySelector('sup.footnote-ref')).not.toBeNull()
    expect(el.textContent).not.toMatch(/\[\^1\]:/)
    expect(el.querySelector('#fn-1')).not.toBeNull()
  })

  it('matches the independent reference for the 02 autolink + footnote section', () => {
    const section = [
      '## Nested blockquote, autolink, bare URL, and a footnote',
      '',
      'Autolink: <https://example.com/lab-autolink>',
      'The method needs a citation[^fmt2].',
      '',
      '[^fmt2]: Recorded in the lab notebook, page 12.',
    ].join('\n')
    const ref = signatureFromHtml(renderReferenceHtml(section))
    const actual = signatureFromElement(renderSection(section))
    const { pass, diffs } = compareSignatures(ref, actual)
    expect(pass, JSON.stringify(diffs, null, 2)).toBe(true)
    expect(actual.linkHrefs).toContain('https://example.com/lab-autolink')
    expect(actual.linkHrefs).toContain('#fn-fmt2')
  })
})
