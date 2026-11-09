/**
 * Comparator must fail on real DOM corruptions, not only leftover placeholders.
 */
import { describe, expect, it } from 'vitest'

import { compareSignatures } from './compare'
import { signatureFromHtml } from './signature'

describe('compareSignatures mutation detection', () => {
  it('fails when an ordinary paragraph is deleted', () => {
    const ref = signatureFromHtml(
      '<h2>Section</h2><p>This entire ordinary paragraph should remain visible.</p>'
    )
    const actual = signatureFromHtml('<h2>Section</h2>')
    const result = compareSignatures(ref, actual)
    expect(result.pass).toBe(false)
    expect(result.diffs.some(d => d.field === 'visibleText')).toBe(true)
  })

  it('fails when fenced-code contents change', () => {
    const ref = signatureFromHtml("<pre><code>console.log('correct');</code></pre>")
    const actual = signatureFromHtml('<pre><code>THIS IS WRONG</code></pre>')
    const result = compareSignatures(ref, actual)
    expect(result.pass).toBe(false)
    expect(result.diffs.some(d => d.field === 'fencedCode')).toBe(true)
  })

  it('fails when equation x=1 is changed to x=999', () => {
    const ref = signatureFromHtml(
      '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>x</mi><mo>=</mo><mn>1</mn></mrow><annotation encoding="application/x-tex">x=1</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x=1</span></span>'
    )
    const actual = signatureFromHtml(
      '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>x</mi><mo>=</mo><mn>999</mn></mrow><annotation encoding="application/x-tex">x=999</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x=999</span></span>'
    )
    const result = compareSignatures(ref, actual)
    expect(result.pass).toBe(false)
    expect(result.diffs.some(d => d.field === 'texSources')).toBe(true)
  })

  it('fails when a list is replaced by a paragraph', () => {
    const ref = signatureFromHtml('<ul><li>alpha</li><li>beta</li></ul>')
    const actual = signatureFromHtml('<p>alpha beta</p>')
    const result = compareSignatures(ref, actual)
    expect(result.pass).toBe(false)
    expect(result.diffs.some(d => d.field === 'listItemCount')).toBe(true)
  })

  it('fails when all math is removed', () => {
    const ref = signatureFromHtml(
      '<span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow><mi>E</mi></mrow><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span></span></span><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x=1</annotation></semantics></math></span></span>'
    )
    const actual = signatureFromHtml('')
    const result = compareSignatures(ref, actual)
    expect(result.pass).toBe(false)
    expect(result.diffs.some(d => d.field === 'texSources' || d.field === 'displayMathCount')).toBe(
      true
    )
  })

  it('fails when inline table-cell code is turned into a block', () => {
    const ref = signatureFromHtml('<table><tr><td>`` <code> </code> blocks</td></tr></table>')
    const actual = signatureFromHtml(
      '<table><tr><td>`` <div class="code-block"><code> </code></div> blocks</td></tr></table>'
    )
    const result = compareSignatures(ref, actual)
    expect(result.pass).toBe(false)
    expect(result.diffs.some(d => d.field === 'blockCodeCount' || d.field === 'codeSpans')).toBe(
      true
    )
  })
})
