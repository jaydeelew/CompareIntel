/**
 * Mermaid fences become a diagram host. The source stays in a `<pre>` so the
 * markdown-it reference still sees the same fence text. The browser replaces
 * the host with an SVG, or with a normal code block when the diagram does not parse.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderMermaidPlaceholder(code: string): string {
  const cleaned = code.replace(/^\n+|\n+$/g, '')
  const escaped = escapeHtml(cleaned)
  return (
    '<div class="mermaid-diagram" data-language="mermaid" data-mermaid-pending="true" dir="ltr">' +
    `<pre class="mermaid-source" dir="ltr"><code class="language-mermaid" dir="ltr">${escaped}</code></pre>` +
    '</div>'
  )
}

/** Parse failure: a normal fenced block that still names the mermaid language. */
export function renderMermaidFallback(code: string): string {
  const cleaned = code.replace(/^\n+|\n+$/g, '')
  const escaped = escapeHtml(cleaned)
  return (
    '<div class="preformatted-text mermaid-fallback" data-language="mermaid" data-mermaid-fallback="true" dir="ltr" style="' +
    'background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:16px;margin:16px 0;' +
    "overflow-x:auto;font-size:14px;line-height:1.5;font-family:Consolas,Monaco,'Courier New',monospace;" +
    'white-space:pre-wrap;word-wrap:break-word;color:#1f2328;">' +
    `<pre dir="ltr" style="margin:0;"><code class="language-mermaid" dir="ltr">${escaped}</code></pre>` +
    '</div>'
  )
}
