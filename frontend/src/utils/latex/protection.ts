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

/** True if the text contains any protection token (useful for heuristics that should skip it). */
export function containsProtectedToken(text: string): boolean {
  return /[\uE000-\uE002]/.test(text)
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
  return text.split(LITERAL_DOLLAR).join('$')
}

const TABLE_ROW_RE = /^\s*\|/

/**
 * A `$` followed by a digit only opens inline math when the span to the next `$` is
 * well formed: non-empty, no whitespace just inside the closing `$`, the closing `$`
 * is not followed by a digit (as in `$5 and $10`), and the content is not prose.
 */
function isValidCurrencyLikeMathSpan(segment: string, open: number, close: number): boolean {
  const content = segment.slice(open + 1, close)
  if (!content.trim()) return false
  if (/\s$/.test(content)) return false
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
    const opensWithDigit = /\d/.test(segment.charAt(open + 1))
    if (opensWithDigit && !isValidCurrencyLikeMathSpan(segment, open, close)) {
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

/** Replace single-line backtick spans with placeholders. `spans` holds the raw content. */
export function extractInlineCode(text: string): InlineCodeExtraction {
  const spans: string[] = []
  const processed = text.replace(/`([^`\n]+?)`/g, (_match, content: string) => {
    spans.push(content)
    return `${INLINE_CODE_OPEN}${spans.length - 1}${INLINE_CODE_CLOSE}`
  })
  return { text: processed, spans }
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
