const CODE_SPAN_RE = /(<code\b[^>]*>[\s\S]*?<\/code>)/gi
const URI_AUTOLINK_RE = /<((?:https?:\/\/|mailto:)[^>\s]+)>/gi
const EMAIL_AUTOLINK_RE = /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/g

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderAutolinkAnchor(url: string, label?: string): string {
  const href = escapeHtmlAttr(url)
  const text = escapeHtmlAttr(label ?? url)
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
}

function replaceAutolinksInSegment(segment: string): string {
  let out = segment.replace(URI_AUTOLINK_RE, (_match, url: string) => renderAutolinkAnchor(url))
  out = out.replace(EMAIL_AUTOLINK_RE, (_match, email: string) =>
    renderAutolinkAnchor(`mailto:${email}`, email)
  )
  return out
}

/** CommonMark autolinks outside rendered inline code spans. */
export function replaceAutolinksOutsideCode(html: string): string {
  const parts = html.split(CODE_SPAN_RE)
  return parts
    .map((part, index) => (index % 2 === 1 ? part : replaceAutolinksInSegment(part)))
    .join('')
}