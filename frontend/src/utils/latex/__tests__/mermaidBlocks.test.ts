import { describe, expect, it } from 'vitest'

import { renderCodeBlock } from '../codeBlocks'
import { renderMermaidFallback } from '../mermaidBlocks'

describe('mermaid fence HTML', () => {
  it('emits a pending diagram that still carries the fence source', () => {
    const html = renderCodeBlock('mermaid', 'graph TD\n  A[Start] --> B[End]\n')
    expect(html).toContain('data-mermaid-pending="true"')
    expect(html).toContain('data-language="mermaid"')
    expect(html).toContain('class="language-mermaid"')
    expect(html).toContain('A[Start] --&gt; B[End]')
    expect(html).toContain('dir="ltr"')
  })

  it('falls back to a normal code block that keeps the language', () => {
    const html = renderMermaidFallback('not a diagram <script>')
    expect(html).toContain('data-mermaid-fallback="true"')
    expect(html).toContain('data-language="mermaid"')
    expect(html).toContain('class="language-mermaid"')
    expect(html).toContain('not a diagram &lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})
