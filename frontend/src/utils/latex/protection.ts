/**
 * Shared protection passes that run before math extraction so that text which only
 * looks like math delimiters (currency, escaped dollars, inline code) is never handed
 * to the per-model delimiter regexes.
 *
 * Private-use code points are used as tokens because none of the markdown, list, table
 * or math regexes in the pipeline match them.
 */

/** A dollar sign that must render as a literal `$` (escaped, currency, or unpaired). */
export const LITERAL_DOLLAR = '\uE000'

const INLINE_CODE_OPEN = '\uE001'
const INLINE_CODE_CLOSE = '\uE002'
const INLINE_CODE_PLACEHOLDER_RE = /\uE001(\d+)\uE002/g

/** `\[` / `\]` / `\(` / `\)` used as empty parenthesized delimiter labels, not math. */
export const LITERAL_DISPLAY_OPEN = '\uE003'
export const LITERAL_DISPLAY_CLOSE = '\uE004'
export const LITERAL_INLINE_OPEN = '\uE005'
export const LITERAL_INLINE_CLOSE = '\uE006'

/** True if the text contains any protection token (useful for heuristics that should skip it). */
export function containsProtectedToken(text: string): boolean {
  return /[\uE000-\uE006]/.test(text)
}

/**
 * Replace `\$` with a literal-dollar token. A `\\$` (escaped backslash followed by a
 * delimiter) is left alone.
 */
export function protectEscapedDollars(text: string): string {
  // `\$` is a literal dollar. `\\$` (escaped backslash, then a real dollar) stays.
  // `\\\$` is one literal backslash plus a literal dollar, which is what
  // markdown-it shows for a price written `\\\$1,200`.
  return text.replace(/\\\\\\\$/g, `\\${LITERAL_DOLLAR}`).replace(/(?<!\\)\\\$/g, LITERAL_DOLLAR)
}

/** Convert literal-dollar tokens inside math source back into KaTeX's `\$`. */
export function literalDollarsToLatex(latex: string): string {
  return latex.split(LITERAL_DOLLAR).join('\\$')
}

/** Convert literal-dollar tokens in final output back into `$`. */
/**
 * CommonMark-unescape leftover `\[` `\]` `\(` `\)` that were not extracted as
 * math (empty labels, ellipsis examples, list-prefixed markers). Run after
 * display/inline extraction so later list/HTML passes cannot pair them.
 */
export function unescapeLeftoverBracketParenDelimiters(text: string): string {
  return text
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
}

export function restoreLiteralDollars(text: string): string {
  return text
    .split(LITERAL_DOLLAR)
    .join('$')
    .split(LITERAL_DISPLAY_OPEN)
    .join('[')
    .split(LITERAL_DISPLAY_CLOSE)
    .join(']')
    .split(LITERAL_INLINE_OPEN)
    .join('(')
    .split(LITERAL_INLINE_CLOSE)
    .join(')')
}

/**
 * Parenthesized empty delimiter labels — `($$)`, `($)`, `(\[ \])`, `(\( \))` —
 * are documentation, not math. Grok 4.3 prompt 06 used them as bold headings;
 * the empty `$$` opened a display span that swallowed the next real `$$…$$`
 * plus following lists (KaTeX `' in math mode`, leftover `__UL_`).
 *
 * Run before display-math extraction.
 */
export function protectParenthesizedDelimiterExamples(text: string): string {
  return text
    .replace(/\(\$\$\)/g, `(${LITERAL_DOLLAR}${LITERAL_DOLLAR})`)
    .replace(/\(\$\)/g, `(${LITERAL_DOLLAR})`)
    .replace(/\(\\\[\s*\\\]\)/g, match =>
      match.replace('\\[', LITERAL_DISPLAY_OPEN).replace('\\]', LITERAL_DISPLAY_CLOSE)
    )
    .replace(/\(\\\(\s*\\\)\)/g, match =>
      match.replace('\\(', LITERAL_INLINE_OPEN).replace('\\)', LITERAL_INLINE_CLOSE)
    )
}

const TABLE_ROW_RE = /^\s*\|/

/**
 * A `$` followed by a digit only opens inline math when the span to the next `$` is
 * well formed: non-empty, and not a currency `$5 … $10` pair (closing `$` followed by
 * a digit, or trailing whitespace after a `$`+digit open). Padded math `$ f'(x) $`
 * (Qwen 04) is still math.
 */
function isValidCurrencyLikeMathSpan(segment: string, open: number, close: number): boolean {
  const content = segment.slice(open + 1, close)
  if (!content.trim()) return false
  // `$`code`$` leftover after inline-code extraction is not math (Step 5 Preview 05).
  if (content.includes(INLINE_CODE_OPEN)) return false
  const opensOnDigit = /\d/.test(segment.charAt(open + 1))
  if (/\s$/.test(content) && opensOnDigit) return false
  if (/\d/.test(segment.charAt(close + 1))) return false
  const hasMathSyntax = /[\\^_=+*/<>{}]/.test(content)
  if (!hasMathSyntax && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(content)) return false
  return true
}

function isSingleDollar(segment: string, index: number): boolean {
  return segment[index] === '$' && segment[index - 1] !== '$' && segment[index + 1] !== '$'
}

/**
 * Pair `$` delimiters within one segment (a line, or a single table cell). Any `$` that
 * cannot open a valid span is replaced with a literal-dollar token so later regexes can
 * neither pair it nor carry a span across it.
 */
function protectSegmentDollars(segment: string): string {
  const positions: number[] = []
  for (let i = 0; i < segment.length; i++) {
    if (isSingleDollar(segment, i)) positions.push(i)
  }
  if (positions.length === 0) return segment

  const literal = new Set<number>()
  let k = 0
  while (k < positions.length) {
    const open = positions[k]
    const close = positions[k + 1]
    if (close === undefined) {
      literal.add(open)
      break
    }
    if (!isValidCurrencyLikeMathSpan(segment, open, close)) {
      literal.add(open)
      k += 1
      continue
    }
    k += 2
  }

  if (literal.size === 0) return segment
  let result = ''
  for (let i = 0; i < segment.length; i++) {
    result += literal.has(i) ? LITERAL_DOLLAR : segment[i]
  }
  return result
}

/**
 * Literalize leftover empty/unpaired `$$` (delimiter examples like
 * "and $$ for display math") without touching real `$$content$$` pairs.
 *
 * A mid-line leftover `$$` must not pair with the next line's opener:
 * `use $$ as delimiter.\n\n$$E=mc^2$$` keeps two prose dollars and one
 * display equation. Same-line `$$E=mc^2$$`, block `$$\nE\n$$`, and a
 * mid-line opener with a fence closer (`The formula is $$\nE\n$$`) stay math.
 */
function leftoverMidLineDoubleDollar(
  text: string,
  _open: number,
  close: number,
  midLine: boolean,
  inner: string
): boolean {
  if (!midLine || !inner.includes('\n')) return false
  const closeLineEnd = text.indexOf('\n', close)
  const restOfCloseLine = text.slice(close + 2, closeLineEnd === -1 ? text.length : closeLineEnd)
  // A real closer sits alone at the end of its line (`\n$$`).
  // A later opener still has content on that line (`$$E=mc^2$$`).
  return /\S/.test(restOfCloseLine)
}

export function literalizeUnpairedDoubleDollars(text: string): string {
  if (!text.includes('$$')) return text
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const lineStart = text.lastIndexOf('\n', i - 1) + 1
      const midLine = /\S/.test(text.slice(lineStart, i))
      const close = text.indexOf('$$', i + 2)
      if (close === -1) {
        out += `${LITERAL_DOLLAR}${LITERAL_DOLLAR}`
        i += 2
        continue
      }
      const inner = text.slice(i + 2, close)
      if (
        close === i + 2 ||
        inner.includes('$') ||
        leftoverMidLineDoubleDollar(text, i, close, midLine, inner)
      ) {
        out += `${LITERAL_DOLLAR}${LITERAL_DOLLAR}`
        i += 2
        continue
      }
      out += text.slice(i, close + 2)
      i = close + 2
      continue
    }
    out += text[i]
    i += 1
  }
  return out
}

/**
 * Turn currency and other unpaired single `$` into literal tokens, line by line. Table
 * rows are processed cell by cell so a span never crosses a `|` boundary.
 * Run after display math (`$$`) has been extracted and before inline math extraction.
 * Leftover unpaired `$$` is literalized first so it cannot pair with a later `$$...$$`.
 */
export function protectCurrencyDollars(text: string): string {
  if (!text.includes('$')) return text
  const processed = literalizeUnpairedDoubleDollars(text)
  return processed
    .split('\n')
    .map(line => {
      if (!line.includes('$')) return line
      if (TABLE_ROW_RE.test(line)) {
        return line
          .split(/(?<!\\)(\|)/)
          .map(part => (part === '|' ? part : protectSegmentDollars(part)))
          .join('')
      }
      return protectSegmentDollars(line)
    })
    .join('\n')
}

export interface InlineCodeExtraction {
  text: string
  spans: string[]
}

function pushInlineCodeSpan(spans: string[], content: string): string {
  // CommonMark: one leading and trailing space are stripped when both are present.
  let normalized = content
  if (normalized.length >= 2 && normalized.startsWith(' ') && normalized.endsWith(' ')) {
    normalized = normalized.slice(1, -1)
  }
  spans.push(normalized)
  return `${INLINE_CODE_OPEN}${spans.length - 1}${INLINE_CODE_CLOSE}`
}

/**
 * CommonMark spec 0.31 §6.1 pairing on one inline context: a backtick
 * string of length n closes at the next backtick string of equal length.
 * Preferring `` `$` `` before the rest of the line is not CommonMark —
 * `$`100`, `$`0.99` pairs as
 * <code>$</code>100<code>, </code>$<code>0.99, or literal </code>$`
 * with leftover `$` and a trailing unmatched backtick left literal.
 *
 * Pairing is per line so a list item cannot swallow the next item (block
 * structure already split those inlines in CommonMark).
 */
function extractInlineCodeLine(line: string, spans: string[], keepTablePipes: boolean): string {
  let out = ''
  let i = 0
  while (i < line.length) {
    if (line.charCodeAt(i) !== 96) {
      out += line[i]
      i += 1
      continue
    }
    let n = 1
    while (i + n < line.length && line.charCodeAt(i + n) === 96) n += 1
    const contentStart = i + n
    let j = contentStart
    let found = -1
    while (j < line.length) {
      if (line.charCodeAt(j) !== 96) {
        j += 1
        continue
      }
      let m = 1
      while (j + m < line.length && line.charCodeAt(j + m) === 96) m += 1
      if (m === n) {
        found = j
        break
      }
      j += m
    }
    if (found === -1) {
      out += line.slice(i, i + n)
      i += n
      continue
    }
    const content = line.slice(contentStart, found)
    // On a GFM table row, markdown-it splits on `|` before it pairs backticks,
    // so a pipe inside a span is a cell break. Leave those spans in place.
    // Everywhere else the span is code: extracting it keeps `$…$` and `\|`
    // inside it from being read as math or a prose escape.
    if (keepTablePipes && content.includes('|')) {
      out += line.slice(i, found + n)
      i = found + n
      continue
    }
    out += pushInlineCodeSpan(spans, content)
    i = found + n
  }
  return out
}

/**
 * Split a GFM row on `|`, keeping `\|` as a literal pipe. Same edges as
 * markdown-it: a leading or trailing empty cell is the row's outer pipe.
 */
function endOfKatexSpan(html: string, start: number): number {
  const re = /<(\/?)span\b[^>]*>/g
  re.lastIndex = start
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    depth += match[1] === '/' ? -1 : 1
    if (depth === 0) return match.index + match[0].length
  }
  return html.length
}

export function gfmSplitRow(row: string): string[] {
  const result: string[] = []
  let pos = 0
  let lastPos = 0
  let current = ''
  while (pos < row.length) {
    // A pipe inside rendered KaTeX (the annotation of `P(A | B)`) is not a cell break.
    if (row.startsWith('<span class="katex', pos)) {
      pos = endOfKatexSpan(row, pos)
      continue
    }
    const ch = row.charCodeAt(pos)
    // `\|` stays in the cell. Collapsing it to `|` turns a double bar into a single one.
    if (ch === 124 && row[pos - 1] !== '\\') {
      result.push(current + row.substring(lastPos, pos))
      current = ''
      lastPos = pos + 1
    }
    pos += 1
  }
  result.push(current + row.substring(lastPos))
  if (result.length && result[0] === '') result.shift()
  if (result.length && result[result.length - 1] === '') result.pop()
  return result.map(cell => cell.trim())
}

/** Column count of a `|---|` separator, or null when the line is not one. */
export function gfmSeparatorCount(line: string): number | null {
  const t = line.trim()
  if (!t || /[^|\-:\s]/.test(t)) return null
  const parts = t.split('|')
  let count = 0
  for (let i = 0; i < parts.length; i++) {
    const cell = parts[i].trim()
    if (!cell) {
      if (i === 0 || i === parts.length - 1) continue
      return null
    }
    if (!/^:?-+:?$/.test(cell)) return null
    count += 1
  }
  return count > 0 ? count : null
}

/** A block that ends a GFM table the way markdown-it's terminator rules do. */
export function isGfmRowTerminator(line: string): boolean {
  const t = line.trim()
  if (/^#{1,6}(?:\s|$)/.test(t)) return true
  if (/^```/.test(t) || /^~~~/.test(t)) return true
  if (/^[ \t]{0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)) return true
  if (/^[-*•][ \t]+\S/.test(t) || /^\d+[.)][ \t]+\S/.test(t)) return true
  if (/^>/.test(t) || t.includes('\uE010')) return true
  if (/^<hr\b/i.test(t)) return true
  return false
}

/**
 * If `lines[start]` opens a GFM table, the index of the first line after it.
 * The table is the header, the separator, and following non-blank lines.
 */
export function gfmTableSpan(lines: string[], start: number): number | null {
  if (start + 1 >= lines.length) return null
  if (!lines[start].includes('|') || isGfmRowTerminator(lines[start])) return null
  const cols = gfmSeparatorCount(lines[start + 1])
  if (cols === null || gfmSplitRow(lines[start]).length !== cols) return null
  let end = start + 2
  let autocompleted = 0
  while (end < lines.length && lines[end].trim() !== '' && !isGfmRowTerminator(lines[end])) {
    autocompleted += cols - gfmSplitRow(lines[end]).length
    if (autocompleted > 65536) break
    end += 1
  }
  return end
}

/** Replace inline code spans with placeholders. `spans` holds the raw content. */
export function extractInlineCode(text: string): InlineCodeExtraction {
  const spans: string[] = []
  const lines = text.split('\n')
  // Pipes inside code count as cell breaks only on lines that are actually a table.
  const inTable = new Array<boolean>(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (inTable[i]) continue
    const end = gfmTableSpan(lines, i)
    if (end === null) continue
    for (let j = i; j < end; j++) inTable[j] = true
    i = end - 1
  }
  const textOut = lines
    .map((line, index) => extractInlineCodeLine(line, spans, inTable[index]))
    .join('\n')
  return { text: textOut, spans }
}

/**
 * CommonMark backslash-escapes in prose. Already-rendered KaTeX (including
 * its annotation source) is left untouched: `\-` inside `\\-c` is a TeX row
 * break plus a sign, not a markdown escape. Running this over the annotation
 * turned `\\-c` into `\-c` (gpt-6.1-terra 04 display matrix).
 */
export function unescapeMarkdownEscapesOutsideKatex(html: string): string {
  const unescapeChunk = (chunk: string) => chunk.replace(/\\([`*_#+\-.!|[\]()])/g, '$1')
  let out = ''
  let i = 0
  while (i < html.length) {
    const next = html.indexOf('<span class="katex', i)
    if (next === -1) {
      out += unescapeChunk(html.slice(i))
      break
    }
    out += unescapeChunk(html.slice(i, next))
    const end = endOfSpan(html, next)
    out += html.slice(next, end)
    i = end
  }
  return out
}

function endOfSpan(html: string, start: number): number {
  const re = /<(\/?)span\b[^>]*>/g
  re.lastIndex = start
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    depth += match[1] === '/' ? -1 : 1
    if (depth === 0) return match.index + match[0].length
  }
  return html.length
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderInlineCodeSpan(content: string): string {
  return `<code class="inline-code">${escapeHtml(content)}</code>`
}

/** Replace inline code placeholders with `<code>` elements. */
export function restoreInlineCode(text: string, spans: string[]): string {
  return text.replace(INLINE_CODE_PLACEHOLDER_RE, (match, index: string) => {
    const content = spans[parseInt(index, 10)]
    return content === undefined ? match : renderInlineCodeSpan(content)
  })
}

/**
 * GFM table cells unescape `\|` to `|` even inside code (spec example 200).
 * CommonMark code spans keep the backslash; only table cells strip it.
 */
export function unescapeGfmTableCellCodePipes(html: string): string {
  return html.replace(
    /<(td|th)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (_full: string, tag: string, attrs: string | undefined, inner: string) => {
      const fixed = inner.replace(
        /<code\b([^>]*)>([\s\S]*?)<\/code>/gi,
        (_m: string, codeAttrs: string, content: string) => {
          return `<code${codeAttrs}>${content.replace(/\\\|/g, '|')}</code>`
        }
      )
      return `<${tag}${attrs || ''}>${fixed}</${tag}>`
    }
  )
}
