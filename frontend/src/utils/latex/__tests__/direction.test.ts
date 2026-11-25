import { describe, expect, it } from 'vitest'

import { applyBlockDirection } from '../direction'

describe('applyBlockDirection', () => {
  it('sets dir=auto on paragraphs, list items, and table cells', () => {
    const html = applyBlockDirection(
      '<p>Hello</p><ul><li>مرحبا</li></ul><table><tr><td>שלום</td><th>Head</th></tr></table>'
    )
    expect(html).toContain('<p dir="auto">Hello</p>')
    expect(html).toContain('<li dir="auto">مرحبا</li>')
    expect(html).toContain('<td dir="auto">שלום</td>')
    expect(html).toContain('<th dir="auto">Head</th>')
    expect(html).toContain('<ul dir="auto">')
  })

  it('does not replace an existing dir and keeps inline math and code LTR', () => {
    const html = applyBlockDirection(
      '<p dir="rtl">keep</p><span class="katex">x</span><code class="inline-code">a</code><pre><code>b</code></pre>'
    )
    expect(html).toContain('<p dir="rtl">keep</p>')
    expect(html).not.toContain('dir="auto" dir="rtl"')
    expect(html).toContain('<span dir="ltr" class="katex">')
    expect(html).toContain('<code dir="ltr" class="inline-code">')
    expect(html).toContain('<pre dir="ltr">')
    expect(html).toContain('<code dir="ltr">b</code>')
  })

  it('wraps bare text that the paragraph pass left in front of an empty paragraph', () => {
    const html = applyBlockDirection(
      '<div class="mermaid-diagram" dir="ltr"></div><h2>RTL</h2>\nEnglish stays on the left.<p></p><p>مرحبا بالعالم</p>'
    )
    expect(html).toContain('<p dir="auto">English stays on the left.</p>')
    expect(html).toContain('<p dir="auto">مرحبا بالعالم</p>')
    expect(html).not.toContain('<p></p>')
  })

  it('wraps a bare paragraph after a heading so RTL under a heading gets dir=auto', () => {
    const html = applyBlockDirection(
      '<h2>Emoji, RTL</h2>\nArabic: مرحبا بالعالم<br>Chinese: 你好</p><ul><li>مرحبا</li></ul>'
    )
    expect(html).toContain('<p dir="auto">Arabic: مرحبا بالعالم<br>Chinese: 你好</p>')
    expect(html).toContain('<li dir="auto">مرحبا</li>')
    expect(html).not.toContain('بالعالم</p><p')
  })

  it('does not split inline code that follows a heading', () => {
    const html = applyBlockDirection('<h2>Rules</h2>\nMultiple horizontal rules (<code>---</code>) successfully:')
    expect(html).not.toContain('<p dir="auto">---')
    expect(html).toContain('(<code dir="ltr">---</code>)')
  })

  it('does not wrap text that already sits inside a code block', () => {
    const html = applyBlockDirection(
      '<div class="code-block-direct"><div class="code-block-header"></div>\n<pre><code>print(1)</code></pre></div>'
    )
    expect(html).toContain('<pre dir="ltr"><code dir="ltr">print(1)</code></pre>')
    expect(html).not.toContain('<p dir="auto">')
  })

  it('keeps ordered-list values and table alignment', () => {
    const html = applyBlockDirection(
      '<ol><li value="2">item</li></ol><td style="text-align:right">1</td>'
    )
    expect(html).toContain('<li dir="auto" value="2">')
    expect(html).toContain('<td dir="auto" style="text-align:right">')
  })
})
