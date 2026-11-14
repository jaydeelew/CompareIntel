import { describe, it, expect, beforeEach } from 'vitest'

import { serializeSelectionForClipboard } from '../renderedClipboard'

function selectNode(el: HTMLElement): Range {
  const range = document.createRange()
  range.selectNode(el)
  return range
}

function selectNodeContents(el: HTMLElement): Range {
  const range = document.createRange()
  range.selectNodeContents(el)
  return range
}

describe('renderedClipboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('puts KaTeX annotation source on the clipboard for inline math', () => {
    document.body.innerHTML = `
      <div id="root" class="latex-content">
        <p>inline <span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>x</mi><mo>=</mo><mn>5</mn></mrow><annotation encoding="application/x-tex">x = 5</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x=5</span></span> text</p>
      </div>
    `
    const root = document.getElementById('root') as HTMLElement
    const katex = root.querySelector('.katex') as HTMLElement
    const payload = serializeSelectionForClipboard(selectNode(katex), root)
    expect(payload?.plain).toBe('\\(x = 5\\)')
    expect(payload?.html).toContain('x = 5')
    expect(payload?.html).not.toContain('katex-mathml')
  })

  it('serializes GFM tables as TSV plain text and HTML table', () => {
    document.body.innerHTML = `
      <div id="root" class="latex-content">
        <div class="markdown-table-scroll"><table class="markdown-table">
          <tr><th>A</th><th>B</th></tr>
          <tr><td>1</td><td>2</td></tr>
        </table></div>
      </div>
    `
    const root = document.getElementById('root') as HTMLElement
    const table = root.querySelector('.markdown-table') as HTMLElement
    const payload = serializeSelectionForClipboard(selectNode(table), root)
    expect(payload?.plain).toBe('A\tB\n1\t2')
    expect(payload?.html).toContain('<table')
    expect(payload?.html).not.toContain('markdown-table-scroll')
  })

  it('returns markdown source when the full container is selected', () => {
    const md = 'Hello **world**'
    document.body.innerHTML = `<div id="root" class="latex-content"><p>Hello <strong>world</strong></p></div>`
    const root = document.getElementById('root') as HTMLElement
    const payload = serializeSelectionForClipboard(selectNodeContents(root), root, md)
    expect(payload?.plain).toBe(md)
  })

  it('decodes fenced code from data-code-base64 in a selection', () => {
    const code = "line1\nline2"
    const b64 = btoa(unescape(encodeURIComponent(code)))
    document.body.innerHTML = `
      <div id="root" class="latex-content">
        <div class="code-block-direct" data-code-base64="${b64}">
          <div class="code-block-header"><button class="code-copy-btn">Copy</button></div>
          <pre><code>highlighted</code></pre>
        </div>
      </div>
    `
    const root = document.getElementById('root') as HTMLElement
    const block = root.querySelector('.code-block-direct') as HTMLElement
    const payload = serializeSelectionForClipboard(selectNode(block), root)
    expect(payload?.plain).toBe(code)
    expect(payload?.html).not.toContain('code-copy-btn')
  })
})
