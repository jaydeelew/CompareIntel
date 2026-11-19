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
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('renders bare https URLs as safe anchors with GFM trailing punctuation stripping', () => {
    const section = [
      'Bare URL: https://example.com/lab-bare-url/with/path',
      '',
      'Paren form (https://example.com/paren-strip/with/path).',
      '',
      'Trailing dot https://example.com/end.',
    ].join('\n')
    const el = renderSection(section)
    expect(el.querySelector('a[href="https://example.com/lab-bare-url/with/path"]')).not.toBeNull()
    expect(el.querySelector('a[href="https://example.com/paren-strip/with/path"]')).not.toBeNull()
    expect(el.textContent).toContain(').')
    expect(el.textContent).toMatch(/end\./)
    expect(el.querySelector('a[href="https://example.com/end"]')).not.toBeNull()
  })

  it('renders bare www URLs with http href', () => {
    const section = 'Registry: www.example.com/catalog\n'
    const el = renderSection(section)
    const link = el.querySelector('a[href="http://www.example.com/catalog"]')
    expect(link).not.toBeNull()
    expect(link?.textContent).toBe('www.example.com/catalog')
  })

  it('does not autolink inside inline code', () => {
    const section = 'Literal: `<https://example.com/not-a-link>`\n'
    const el = renderSection(section)
    expect(el.querySelectorAll('a[href*="not-a-link"]')).toHaveLength(0)
    expect(el.textContent).toContain('<https://example.com/not-a-link>')
  })

  it('does not autolink bare URLs inside code fences, inline code, or math', () => {
    const section = [
      'Bare ok: https://example.com/outside',
      'Code `https://example.com/in-inline-code` ok.',
      '```txt',
      'https://example.com/in-fence',
      '```',
      'Math \\( https://example.com/in-math \\) ok.',
      'Display $$ https://example.com/in-display $$',
    ].join('\n')
    const el = renderSection(section)
    expect(el.querySelector('a[href="https://example.com/outside"]')).not.toBeNull()
    expect(el.querySelectorAll('a[href="https://example.com/in-inline-code"]')).toHaveLength(0)
    expect(el.querySelectorAll('a[href="https://example.com/in-fence"]')).toHaveLength(0)
    expect(el.querySelectorAll('a[href="https://example.com/in-math"]')).toHaveLength(0)
    expect(el.querySelectorAll('a[href="https://example.com/in-display"]')).toHaveLength(0)
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

  it('matches the independent reference for the full 02 autolink + bare URL + footnote section', () => {
    const section = [
      '## Nested blockquote, autolink, bare URL, and a footnote',
      '',
      'Autolink: <https://example.com/lab-autolink>',
      'Bare URL: https://example.com/lab-bare-url/with/a/long/path',
      'Also www.example.com/path and trailing https://example.com/end.',
      'The method needs a citation[^fmt2].',
      '',
      '[^fmt2]: Recorded in the lab notebook, page 12.',
    ].join('\n')
    const ref = signatureFromHtml(renderReferenceHtml(section))
    const actual = signatureFromElement(renderSection(section))
    const { pass, diffs } = compareSignatures(ref, actual)
    expect(pass, JSON.stringify(diffs, null, 2)).toBe(true)
    expect(actual.linkHrefs).toContain('https://example.com/lab-autolink')
    expect(actual.linkHrefs).toContain('https://example.com/lab-bare-url/with/a/long/path')
    expect(actual.linkHrefs).toContain('http://www.example.com/path')
    expect(actual.linkHrefs).toContain('https://example.com/end')
    expect(actual.linkHrefs).toContain('#fn-fmt2')
  })
})
