import { test, expect } from '@playwright/test'
import { renderReferenceHtml } from '../frontend/src/utils/__tests__/renderingAudit/reference.ts'
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

  test('a column-0 pipe block inside a list is not table loss (Llama 4 Maverick 05)', () => {
    const source = [
      '2. **Tables with Mathematical Formulas**: Various formulas for reference.',
      '| Formula | Result |',
      '|---|---|',
      '| Quadratic | $x = 1$ |',
      '',
      '3. **Next item**',
    ].join('\n')
    expect(detectSourceFeatures(source).hasTables).toBe(true)
    const html = renderReferenceHtml(source)
    expect(html).not.toContain('<table')
    const result = validateRenderedHTML(html, { tables: true, noKatexErrors: true }, source)
    expect(result.assertions.filter(a => a.status === 'fail')).toEqual([])
    expect(
      result.assertions.some(a => a.status === 'not-covered' && /tables/.test(a.message))
    ).toBe(true)
    expect(result.status).not.toBe('fail')
  })

  test('dropping a block-level GFM table is still renderer loss', () => {
    const source = ['Intro.', '', '| A | B |', '|---|---|', '| 1 | 2 |', ''].join('\n')
    expect(renderReferenceHtml(source)).toContain('<table')
    const result = validateRenderedHTML('<div>Intro.</div>', { tables: true }, source)
    expect(result.status).toBe('fail')
    expect(result.assertions.some(a => a.status === 'fail' && /tables/.test(a.message))).toBe(true)
  })

  test('|x| piecewise math is not a markdown table (GLM 5 05)', () => {
    const md = [
      'The absolute value function:',
      '$$',
      '|x| =',
      '\\begin{cases}',
      'x & \\text{if } x \\geq 0 \\\\',
      '-x & \\text{if } x < 0',
      '\\end{cases}',
      '$$',
    ].join('\n')
    expect(detectSourceFeatures(md).hasTables).toBe(false)
  })

  test('nested lists require three indent levels in source', () => {
    expect(detectSourceFeatures('- a\n  - b').hasNestedLists).toBe(false)
    expect(detectSourceFeatures('- a\n  - b\n    - c').hasNestedLists).toBe(true)
  })

  test('currency $5 … $10 on one line is not swallowed as a math span (GLM 01 / Gemini 01)', () => {
    const glm = [
      'The quadratic formula is $x = 1$.',
      '',
      'The item costs $5 and the shipping is $10, for a total of $15. Budget: \\$1000 (escaped dollar).',
      'Note that $5 and the shipping is $10$ would look like math to a naive parser.',
    ].join('\n')
    const glmSrc = detectSourceFeatures(glm)
    expect(glmSrc.hasCurrency).toBe(true)
    expect(glmSrc.hasInlineMath).toBe(true)

    const gemini =
      'When writing about currency, we avoid using single dollar signs. The item costs $5 and the shipping is $10, for a total of $15. Budget: $1000.'
    const geminiSrc = detectSourceFeatures(gemini)
    expect(geminiSrc.hasCurrency).toBe(true)
    expect(geminiSrc.hasInlineMath).toBe(false)
  })

  test('CommonMark `$`100` leftover dollars are not a math span (Step 5 Preview 05)', () => {
    const line = '- Escaped currency: `$`100`, `$`0.99, or literal `$` signs'
    const src = detectSourceFeatures(line)
    expect(src.hasInlineMath).toBe(false)
    expect(src.hasDisplayMath).toBe(false)
  })

  test('$5x+3$ remains inline math, not currency', () => {
    const src = detectSourceFeatures('Solve $5x+3$ for x.')
    expect(src.hasInlineMath).toBe(true)
    expect(src.hasCurrency).toBe(false)
  })

  test('missing currency in source stays not-covered, not a forced pass', () => {
    const html =
      '<div>The quadratic is <span class="katex"><annotation encoding="application/x-tex">x = 1</annotation>x</span></div>'
    const result = validateRenderedHTML(
      html,
      { currency: true, noKatexErrors: true },
      'The quadratic formula is $x = 1$. No prices mentioned.'
    )
    expect(detectSourceFeatures('The quadratic formula is $x = 1$. No prices mentioned.').hasCurrency).toBe(
      false
    )
    expect(result.status).toBe('not-covered')
    expect(result.assertions.some(a => a.status === 'not-covered' && /currency/.test(a.message))).toBe(
      true
    )
    expect(result.assertions.some(a => a.status === 'fail')).toBe(false)
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

  test('leftover visible \\begin{cases} fails even when prompt did not require displayMath', () => {
    const source = [
      'Third section with a piecewise function: ',
      '$f(x) = \\begin{cases}',
      'x^2, & x \\ge 0 \\\\',
      '-\\,|x|, & x < 0',
      '\\end{cases}$',
    ].join('\n')
    const leftover = validateRenderedHTML(
      '<div>Third section with a piecewise function: $f(x) = \\begin{cases} x^2, &amp; x \\ge 0 \\\\ -|x|, &amp; x &lt; 0 \\end{cases}$</div>',
      { noKatexErrors: true },
      source
    )
    expect(leftover.pass).toBe(false)
    expect(leftover.status).toBe('fail')
    expect(leftover.assertions.some(a => /lost it/.test(a.message) && /cases/.test(a.message))).toBe(
      true
    )

    const rendered = validateRenderedHTML(renderReferenceHtml(source), { noKatexErrors: true }, source)
    expect(rendered.pass).toBe(true)
    expect(rendered.status).toBe('pass')
    expect(rendered.assertions.some(a => a.status === 'fail')).toBe(false)
  })

  test('parenthesized empty \\[ \\] delimiter labels are not leftover display math', () => {
    const source = '**Display math (\\[ \\]):**\n\\[E = mc^2\\]\n'
    const result = validateRenderedHTML(
      '<div><strong>Display math (\\[ \\]):</strong><span class="katex-display"><span class="katex"><annotation encoding="application/x-tex">E = mc^2</annotation><span class="katex-html">E=mc^2</span></span></span></div>',
      { noKatexErrors: true, displayMath: true },
      source
    )
    expect(result.pass).toBe(true)
    expect(result.assertions.some(a => /leftover \\\[/.test(a.message))).toBe(false)
  })

  test('leftover visible \\[ fails even when \\begin{cases} was consumed', () => {
    const source = '$$\\begin{cases}\nx^2 & x \\ge 0,\\\\[6pt]\n-x & x < 0.\n\\end{cases}$$'
    const leftover = validateRenderedHTML(
      '<div><span class="katex-display"><span class="katex-html">f(x)={ x^2 if x ≥ 0, \\[6pt] -x if x < 0.}</span></span></div>',
      { noKatexErrors: true },
      source
    )
    expect(leftover.pass).toBe(false)
    expect(leftover.status).toBe('fail')
    expect(leftover.assertions.some(a => /lost it/.test(a.message) && /\\\[/.test(a.message))).toBe(
      true
    )
  })

  test('literal \\(\\frac stays a harness fail even when some other math rendered', () => {
    const source = 'Inline \\(\\frac{1}{2}\\) and display $$E=mc^2$$.'
    const lost = validateRenderedHTML(
      '<div>Inline (\\frac{1}{2}) and display <span class="katex-display"><span class="katex"><annotation encoding="application/x-tex">E=mc^2</annotation></span></span></div>',
      { displayMath: true, inlineMath: true },
      source
    )
    expect(lost.status).toBe('fail')
    expect(lost.assertions.some(a => /lost it/.test(a.message))).toBe(true)

    const kept = validateRenderedHTML(renderReferenceHtml(source), { displayMath: true }, source)
    expect(kept.assertions.filter(a => a.status === 'fail')).toEqual([])
  })

  test('unmatched \\begin{cases} is source-issue, not an unqualified pass', () => {
    const result = validateRenderedHTML(
      '<div>raw \\begin{cases} x^2</div>',
      { noKatexErrors: true },
      'Here is a broken env: \\begin{cases}\nx^2'
    )
    expect(result.status).toBe('source-issue')
    expect(result.pass).toBe(true)
    expect(result.assertions.some(a => a.status === 'source-issue')).toBe(true)
    expect(result.assertions.some(a => a.status === 'fail')).toBe(false)
  })
})
