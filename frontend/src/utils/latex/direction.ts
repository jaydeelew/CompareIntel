/**
 * Per-block direction. `dir="auto"` follows the first strong character, so an
 * Arabic or Hebrew paragraph, list item, or table cell aligns and orders as
 * RTL, while an English block stays LTR. Inline math and code carry `dir="ltr"`
 * so they are skipped by that heuristic and are not reordered inside an RTL block.
 */

const BLOCK_TAG = /<(p|li|td|th|h[1-6]|blockquote|ul|ol)\b((?![^>]*\bdir\s*=)[^>]*)>/gi

const LTR_TAG = /<(pre|code)\b((?![^>]*\bdir\s*=)[^>]*)>/gi

const KATEX_SPAN =
  /<span\b(?![^>]*\bdir\s*=)([^>]*\bclass="[^"]*\bkatex(?:-display|-html)?\b[^"]*")/gi

const LTR_DIV =
  /<div\b(?![^>]*\bdir\s*=)([^>]*\bclass="[^"]*\b(?:code-block-direct|preformatted-text|mermaid-diagram|markdown-table-scroll)\b[^"]*")/gi

const BOUNDARY_RE = /<\/(?:h[1-6]|ul|ol|blockquote|table|div|pre)[^>]*>|<hr\b[^>]*>/gi
const LOOSE_RE = /^(\s*)((?:[^<]+|<br\s*\/?>)+)/i
const STRAY_CLOSER_RE = /^(?:<\/p>|<p>\s*<\/p>)/i

/**
 * The paragraph pass leaves the first run of text after a heading (or after a
 * diagram div) as a bare text node: `</h2>\nArabic: …</p>` or
 * `</h2>\nEnglish<p></p>`. A single regex cannot wrap that run, because an
 * earlier `</div>` would swallow the heading and then skip it. Walk each
 * block boundary and wrap only the immediately following text/`<br>` run.
 */
function repairLooseParagraphs(html: string): string {
  let out = ''
  let cursor = 0
  BOUNDARY_RE.lastIndex = 0
  while (BOUNDARY_RE.exec(html)) {
    const boundaryEnd = BOUNDARY_RE.lastIndex
    out += html.slice(cursor, boundaryEnd)
    const after = html.slice(boundaryEnd)
    const loose = LOOSE_RE.exec(after)
    if (!loose || !loose[2].trim()) {
      cursor = boundaryEnd
      continue
    }
    const rest = after.slice(loose[0].length)
    const closer = STRAY_CLOSER_RE.exec(rest)
    const blockNext = /^(?:<(?:h[1-6]|ul|ol|blockquote|table|div|pre|hr)\b|$)/i.test(rest)
    const paragraphNext = /^<p\b/i.test(rest) && !closer
    // A `<code>` or `<span>` means this run is the middle of a paragraph.
    // Wrapping only the text in front of it inserts a space into `(\`---\`)`.
    if (closer || blockNext || paragraphNext) {
      // Keep the whitespace that followed the run. Trimming it removes the
      // text node between this paragraph and the next block, and a selection
      // that crosses the boundary then copies "99.99.Display".
      const trailing = /\s*$/.exec(loose[2])?.[0] ?? ''
      out += `${loose[1]}<p dir="auto">${loose[2].trim()}</p>${trailing}`
      const consumed = loose[0].length + (closer ? closer[0].length : 0)
      cursor = boundaryEnd + consumed
      BOUNDARY_RE.lastIndex = cursor
    } else {
      cursor = boundaryEnd
    }
  }
  out += html.slice(cursor)
  return out
}

/**
 * A mermaid fence leaves a stray `</p>` after the diagram (`</div></p><p>…`).
 * The parser turns that closer into an empty paragraph and drops the break,
 * so collapsed text glues `B[End]` to the next sentence. Drop the closer and
 * keep a newline. Also unwrap a diagram that is still inside `<p>…</p>`.
 */
function separateMermaidFromParagraphs(html: string): string {
  const diagram = '<div\\b[^>]*\\bclass="[^"]*\\bmermaid-diagram\\b[^"]*"[^>]*>[\\s\\S]*?<\\/div>'
  return html
    .replace(new RegExp(`<p>\\s*(${diagram})\\s*<\\/p>`, 'gi'), '$1\n')
    .replace(new RegExp(`(${diagram})\\s*<\\/p>`, 'gi'), '$1\n')
}

export function applyBlockDirection(html: string): string {
  return repairLooseParagraphs(separateMermaidFromParagraphs(html))
    .replace(BLOCK_TAG, '<$1 dir="auto"$2>')
    .replace(LTR_TAG, '<$1 dir="ltr"$2>')
    .replace(KATEX_SPAN, '<span dir="ltr"$1')
    .replace(LTR_DIV, '<div dir="ltr"$1')
}
