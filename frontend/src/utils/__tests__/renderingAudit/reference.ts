/**
 * Independent CommonMark/GFM + KaTeX reference.
 *
 * Does not import the product renderer, protection helpers, mathRenderer, or
 * production code-block HTML. Math delimiter policy is local:
 *   - `$$...$$`, `\[...\]`, `\(...\)` → KaTeX (skip empty/ellipsis/list-crossing)
 *   - `$...$` that is not currency → KaTeX (allowed enhancement vs CommonMark)
 *   - leftover mid-line `$$` does not pair with the next opener
 *   - a mid-line opener with a fence closer (`The formula is $$\nE\n$$`) is math
 *   - `($$)` / `($)` / `(\[ \])` / `(\( \))` are labels, not math
 * Structure (lists, emphasis, backtick pairing, GFM tables, backslash escapes)
 * comes from markdown-it's built-in rules (html/typographer off). TeX is an
 * inline rule registered before markdown-it's escape so `\,` / `\(` stay TeX
 * while a leading backtick still wins as a code span.
 */
import katex from 'katex'
import MarkdownIt from 'markdown-it'
const LITERAL = '\uE000'
const FENCE_PH = (i: number) => `%%F${i}%%`

/**
 * Annotation text compared across the reference and the product renderer.
 * Blockquote `>` markers are baked into display math when `> \[` is extracted
 * before quote stripping; GFM tables turn `\|` into `|` before KaTeX. Neither
 * is a different formula.
 */
export function normalizeComparableTex(value: string): string {
  let tex = value.replace(/\\\|/g, '|').replace(/\s+/g, ' ').trim()
  tex = tex.replace(/^(?:>\s*)+/, '').replace(/(?:\s*>)+$/, '')
  tex = tex.replace(/\}\s*>\s*/g, '} ')
  tex = tex.replace(/\\\\\s*>\s*/g, '\\\\ ')
  tex = tex.replace(/\s*>\s*(?=\\end\b)/g, ' ')
  return tex.replace(/\s+/g, ' ').trim()
}

function renderKatex(tex: string, displayMode: boolean): string {
  const source = tex.split(LITERAL).join('\\$').trim()
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    })
  } catch {
    return `<span class="katex-error">${source}</span>`
  }
}

function exampleInner(full: string): string {
  return full
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\\\(/, '')
    .replace(/\\\)$/, '')
    .replace(/^\$/, '')
    .replace(/\$$/, '')
    .trim()
}

function isEllipsisExample(full: string): boolean {
  const inner = exampleInner(full)
  return inner === '' || /^(\.{2,}|…)$/.test(inner)
}

function crossesListItem(full: string): boolean {
  return full
    .split('\n')
    .slice(1)
    .some(line => /^(?:[-*+]\s+|\d+\.\s+)/.test(line))
}

function leaveExample(full: string): string {
  return full
    .replace(/\$/g, LITERAL)
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
}

interface Fence {
  language: string
  content: string
}

function extractFences(markdown: string): { text: string; fences: Fence[] } {
  const fences: Fence[] = []
  const text = markdown.replace(
    /^[ \t]{0,3}```([a-zA-Z0-9+#-]*)[^\n]*\n([\s\S]*?)^[ \t]{0,3}```/gm,
    (_m, language: string, content: string) => {
      fences.push({ language: (language || '').trim(), content: content.replace(/^\n+|\n+$/g, '') })
      return FENCE_PH(fences.length - 1)
    }
  )
  return { text, fences }
}

function isEscaped(src: string, i: number): boolean {
  let n = 0
  for (let j = i - 1; j >= 0 && src[j] === '\\'; j--) n += 1
  return n % 2 === 1
}

function hasUnescapedDollar(inner: string): boolean {
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '$' && !isEscaped(inner, i)) return true
  }
  return false
}

function leftoverMidLineDoubleDollar(
  text: string,
  close: number,
  midLine: boolean,
  inner: string
): boolean {
  if (!midLine || !inner.includes('\n')) return false
  const closeLineEnd = text.indexOf('\n', close)
  const restOfCloseLine = text.slice(close + 2, closeLineEnd === -1 ? text.length : closeLineEnd)
  return /\S/.test(restOfCloseLine)
}

function literalizeLeftoverDollars(text: string): string {
  if (!text.includes('$$')) return text
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const lineStart = text.lastIndexOf('\n', i - 1) + 1
      const midLine = /\S/.test(text.slice(lineStart, i))
      const close = text.indexOf('$$', i + 2)
      if (close === -1) {
        out += LITERAL + LITERAL
        i += 2
        continue
      }
      const inner = text.slice(i + 2, close)
      if (
        close === i + 2 ||
        hasUnescapedDollar(inner) ||
        leftoverMidLineDoubleDollar(text, close, midLine, inner)
      ) {
        out += LITERAL + LITERAL
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

function protectParenthesizedLabels(text: string): string {
  return text
    .replace(/\(\$\$\)/g, `(${LITERAL}${LITERAL})`)
    .replace(/\(\$\)/g, `(${LITERAL})`)
    .replace(/\(\\\[\s*\\\]\)/g, match => match.replace('\\[', '[').replace('\\]', ']'))
    .replace(/\(\\\(\s*\\\)\)/g, match => match.replace('\\(', '(').replace('\\)', ')'))
}

/** Currency `$5 … $10` is not one `$...$` math span. `$5x+3$` is math. */
function isCurrencyLikeSpan(segment: string, open: number, close: number): boolean {
  const content = segment.slice(open + 1, close)
  if (!content.trim()) return true
  const opensOnDigit = /\d/.test(segment.charAt(open + 1))
  if (/\s$/.test(content) && opensOnDigit) return true
  if (/\d/.test(segment.charAt(close + 1))) return true
  const hasMathSyntax = /[\\^_=+*/<>{}]/.test(content)
  if (!hasMathSyntax && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(content)) return true
  return false
}

type MarkdownItInstance = InstanceType<typeof MarkdownIt>

/**
 * Consume TeX before markdown-it's escape rule so `\,` / `\\` stay TeX, while
 * backticks still win at a leading `` ` `` (code spans are not math).
 */
function registerTexMath(md: MarkdownItInstance): void {
  md.inline.ruler.before('escape', 'tex_math', (state, silent) => {
    const src = state.src
    const pos = state.pos
    const max = state.posMax
    if (pos >= max) return false

    const pushHtml = (html: string) => {
      const tok = state.push('html_inline', '', 0)
      tok.content = html
    }
    const pushText = (value: string) => {
      const tok = state.push('text', '', 0)
      tok.content = value
    }

    if (src.startsWith('$$', pos) && !isEscaped(src, pos)) {
      let close = -1
      for (let i = pos + 2; i < max - 1; i++) {
        if (src.startsWith('$$', i) && !isEscaped(src, i)) {
          close = i
          break
        }
      }
      if (close === -1) return false
      const inner = src.slice(pos + 2, close)
      const full = src.slice(pos, close + 2)
      if (close === pos + 2 || hasUnescapedDollar(inner)) return false
      if (!silent) {
        if (crossesListItem(full) || isEllipsisExample(full)) pushText(leaveExample(full))
        else pushHtml(renderKatex(inner, true))
      }
      state.pos = close + 2
      return true
    }

    if (src.startsWith('\\[', pos)) {
      const close = src.indexOf('\\]', pos + 2)
      if (close === -1 || close > max) return false
      const inner = src.slice(pos + 2, close)
      const full = src.slice(pos, close + 2)
      if (!silent) {
        if (crossesListItem(full) || isEllipsisExample(full)) pushText(leaveExample(full))
        else pushHtml(renderKatex(inner, true))
      }
      state.pos = close + 2
      return true
    }

    if (src.startsWith('\\(', pos)) {
      const close = src.indexOf('\\)', pos + 2)
      if (close === -1 || close > max) return false
      const inner = src.slice(pos + 2, close)
      const full = src.slice(pos, close + 2)
      if (!silent) {
        if (isEllipsisExample(full)) pushText(leaveExample(full))
        else pushHtml(renderKatex(inner, false))
      }
      state.pos = close + 2
      return true
    }

    if (src[pos] === '$' && src[pos + 1] !== '$') {
      let close = -1
      for (let i = pos + 1; i < max; i++) {
        if (src[i] === '\n') {
          const rest = src.slice(pos, max)
          if (!/\\begin\{(?:cases|align\*?|pmatrix|bmatrix|matrix|array)\}/.test(rest)) break
          continue
        }
        if (src[i] === '$' && src[i + 1] !== '$' && !isEscaped(src, i)) {
          close = i
          break
        }
      }
      if (close === -1) return false
      const inner = src.slice(pos + 1, close)
      const full = src.slice(pos, close + 1)
      // A backtick inside the candidate belongs to a code span (`uses $, like `^foo$``).
      // Returning false lets the backtick rule win instead of swallowing it as TeX.
      if (inner.includes('`')) return false
      if (isEllipsisExample(full)) {
        // Consume `$...$`. Leaving it unparsed lets the closing `$` open a new span
        // (`$...$ (e.g., $a^2$` became the TeX source `(e.g.,`).
        if (!silent) pushText(leaveExample(full))
        state.pos = close + 1
        return true
      }
      if (isCurrencyLikeSpan(src.slice(pos, Math.min(max, close + 2)), 0, close - pos)) {
        return false
      }
      const isMultilineEnv =
        full.includes('\n') &&
        /\\begin\{(?:cases|align\*?|pmatrix|bmatrix|matrix|array)\}/.test(inner)
      if (full.includes('\n') && !isMultilineEnv) return false
      if (!silent) pushHtml(renderKatex(inner, isMultilineEnv))
      state.pos = close + 1
      return true
    }

    return false
  })
}

const md = new MarkdownIt({ html: false, linkify: false, breaks: false, typographer: false })
registerTexMath(md)

export function renderReferenceHtml(markdown: string): string {
  const { text: fenced, fences } = extractFences(markdown)
  let text = protectParenthesizedLabels(fenced)
  text = literalizeLeftoverDollars(text)

  let html = md.render(text)

  const fenceHtml = (i: string) => {
    const block = fences[Number(i)]
    if (!block) return ''
    const escaped = block.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const lang = block.language ? ` class="language-${block.language}"` : ''
    return `<pre><code${lang}>${escaped}</code></pre>`
  }
  html = html.replace(/<p>%%F(\d+)%%<\/p>/g, (_m, i: string) => fenceHtml(i))
  html = html.replace(/%%F(\d+)%%/g, (_m, i: string) => fenceHtml(i))
  html = html.split(LITERAL).join('$')

  return html
}
