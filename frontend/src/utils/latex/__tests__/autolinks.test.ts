import { describe, expect, it } from 'vitest'

import {
  linkifyWwwInHtml,
  replaceAutolinksOutsideCode,
  stripTrailingGfmUrlPunctuation,
} from '../autolinks'

describe('stripTrailingGfmUrlPunctuation', () => {
  it('strips trailing period and comma', () => {
    expect(stripTrailingGfmUrlPunctuation('https://example.com.')).toEqual({
      url: 'https://example.com',
      trailing: '.',
    })
    expect(stripTrailingGfmUrlPunctuation('https://example.com/path,')).toEqual({
      url: 'https://example.com/path',
      trailing: ',',
    })
  })

  it('strips unbalanced closing parentheses', () => {
    expect(stripTrailingGfmUrlPunctuation('https://example.com/path)')).toEqual({
      url: 'https://example.com/path',
      trailing: ')',
    })
    expect(stripTrailingGfmUrlPunctuation('https://example.com/path)')).toEqual({
      url: 'https://example.com/path',
      trailing: ')',
    })
  })
})

describe('replaceAutolinksOutsideCode', () => {
  it('linkifies bare https URLs with safe anchor attributes', () => {
    const html = '<p>Bare URL: https://example.com/lab-bare-url/with/path</p>'
    const out = replaceAutolinksOutsideCode(html)
    expect(out).toContain(
      '<a href="https://example.com/lab-bare-url/with/path" target="_blank" rel="noopener noreferrer">'
    )
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('linkifies www domains with http href', () => {
    const html = '<p>See www.example.com/foo for docs.</p>'
    const out = replaceAutolinksOutsideCode(html)
    expect(out).toContain('href="http://www.example.com/foo"')
    expect(out).toContain('www.example.com/foo</a> for docs.')
  })

  it('does not link inside inline code', () => {
    const html = '<p>Literal: <code class="inline-code">https://example.com/not-linked</code></p>'
    const out = replaceAutolinksOutsideCode(html)
    expect(out).not.toContain('<a href="https://example.com/not-linked"')
    expect(out).toContain('https://example.com/not-linked</code>')
  })

  it('does not link inside preformatted blocks', () => {
    const html = '<pre><code>curl https://example.com/no-link</code></pre>'
    const out = replaceAutolinksOutsideCode(html)
    expect(out).not.toContain('<a href')
  })

  it('does not link inside rendered KaTeX spans', () => {
    const html =
      '<p><span class="katex"><span class="katex-html">https://example.com/in-math</span></span></p>'
    const out = replaceAutolinksOutsideCode(html)
    expect(out).not.toContain('<a href="https://example.com/in-math"')
  })

  it('does not swallow list placeholders glued to a bare URL', () => {
    const html = '<p>See https://en.wikipedia.org/wiki/Quadratic_formula__OL__ rest</p>'
    const out = replaceAutolinksOutsideCode(html)
    expect(out).toContain('href="https://en.wikipedia.org/wiki/Quadratic_formula"')
    expect(out).not.toMatch(/Quadratic_formula__OL__/)
  })

  it('still converts angle-bracket autolinks', () => {
    const raw = '<p>Autolink: <https://example.com/lab-autolink></p>'
    const out = replaceAutolinksOutsideCode(raw)
    expect(out).toContain('href="https://example.com/lab-autolink"')
  })
})

describe('linkifyWwwInHtml', () => {
  it('only adds www links without touching existing anchors', () => {
    const html =
      '<p>Already <a href="https://example.com/a">https://example.com/a</a> and www.example.com/b.</p>'
    const out = linkifyWwwInHtml(html)
    expect(out.match(/<a /g)?.length).toBeGreaterThanOrEqual(2)
    expect(out).toContain('href="http://www.example.com/b"')
  })
})
