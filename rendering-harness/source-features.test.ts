import { test, expect } from '@playwright/test'
import { detectSourceFeatures } from './source-features.js'
import { validateRenderedHTML } from './dom-assertions.js'

test.describe('Source feature detection vs renderer loss', () => {
  test('detects display math, inline math, tables, links, code, currency', () => {
    const md = [
      'See [docs](https://example.com).',
      '',
      'The formula $x=1$ and',
      '$$E=mc^2$$',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      'Costs $5 today.',
      '',
      '```python',
      'price = $50',
      '```',
    ].join('\n')
    const src = detectSourceFeatures(md)
    expect(src.hasDisplayMath).toBe(true)
    expect(src.hasInlineMath).toBe(true)
    expect(src.hasTables).toBe(true)
    expect(src.hasLinks).toBe(true)
    expect(src.hasCodeBlocks).toBe(true)
    expect(src.hasCurrency).toBe(true)
    expect(src.hasCodeDollars).toBe(true)
  })

  test('nested lists require three indent levels in source', () => {
    expect(detectSourceFeatures('- a\n  - b').hasNestedLists).toBe(false)
    expect(detectSourceFeatures('- a\n  - b\n    - c').hasNestedLists).toBe(true)
  })

  test('missing source feature is not-covered, not fail', () => {
    const html = '<div>plain text, no math</div>'
    const result = validateRenderedHTML(
      html,
      { displayMath: true, noKatexErrors: true },
      'Just a prose reply with no dollars.'
    )
    expect(result.status).toBe('not-covered')
    expect(result.pass).toBe(true)
    expect(result.assertions.some(a => a.status === 'not-covered')).toBe(true)
    expect(result.assertions.some(a => a.status === 'fail')).toBe(false)
  })

  test('source had display math but DOM lost it is fail', () => {
    const html = '<div>plain text</div>'
    const result = validateRenderedHTML(
      html,
      { displayMath: true, noKatexErrors: true },
      'The identity is\n$$I = 1$$\n'
    )
    expect(result.status).toBe('fail')
    expect(result.pass).toBe(false)
    const lost = result.assertions.find(a => a.expected.includes('display math'))
    expect(lost?.status).toBe('fail')
    expect(lost?.message).toMatch(/lost it/)
  })
})
