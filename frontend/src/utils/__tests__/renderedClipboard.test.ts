import { describe, it, expect, beforeEach } from 'vitest'

import { exportToJSON, exportToMarkdown, type ComparisonExportData } from '../export'
import { applyBlockDirection } from '../latex/direction'
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

  it('keeps a heading-boundary break in a partial copy and the source in a full copy and export', () => {
    const markdown = '## Dollar Signs\n\nPrice: $99.99.\n\n## Display math'
    const html = applyBlockDirection('<h2>Dollar Signs</h2>\nPrice: $99.99.\n<h2>Display math</h2>')
    document.body.innerHTML = `<div id="root" class="latex-content">${html}</div>`
    const root = document.getElementById('root') as HTMLElement

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let start: Text | null = null
    let end: Text | null = null
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      if (!start && node.data.includes('99.99')) start = node
      if (node.data.includes('Display')) end = node
    }
    expect(start).toBeTruthy()
    expect(end).toBeTruthy()
    const range = document.createRange()
    range.setStart(start!, start!.data.indexOf('99.99'))
    range.setEnd(end!, end!.data.indexOf('Display') + 'Display'.length)
    const partial = serializeSelectionForClipboard(range, root)
    expect(partial?.plain).toMatch(/99\.99\.\s+Display/)
    expect(partial?.plain).not.toContain('99.99.Display')

    const full = serializeSelectionForClipboard(selectNodeContents(root), root, markdown)
    expect(full?.plain).toBe(markdown)

    const data = {
      prompt: 'edge',
      timestamp: '2026-01-01T00:00:00.000Z',
      conversations: [
        {
          modelId: 'm',
          messages: [
            {
              id: 'a',
              type: 'assistant',
              content: markdown,
              timestamp: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
      models: {
        m: { id: 'm', name: 'Model', description: '', category: 'test', provider: 'Test' },
      },
    } as ComparisonExportData
    expect(exportToMarkdown(data)).toContain(markdown)
    const exported = JSON.parse(exportToJSON(data)) as {
      comparison: { conversations: Array<{ messages: Array<{ content: string }> }> }
    }
    expect(exported.comparison.conversations[0].messages[0].content).toBe(markdown)

    document.body.innerHTML = `<div id="root" class="latex-content">${applyBlockDirection(
      '<p><div class="mermaid-diagram"><pre><code>B[End]</code></pre></div></p><p>Chemistry support</p>'
    )}</div>`
    const diagramRoot = document.getElementById('root') as HTMLElement
    const diagramWalker = document.createTreeWalker(diagramRoot, NodeFilter.SHOW_TEXT)
    let diagramStart: Text | null = null
    let diagramEnd: Text | null = null
    while (diagramWalker.nextNode()) {
      const node = diagramWalker.currentNode as Text
      if (!diagramStart && node.data.includes('B[End]')) diagramStart = node
      if (node.data.includes('Chemistry')) diagramEnd = node
    }
    const diagramRange = document.createRange()
    diagramRange.setStart(diagramStart!, 0)
    diagramRange.setEnd(diagramEnd!, 'Chemistry'.length)
    const diagramCopy = serializeSelectionForClipboard(diagramRange, diagramRoot)
    expect(diagramCopy?.plain).toMatch(/B\[End\]\s+Chemistry/)
    expect(diagramCopy?.plain).not.toContain('B[End]Chemistry')
  })

  it('decodes fenced code from data-code-base64 in a selection', () => {
    const code = 'line1\nline2'
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
