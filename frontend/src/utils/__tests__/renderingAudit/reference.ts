/**
 * Independent CommonMark/GFM + KaTeX reference.
 *
 * Does not import the product renderer, protection helpers, mathRenderer, or
 * production code-block HTML. Math delimiter policy is local:
 *   - `$$...$$`, `\[...\]`, `\(...\)` → KaTeX (skip empty/ellipsis/list-crossing)
 *   - `$...$` that is not currency → KaTeX (allowed enhancement vs CommonMark)
 *   - leftover mid-line `$$` does not pair with the next opener
 *   - `($$)` / `($)` / `(\[ \])` / `(\( \))` are labels, not math
 * Structure (lists, tables, emphasis, backtick pairing, backslash escapes)
 * comes from markdown-it (GFM tables, html/typographer off).
 */
import katex from 'katex'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: false, breaks: false, typographer: false })

const LITERAL = '\uE000'
const FENCE_PH = (i: number) => `%%F${i}%%`
const TABLE_PH = (i: number) => `%%T${i}%%`
const DISPLAY_PH = (i: number) => `%%D${i}%%`
const INLINE_PH = (i: number) => `%%I${i}%%`
const CODE_PH = (i: number) => `%%C${i}%%`

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

/** CommonMark §6.1 pairing, one line at a time. */
function extractInlineCode(text: string): { text: string; spans: string[] } {
  const spans: string[] = []
  const out = text
    .split('\n')
    .map(line => {
      let s = ''
      let i = 0
      while (i < line.length) {
        if (line.charCodeAt(i) !== 96) {
          s += line[i]
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
          s += line.slice(i, i + n)
          i += n
          continue
        }
        let content = line.slice(contentStart, found)
        if (content.length >= 2 && content.startsWith(' ') && content.endsWith(' ')) {
          content = content.slice(1, -1)
        }
        spans.push(content)
        s += CODE_PH(spans.length - 1)
        i = found + n
      }
      return s
    })
    .join('\n')
  return { text: out, spans }
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

function isTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line)
}

function isSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)
}

function splitCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map(c => c.trim())
}

function tablesToPlaceholders(text: string): { text: string; tables: string[] } {
  const lines = text.split('\n')
  const tables: string[] = []
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const rows = [splitCells(lines[i])]
      i += 2
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitCells(lines[i]))
        i += 1
      }
      const header = rows[0]
      const body = rows.slice(1)
      const html = [
        '<table>',
        '<thead><tr>',
        ...header.map(c => `<th>${c}</th>`),
        '</tr></thead><tbody>',
        ...body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`),
        '</tbody></table>',
      ].join('')
      tables.push(html)
      out.push(TABLE_PH(tables.length - 1))
      continue
    }
    out.push(lines[i])
    i += 1
  }
  return { text: out.join('\n'), tables }
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
      if (close === i + 2 || inner.includes('$') || (midLine && inner.includes('\n'))) {
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
  // `$`code`$` leftover after inline-code extraction is not math.
  if (/%%C\d+%%/.test(content)) return true
  const opensOnDigit = /\d/.test(segment.charAt(open + 1))
  if (/\s$/.test(content) && opensOnDigit) return true
  if (/\d/.test(segment.charAt(close + 1))) return true
  const hasMathSyntax = /[\\^_=+*/<>{}]/.test(content)
  if (!hasMathSyntax && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(content)) return true
  return false
}

function extractInlineDollarMath(text: string, inlineMath: string[]): string {
  return text
    .split('\n')
    .map(line => {
      if (!line.includes('$')) return line
      const positions: number[] = []
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '$' && line[i - 1] !== '$' && line[i + 1] !== '$') positions.push(i)
      }
      const literal = new Set<number>()
      const math: Array<{ open: number; close: number }> = []
      let k = 0
      while (k < positions.length) {
        const open = positions[k]
        const close = positions[k + 1]
        if (close === undefined) {
          literal.add(open)
          break
        }
        const full = line.slice(open, close + 1)
        if (isEllipsisExample(full) || isCurrencyLikeSpan(line, open, close)) {
          literal.add(open)
          k += 1
          continue
        }
        math.push({ open, close })
        k += 2
      }
      let out = ''
      let i = 0
      const mathAt = new Map(math.map(m => [m.open, m]))
      while (i < line.length) {
        const span = mathAt.get(i)
        if (span) {
          inlineMath.push(line.slice(span.open + 1, span.close))
          out += INLINE_PH(inlineMath.length - 1)
          i = span.close + 1
          continue
        }
        out += literal.has(i) ? LITERAL : line[i]
        i += 1
      }
      return out
    })
    .join('\n')
}

export function renderReferenceHtml(markdown: string): string {
  const { text: fenced, fences } = extractFences(markdown)
  const inline = extractInlineCode(fenced)
  let text = inline.text.replace(/(?<!\\)\\\$/g, LITERAL)
  text = protectParenthesizedLabels(text)
  text = literalizeLeftoverDollars(text)

  const display: string[] = []
  text = text.replace(/\$\$([^$]+?)\$\$/gs, (full, inner: string) => {
    if (crossesListItem(full) || isEllipsisExample(full)) return leaveExample(full)
    display.push(inner)
    return DISPLAY_PH(display.length - 1)
  })
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (full, inner: string) => {
    if (crossesListItem(full) || isEllipsisExample(full)) return leaveExample(full)
    display.push(inner)
    return DISPLAY_PH(display.length - 1)
  })

  const inlineMath: string[] = []
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (full, inner: string) => {
    if (isEllipsisExample(full)) return leaveExample(full)
    inlineMath.push(inner)
    return INLINE_PH(inlineMath.length - 1)
  })

  // Multiline `$ f(x) = \begin{cases}...\end{cases} $` is display math (GPT-5 05).
  // Same-line `$A = \begin{pmatrix}...\end{pmatrix}$` stays inline.
  text = text.replace(
    /(?<!\$)\$(?!\$)((?:[^\n$]|\n[ \t]*)*?)(\\begin\{(?:cases|align\*?|pmatrix|bmatrix|matrix|array)\}[\s\S]*?\\end\{(?:cases|align\*?|pmatrix|bmatrix|matrix|array)\})[ \t]*(?:\n[ \t]*)?\$(?!\$)/g,
    (full, prefix: string, env: string) => {
      if (!full.includes('\n')) return full
      if (/\n[ \t]*\n/.test(prefix)) return full
      display.push(`${prefix}${env}`)
      return DISPLAY_PH(display.length - 1)
    }
  )

  text = extractInlineDollarMath(text, inlineMath)

  const tabled = tablesToPlaceholders(text)
  text = tabled.text

  let html = md.render(text)
  html = html.replace(/<p>%%T(\d+)%%<\/p>/g, (_m, i: string) => tabled.tables[Number(i)] || '')
  html = html.replace(/%%T(\d+)%%/g, (_m, i: string) => tabled.tables[Number(i)] || '')
  html = html.replace(/%%C(\d+)%%/g, (_m, i: string) => {
    const content = inline.spans[Number(i)] ?? ''
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<code>${escaped}</code>`
  })

  html = html.replace(/%%D(\d+)%%/g, (_m, i: string) =>
    renderKatex(display[Number(i)] || '', true)
  )
  html = html.replace(/%%I(\d+)%%/g, (_m, i: string) =>
    renderKatex(inlineMath[Number(i)] || '', false)
  )

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
