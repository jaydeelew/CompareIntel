import { KATEX_COMMANDS_READER } from './implicitMathCommands'

const PLACEHOLDER_HEAD =
  /^__(?:INLINE_MATH|DISPLAY_MATH|CODE_BLOCK|HR_PLACEHOLDER)_\d+__|^[\uE000-\uE006]/

function readBalancedBraces(text: string, openBracePos: number): number | null {
  let depth = 0
  for (let i = openBracePos; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return null
}

function shouldSkipBackslash(text: string, index: number): boolean {
  if (text[index] !== '\\') return false
  const next = text[index + 1]
  if (next === '\\' || next === '$') return true
  if (next === '(' || next === '[') return true
  return false
}

function insideMarkdownLinkDestination(text: string, index: number): boolean {
  const head = text.slice(0, index)
  const destStart = head.lastIndexOf('](')
  if (destStart === -1) return false
  const between = head.slice(destStart + 2)
  if (between.includes(')')) return false
  const close = text.indexOf(')', index)
  return close !== -1
}

function readCommandAt(text: string, backslash: number): { name: string; end: number } | null {
  const tail = text.slice(backslash + 1)
  const match = tail.match(/^([A-Za-z]+)/)
  if (!match) return null
  const name = match[1]
  if (!KATEX_COMMANDS_READER.has(name)) return null
  return { name, end: backslash + 1 + name.length }
}

function extendScripts(text: string, end: number): number {
  let i = end
  while (i < text.length && (text[i] === '^' || text[i] === '_')) {
    i++
    if (i >= text.length) break
    if (text[i] === '{') {
      const close = readBalancedBraces(text, i)
      if (close === null) break
      i = close + 1
    } else if (/[0-9A-Za-z]/.test(text[i])) {
      i++
    } else {
      break
    }
  }
  return i
}

function extendSuffix(text: string, end: number): number {
  if (text[end] !== '/') return end
  const tail = text.slice(end + 1)
  const match = tail.match(/^(\d+|[A-Za-z]{1,3}|\{[^{}]*\})/)
  if (!match) return end
  return end + 1 + match[0].length
}

/** End index (exclusive) of a undelimited command starting at `backslash`, or null. */
export function scanUndelimitedLatexEnd(text: string, backslash: number): number | null {
  if (text[backslash] !== '\\') return null
  const cmd = readCommandAt(text, backslash)
  if (!cmd) return null
  let end = cmd.end
  if (text[end] === '[') {
    const closeBracket = text.indexOf(']', end)
    if (closeBracket === -1) return null
    end = closeBracket + 1
  }
  while (end < text.length && text[end] === '{') {
    const close = readBalancedBraces(text, end)
    if (close === null) return null
    end = close + 1
  }
  end = extendScripts(text, end)
  end = extendSuffix(text, end)
  return end
}

/** TeX command names that must not appear literally outside code after rendering. */
export const VISIBLE_RAW_LATEX_COMMANDS =
  /\\(?:sqrt|frac|dfrac|tfrac|cdot|times|pi|theta|alpha|beta|gamma|delta|le|ge|leq|geq|approx|sin|cos|tan|log|ln|infty|partial|nabla|sum|prod|int|left|right|mathbb|mathbf|mathrm)\b/g

export function findVisibleRawLatexCommands(prose: string): string[] {
  const found = new Set<string>()
  for (const match of prose.matchAll(VISIBLE_RAW_LATEX_COMMANDS)) {
    found.add(match[0])
  }
  if (prose.includes('\\begin{')) found.add('\\begin{')
  if (prose.includes('\\(')) found.add('\\(')
  if (prose.includes('\\[')) found.add('\\[')
  return [...found]
}

function peelNumericCoefficient(plain: string): { coeff: string; rest: string } {
  let coeff = ''
  let rest = plain
  while (rest.length > 0 && /[0-9]/.test(rest[rest.length - 1])) {
    coeff = rest[rest.length - 1] + coeff
    rest = rest.slice(0, -1)
  }
  return { coeff, rest }
}

function wrapSimpleScripts(text: string): string {
  return text.replace(
    /(?<![A-Za-z\\$])([a-z])(\^|_)(\{[^{}]+\}|\d+|[a-z])(?![A-Za-z0-9_^])/g,
    (match, base, op, script, offset, source) => {
      if (containsPlaceholderSlice(source, offset, match.length)) return match
      const lineStart = source.lastIndexOf('\n', offset) + 1
      const lineEnd = source.indexOf('\n', offset)
      const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd)
      const before = source.slice(lineStart, offset)
      const hasTex = /\\[A-Za-z]+/.test(before)
      const hasTrigEquals =
        /\b(?:tan|sin|cos)\s*\([^)]*\)\s*[=≈]/.test(line) ||
        /\b(?:tan|sin|cos)\s*\([^)]*\)\s*[=≈]/.test(before + match)
      if (!hasTex && !hasTrigEquals) return match
      return `\\(${base}${op}${script}\\)`
    }
  )
}

function containsPlaceholderSlice(source: string, offset: number, length: number): boolean {
  const slice = source.slice(offset, offset + length)
  return /__(?:INLINE_MATH|DISPLAY_MATH|CODE_BLOCK|HR_PLACEHOLDER)_\d+__|[\uE000-\uE006]/.test(slice)
}

/**
 * Wrap bare LaTeX commands in prose with `\(...\)` so KaTeX renders them.
 * Runs after math extraction placeholders are in place (code/math already protected).
 */
export function wrapUndelimitedLatexInProse(text: string): string {
  let out = ''
  let plain = ''
  let i = 0

  const flushPlain = () => {
    if (plain) {
      out += wrapSimpleScripts(plain)
      plain = ''
    }
  }

  while (i < text.length) {
    const remainder = text.slice(i)
    const ph = remainder.match(PLACEHOLDER_HEAD)
    if (ph) {
      flushPlain()
      out += ph[0]
      i += ph[0].length
      continue
    }

    if (text.slice(i, i + 2) === '\\(') {
      const close = text.indexOf('\\)', i + 2)
      if (close !== -1) {
        flushPlain()
        out += text.slice(i, close + 2)
        i = close + 2
        continue
      }
    }

    if (
      text[i] !== '\\' ||
      shouldSkipBackslash(text, i) ||
      insideMarkdownLinkDestination(text, i)
    ) {
      plain += text[i]
      i++
      continue
    }

    const end = scanUndelimitedLatexEnd(text, i)
    if (end === null) {
      plain += text[i]
      i++
      continue
    }

    const { coeff, rest } = peelNumericCoefficient(plain)
    plain = rest
    flushPlain()
    const expr = `${coeff}${text.slice(i, end)}`
    out += `\\(${expr}\\)`
    i = end
  }

  flushPlain()
  return out
}