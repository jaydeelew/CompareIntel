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
  return text.replace(/(?<!\\)\\\$/g, LITERAL_DOLLAR)
}

/** Convert literal-dollar tokens inside math source back into KaTeX's `\$`. */
export function literalDollarsToLatex(latex: string): string {
  return latex.split(LITERAL_DOLLAR).join('\\$')
}

/** Convert literal-dollar tokens in final output back into `$`. */
export function restoreLiteralDollars(text: string): string {
  return text
    .split(LITERAL_DOLLAR)
    .join('$')
    .split(LITERAL_DISPLAY_OPEN)
    .join('\\[')
    .split(LITERAL_DISPLAY_CLOSE)
    .join('\\]')
    .split(LITERAL_INLINE_OPEN)
    .join('\\(')
    .split(LITERAL_INLINE_CLOSE)
    .join('\\)')
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
 * Turn currency and other unpaired single `$` into literal tokens, line by line. Table
 * rows are processed cell by cell so a span never crosses a `|` boundary.
 * Run after display math (`$$`) has been extracted and before inline math extraction.
 */
export function protectCurrencyDollars(text: string): string {
  if (!text.includes('$')) return text
  return text
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
function extractInlineCodeLine(line: string, spans: string[]): string {
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
    out += pushInlineCodeSpan(spans, content)
    i = found + n
  }
  return out
}

/** Replace inline code spans with placeholders. `spans` holds the raw content. */
export function extractInlineCode(text: string): InlineCodeExtraction {
  const spans: string[] = []
  const textOut = text
    .split('\n')
    .map(line => extractInlineCodeLine(line, spans))
    .join('\n')
  return { text: textOut, spans }
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
