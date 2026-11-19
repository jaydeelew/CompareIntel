const FOOTNOTE_DEF_RE = /^[ \t]{0,3}\[\^([^\]]+)\]:\s*(.+)$/gm
const FOOTNOTE_REF_RE = /\[\^([^\]]+)\]/g

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function extractFootnoteDefinitions(text: string): {
  text: string
  defs: Map<string, string>
} {
  const defs = new Map<string, string>()
  const stripped = text.replace(FOOTNOTE_DEF_RE, (_, rawId: string, body: string) => {
    defs.set(rawId.toLowerCase(), body.trim())
    return ''
  })
  return { text: stripped, defs }
}

export function renderFootnotes(
  text: string,
  defs: Map<string, string>
): { text: string; footnotesHtml: string } {
  if (defs.size === 0) {
    return { text, footnotesHtml: '' }
  }

  const order: string[] = []
  const numberById = new Map<string, number>()

  const withRefs = text.replace(FOOTNOTE_REF_RE, (match, rawId: string) => {
    const id = rawId.toLowerCase()
    if (!defs.has(id)) {
      return match
    }
    if (!numberById.has(id)) {
      order.push(id)
      numberById.set(id, order.length)
    }
    const n = numberById.get(id)!
    return `<sup class="footnote-ref"><a href="#fn-${escapeHtmlAttr(rawId)}" id="fnref-${escapeHtmlAttr(rawId)}">${n}</a></sup>`
  })

  if (order.length === 0) {
    return { text: withRefs, footnotesHtml: '' }
  }

  const items = order
    .map(id => {
      const label = [...defs.keys()].find(k => k === id) ?? id
      const body = defs.get(id) ?? ''
      const n = numberById.get(id)!
      const back = `<a href="#fnref-${escapeHtmlAttr(label)}" class="footnote-backref" aria-label="Back to reference ${n}">↩</a>`
      return `<li id="fn-${escapeHtmlAttr(label)}" class="footnote-def">${body} ${back}</li>`
    })
    .join('')

  const footnotesHtml = `<section class="footnotes"><ol>${items}</ol></section>`
  return { text: withRefs, footnotesHtml }
}
