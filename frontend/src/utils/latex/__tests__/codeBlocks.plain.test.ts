import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { renderCodeBlock } from '../codeBlocks'

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../styles/results.css')

function codeText(html: string): string {
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
  return match?.[1] ?? ''
}

describe('renderCodeBlock plain fences', () => {
  const body = 'Before: x=10, y=20\nAfter:  x=20, y=10'

  it('renders an untagged fence as a normal code block that keeps newlines', () => {
    const html = renderCodeBlock('', body)
    expect(html).toContain('class="code-block-direct"')
    expect(html).not.toContain('preformatted-text')
    expect(html).not.toContain('#f6f8fa')
    expect(html).toContain('white-space: pre')
    expect(html).toContain('<pre ')
    expect(codeText(html)).toBe(body)
    expect(html).not.toContain('class="code-language-label"')
  })

  it.each(['text', 'plaintext'])('renders %s fences in the same shell', language => {
    const html = renderCodeBlock(language, 'alpha = $1\nbeta = $2')
    expect(html).toContain('class="code-block-direct"')
    expect(html).toContain(`data-language="${language}"`)
    expect(html).toContain('class="language-none"')
    expect(html).toContain('class="code-language-label"')
    expect(codeText(html)).toBe('alpha = $1\nbeta = $2')
    expect(html).not.toContain('katex')
  })

  it('does not let the inline-code fallback restyle fence code', () => {
    const collapsed = readFileSync(cssPath, 'utf8').replace(/\s+/g, ' ')
    const start = collapsed.indexOf('code:not(.inline-code)')
    const rule = collapsed.slice(start, collapsed.indexOf('white-space: nowrap;', start))
    expect(rule).toMatch(/:not\(\s*\.code-block-direct code\s*\)/)
    expect(rule).toMatch(/:not\(\s*\.preformatted-text code\s*\)/)
    expect(rule).toMatch(/:not\(\s*pre code\s*\)/)
  })
})
