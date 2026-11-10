const BLOCKQUOTE_OPEN = '\uE010'
const BLOCKQUOTE_CLOSE = '\uE011'

const BLOCKQUOTE_STYLE =
  'margin: 0.75em 0; padding: 0.25em 1em; border-left: 4px solid rgba(127, 127, 127, 0.45); color: inherit;'

/**
 * Strip `> ` markers from runs of quoted lines and wrap each run in marker tokens. The
 * inner lines then flow through list/markdown processing like any other content, and
 * {@link renderBlockquoteMarkers} turns the markers into `<blockquote>` elements.
 */
export function markBlockquotes(text: string): string {
  return text.replace(/(?:^[ \t]{0,3}>[^\n]*(?:\n|$))+/gm, block => {
    const hasTrailingNewline = block.endsWith('\n')
    const inner = block
      .replace(/\n$/, '')
      .split('\n')
      .map(line => line.replace(/^[ \t]{0,3}> ?/, ''))
      .join('\n')
    // One marker per level so `> > nested` stays a blockquote inside the outer one.
    const nested = markBlockquotes(inner)
    return `\n${BLOCKQUOTE_OPEN}\n${nested}\n${BLOCKQUOTE_CLOSE}\n${hasTrailingNewline ? '\n' : ''}`
  })
}

function renderPairedBlockquote(inner: string): string {
  const nested = renderBlockquoteMarkers(inner.trim())
  const withBreaks = nested.replace(/([^>\s])[ \t]*\n{2,}[ \t]*(?=[^<\s])/g, '$1<br><br>')
  return (
    `\n\n<blockquote class="markdown-blockquote" style="${BLOCKQUOTE_STYLE}">` +
    withBreaks +
    '</blockquote>\n\n'
  )
}

/** Pair quote markers by depth so a nested quote is its own `<blockquote>`. */
export function renderBlockquoteMarkers(text: string): string {
  if (!text.includes(BLOCKQUOTE_OPEN)) return text
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf(BLOCKQUOTE_OPEN, i)
    if (open === -1) {
      out += text.slice(i)
      break
    }
    out += text.slice(i, open)
    let depth = 1
    let j = open + BLOCKQUOTE_OPEN.length
    while (j < text.length && depth > 0) {
      if (text.startsWith(BLOCKQUOTE_OPEN, j)) {
        depth += 1
        j += BLOCKQUOTE_OPEN.length
      } else if (text.startsWith(BLOCKQUOTE_CLOSE, j)) {
        depth -= 1
        j += BLOCKQUOTE_CLOSE.length
      } else {
        j += 1
      }
    }
    const inner = text.slice(open + BLOCKQUOTE_OPEN.length, j - BLOCKQUOTE_CLOSE.length)
    out += renderPairedBlockquote(inner)
    i = j
  }
  return out
}
