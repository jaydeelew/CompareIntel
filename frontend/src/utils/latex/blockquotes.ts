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
    return `\n${BLOCKQUOTE_OPEN}\n${inner}\n${BLOCKQUOTE_CLOSE}\n${hasTrailingNewline ? '\n' : ''}`
  })
}

export function renderBlockquoteMarkers(text: string): string {
  if (!text.includes(BLOCKQUOTE_OPEN)) return text
  return text.replace(
    /\s*\uE010\s*([\s\S]*?)\s*\uE011\s*/g,
    (_match, inner: string) =>
      `\n\n<blockquote class="markdown-blockquote" style="${BLOCKQUOTE_STYLE}">` +
      inner.replace(/([^>\s])[ \t]*\n{2,}[ \t]*(?=[^<\s])/g, '$1<br><br>') +
      '</blockquote>\n\n'
  )
}
