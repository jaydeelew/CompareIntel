import type { MathDelimiterPattern, ModelRendererConfig } from '../../types/rendererConfig'

import { safeRenderKatex, looksMathematical, looksProse } from './helpers'
import { LITERAL_DOLLAR } from './protection'

/** Inner of `$...$` / `$$...$$` / `\[...\]` / `\(...\)` after stripping delimiters. */
export function delimiterExampleInner(fullMatch: string): string {
  return fullMatch
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\\\(/, '')
    .replace(/\\\)$/, '')
    .replace(/^\$/, '')
    .replace(/\$$/, '')
}

/** `$...$` / `$$...$$` / `\[...\]` used as delimiter examples, not real math. */
export function isEllipsisDelimiterExample(fullMatch: string): boolean {
  const inner = delimiterExampleInner(fullMatch).trim()
  return inner === '' || /^(\.{2,}|…)$/.test(inner)
}

/**
 * A `\[...\]` / `$$...$$` span that contains a new list item is two CommonMark
 * list items, not one display-math block. Matching them anyway leaves an
 * orphan `-` from `- \[` and swallows `- \]`.
 */
export function displaySpanCrossesListItem(fullMatch: string): boolean {
  return fullMatch
    .split('\n')
    .slice(1)
    .some(line => /^(?:[-*+]\s+|\d+\.\s+)/.test(line))
}

/**
 * Keep the example visible as CommonMark text: dollars stay `$`,
 * `\[ \]` / `\(...\)` unescape to `[ ]` / `( )`.
 */
export function leaveDelimiterExample(fullMatch: string): string {
  return fullMatch
    .replace(/\$/g, LITERAL_DOLLAR)
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
}

export interface MathRendererConfig {
  displayMathDelimiters: MathDelimiterPattern[]
  inlineMathDelimiters: MathDelimiterPattern[]
  katexOptions?: ModelRendererConfig['katexOptions']
}

function delimiterKindRank(name?: MathDelimiterPattern['name']): number {
  // Outer $$ / \[ must win over inner \begin{align}. Otherwise align-env
  // (often priority 1) extracts from $$\begin{align}...\end{align}$$, then
  // $$ wraps the leftover $$__DISPLAY_MATH_0__$$ and KaTeX renders the
  // placeholder (Qwen3 Coder 01).
  if (name === 'double-dollar' || name === 'bracket') return 0
  if (name === 'align-env' || name === 'equation-env') return 2
  return 1
}

export function sortMathDelimiters(delimiters: MathDelimiterPattern[]) {
  return [...delimiters].sort((a, b) => {
    const rankA = delimiterKindRank(a.name)
    const rankB = delimiterKindRank(b.name)
    if (rankA !== rankB) return rankA - rankB
    const priorityA = a.priority ?? 999
    const priorityB = b.priority ?? 999
    return priorityA - priorityB
  })
}

function sortDelimiters(delimiters: MathDelimiterPattern[]) {
  return sortMathDelimiters(delimiters)
}

/** TeX optional row-skip after `\\`, e.g. `\\[6pt]` / `\\[0.5em]`. */
const TEX_ROW_SKIP_DIM = String.raw`\d+(?:\.\d+)?\s*(?:pt|em|ex|bp|pc|mm|cm|in|mu)`

/**
 * Collapse a provider extra backslash on `\(` `\)` `\[` `\]` so delimiters parse.
 * Do not turn array row-skip `\\[6pt]` into a display-math `\[`.
 */
export function collapseDoubleEscapedDelimiters(text: string): string {
  return text
    .replace(/\\\\(?=[()\]])/g, '\\')
    .replace(new RegExp(String.raw`\\\\(?=\[(?!\s*(?:${TEX_ROW_SKIP_DIM})\s*\]))`, 'g'), '\\')
}

/** True when `start` sits inside an unclosed $$...$$ or \[...\] span. */
export function isInsideOuterDisplayMath(text: string, start: number): boolean {
  const before = text.slice(0, start)
  const dollarPairs = before.match(/\$\$/g)
  if ((dollarPairs?.length ?? 0) % 2 === 1) return true
  // `(?<!\\)` so `\\[6pt]` row-skip is not counted as a display-math open.
  const opens = (before.match(/(?<!\\)\\\[/g) || []).length
  const closes = (before.match(/(?<!\\)\\\]/g) || []).length
  return opens > closes
}

/** True when a later delimiter would rewrite KaTeX source (annotation / error). */
export function isInsideRenderedMathHtml(text: string, start: number): boolean {
  const before = text.slice(0, start)
  if (before.lastIndexOf('<annotation') > before.lastIndexOf('</annotation>')) return true
  if (before.lastIndexOf('class="katex-error"') > before.lastIndexOf('</span>')) return true
  return false
}

function shouldSkipDisplayDelimiterMatch(
  text: string,
  start: number,
  name?: MathDelimiterPattern['name']
): boolean {
  if (isInsideRenderedMathHtml(text, start)) return true
  if ((name === 'align-env' || name === 'equation-env') && isInsideOuterDisplayMath(text, start)) {
    return true
  }
  return false
}

/**
 * Explicit KaTeX environments. Longest names first so `aligned` wins over `align`.
 * Used to recognize legitimate `$`-wrapped multiline math without pairing currency `$`.
 */
export const EXPLICIT_MATH_ENV_NAMES = [
  'aligned',
  'alignat',
  'align',
  'equation',
  'gather',
  'multline',
  'split',
  'cases',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix',
  'smallmatrix',
  'matrix',
  'array',
] as const

const EXPLICIT_ENV_NAME_ALT = EXPLICIT_MATH_ENV_NAMES.join('|')

export const EXPLICIT_MATH_ENV_RE = new RegExp(
  String.raw`\\begin\{((?:${EXPLICIT_ENV_NAME_ALT})\*?)\}([\s\S]*?)\\end\{\1\}`,
  'g'
)

export interface ExplicitMathEnvMatch {
  name: string
  start: number
  end: number
  body: string
}

export function findMatchedExplicitMathEnvs(text: string): ExplicitMathEnvMatch[] {
  const re = new RegExp(EXPLICIT_MATH_ENV_RE.source, 'g')
  const found: ExplicitMathEnvMatch[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    found.push({ name: m[1], start: m.index, end: m.index + m[0].length, body: m[0] })
  }
  return found
}

export function unmatchedExplicitMathEnvOpens(text: string): string[] {
  const covered = new Set<number>()
  for (const env of findMatchedExplicitMathEnvs(text)) {
    for (let i = env.start; i < env.end; i++) covered.add(i)
  }
  const beginRe = new RegExp(String.raw`\\begin\{((?:${EXPLICIT_ENV_NAME_ALT})\*?)\}`, 'g')
  const opens: string[] = []
  let m: RegExpExecArray | null
  while ((m = beginRe.exec(text)) !== null) {
    if (!covered.has(m.index)) opens.push(m[1])
  }
  return opens
}

function isSingleDollarChar(text: string, i: number): boolean {
  return text[i] === '$' && text[i - 1] !== '$' && text[i + 1] !== '$'
}

function isPlausibleMathPrefix(prefix: string): boolean {
  if (/\n[ \t]*\n/.test(prefix)) return false
  const trimmed = prefix.trim()
  if (/^\d/.test(trimmed)) return false
  if (prefix.includes('\n')) {
    const lines = prefix.split('\n')
    if (!lines.slice(0, -1).every(line => line.trim() === '')) return false
  }
  return true
}

/** Opening/closing single `$` around an explicit env, or null if not wrapped. */
export function wrappingSingleDollarSpan(
  text: string,
  envStart: number,
  envEnd: number
): { open: number; close: number } | null {
  let i = envStart - 1
  let sawNewline = false
  while (i >= 0) {
    const ch = text[i]
    if (ch === '$') {
      if (!isSingleDollarChar(text, i)) return null
      const prefix = text.slice(i + 1, envStart)
      if (!isPlausibleMathPrefix(prefix)) return null
      let j = envEnd
      while (j < text.length && /[ \t]/.test(text[j])) j++
      if (text[j] === '\n') {
        j++
        while (j < text.length && /[ \t]/.test(text[j])) j++
      }
      if (!isSingleDollarChar(text, j)) return null
      const suffix = text.slice(envEnd, j)
      if (suffix.replace(/[ \t\n]/g, '') !== '') return null
      if (/\n[ \t]*\n/.test(suffix)) return null
      return { open: i, close: j + 1 }
    }
    if (ch === '\n') {
      if (sawNewline) return null
      sawNewline = true
      i--
      continue
    }
    i--
  }
  return null
}

/**
 * Convert multiline `$ \begin{ENV}...\end{ENV} $` into a `$$...$$` display block.
 * Single-line `$A = \begin{pmatrix}...\end{pmatrix}$` stays inline.
 */
function extractDollarWrappedExplicitEnvs(processed: string, mathBlocks: string[]): string {
  const spans: { start: number; end: number; inner: string }[] = []
  for (const env of findMatchedExplicitMathEnvs(processed)) {
    const wrap = wrappingSingleDollarSpan(processed, env.start, env.end)
    if (!wrap) continue
    const spanText = processed.slice(wrap.open, wrap.close)
    if (!spanText.includes('\n')) continue
    const inner = processed.slice(wrap.open + 1, wrap.close - 1).trim()
    if (!inner || inner.includes('$')) continue
    spans.push({ start: wrap.open, end: wrap.close, inner })
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: typeof spans = []
  for (const span of spans) {
    if (kept.some(k => span.start >= k.start && span.end <= k.end)) continue
    kept.push(span)
  }
  for (const span of [...kept].sort((a, b) => b.start - a.start)) {
    const index = mathBlocks.length
    mathBlocks.push(`$$\n${span.inner}\n$$`)
    processed =
      processed.slice(0, span.start) + `__DISPLAY_MATH_${index}__` + processed.slice(span.end)
  }
  return processed.replace(
    /(?<!\$)\$(?!\$)[ \t]*(?:\n[ \t]*)?(__DISPLAY_MATH_(\d+)__)[ \t]*(?:\n[ \t]*)?\$(?!\$)/g,
    (full, placeholder, indexStr: string) => {
      const block = mathBlocks[Number(indexStr)]
      if (block && /\\begin\{/.test(block)) return placeholder
      return full
    }
  )
}

export function extractDisplayMath(
  text: string,
  displayMathDelimiters: MathDelimiterPattern[]
): { text: string; mathBlocks: string[] } {
  const mathBlocks: string[] = []
  const placeholderPrefix = '__DISPLAY_MATH_'
  const placeholderSuffix = '__'

  let processed = text
  const delimiters = sortDelimiters(displayMathDelimiters)

  delimiters.forEach(({ pattern, name }) => {
    processed = processed.replace(pattern, (fullMatch, ...rest) => {
      if (displaySpanCrossesListItem(fullMatch)) return fullMatch
      if (isEllipsisDelimiterExample(fullMatch)) return leaveDelimiterExample(fullMatch)
      const offset = rest[rest.length - 2]
      if (typeof offset === 'number' && shouldSkipDisplayDelimiterMatch(processed, offset, name)) {
        return fullMatch
      }
      const index = mathBlocks.length
      mathBlocks.push(fullMatch)
      return `${placeholderPrefix}${index}${placeholderSuffix}`
    })
  })

  // After $$ / \[ (and model align-env) have claimed their spans, lift
  // remaining multiline `$ \begin{cases}...\end{cases} $` as display math.
  // Do not allow all multiline `$` — currency `$5 … $10` has no env.
  processed = extractDollarWrappedExplicitEnvs(processed, mathBlocks)

  return { text: processed, mathBlocks }
}

export function restoreDisplayMath(text: string, mathBlocks: string[]): string {
  const placeholderRegex = /__DISPLAY_MATH_(\d+)__/g
  let result = text
  // Nested leftover $$__DISPLAY_MATH_0__$$ needs a second pass.
  for (let pass = 0; pass <= mathBlocks.length; pass++) {
    const next = result.replace(placeholderRegex, (_match, index) => {
      const blockIndex = parseInt(index, 10)
      if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
        return mathBlocks[blockIndex]
      }
      return _match
    })
    if (next === result) break
    result = next
  }
  return result
}

export function extractInlineMath(
  text: string,
  inlineMathDelimiters: MathDelimiterPattern[]
): { text: string; mathBlocks: string[] } {
  const mathBlocks: string[] = []
  const placeholderPrefix = '__INLINE_MATH_'
  const placeholderSuffix = '__'

  let processed = text
  const delimiters = sortDelimiters(inlineMathDelimiters)

  delimiters.forEach(({ pattern }) => {
    processed = processed.replace(pattern, fullMatch => {
      if (displaySpanCrossesListItem(fullMatch)) return fullMatch
      if (isEllipsisDelimiterExample(fullMatch)) return leaveDelimiterExample(fullMatch)
      const index = mathBlocks.length
      mathBlocks.push(fullMatch)
      return `${placeholderPrefix}${index}${placeholderSuffix}`
    })
  })

  return { text: processed, mathBlocks }
}

export function restoreInlineMath(
  text: string,
  mathBlocks: string[],
  skipInsideListPlaceholders = false
): string {
  const placeholderRegex = /__INLINE_MATH_(\d+)__/g

  if (skipInsideListPlaceholders) {
    const listPlaceholderRegex =
      /(__(?:OL|UL)_[\d_]+__[\s\S]*?__\/(?:OL|UL)__|__TASK_(?:checked|unchecked)__[\s\S]*?__\/TASK__)/g
    let result = ''
    let lastIndex = 0
    let match

    while ((match = listPlaceholderRegex.exec(text)) !== null) {
      const beforeList = text.substring(lastIndex, match.index)
      result += beforeList.replace(placeholderRegex, (_m, index) => {
        const blockIndex = parseInt(index, 10)
        if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
          return mathBlocks[blockIndex]
        }
        return _m
      })
      result += match[0]
      lastIndex = match.index + match[0].length
    }

    const afterLists = text.substring(lastIndex)
    result += afterLists.replace(placeholderRegex, (_m, index) => {
      const blockIndex = parseInt(index, 10)
      if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
        return mathBlocks[blockIndex]
      }
      return _m
    })

    return result
  }

  return text.replace(placeholderRegex, (_match, index) => {
    const blockIndex = parseInt(index, 10)
    if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
      return mathBlocks[blockIndex]
    }
    return _match
  })
}

export function preserveEquationLineBreaks(text: string): string {
  let processed = text
  let previousLength = 0
  let iterations = 0
  const maxIterations = 10

  while (previousLength !== processed.length && iterations < maxIterations) {
    previousLength = processed.length
    iterations++
    processed = processed.replace(
      /^([a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹₀-₉₁-₉]*\s*=\s*[^\n]+)\n([a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹₀-₉₁-₉]*\s*=\s*[^\n]+)$/gm,
      '$1\n\n$2'
    )
  }

  return processed
}

export function preserveMathLineBreaks(text: string): string {
  return text.replace(
    /(<\/span>(?:<\/span>)?)\s*(\n+)\s*(<span class="katex(?:-display)?")/g,
    (fullMatch, closing, newlines, opening) => {
      const closingIsDisplay = closing === '</span></span>'
      const openingIsDisplay = opening.includes('katex-display')

      if (closingIsDisplay || openingIsDisplay) {
        return fullMatch
      }

      const newlineCount = newlines.length
      if (newlineCount === 1) {
        return `${closing}<br>${opening}`
      }
      return `${closing}<br>\n${opening}`
    }
  )
}

export function renderMathContent(text: string, config: MathRendererConfig): string {
  let rendered = text
  const displayDelimiters = sortDelimiters(config.displayMathDelimiters)
  const inlineDelimiters = sortDelimiters(config.inlineMathDelimiters)
  let renderedFromDelimiters = false

  // Process delimiter-based math FIRST - this ensures \( \displaystyle ... \), \( \frac{}{} \), etc.
  // are rendered correctly. Ad-hoc patterns below (e.g. standalone \displaystyle, ^x =) must run
  // AFTER so they don't steal/corrupt content that belongs to delimited math.
  displayDelimiters.forEach(({ pattern, name }) => {
    rendered = rendered.replace(pattern, (fullMatch, math, ...rest) => {
      const offset = rest[rest.length - 2]
      if (typeof offset === 'number' && shouldSkipDisplayDelimiterMatch(rendered, offset, name)) {
        return fullMatch
      }
      renderedFromDelimiters = true
      const body = typeof math === 'string' ? math : fullMatch
      return safeRenderKatex(body, true, config.katexOptions)
    })
  })

  inlineDelimiters.forEach(({ pattern }) => {
    rendered = rendered.replace(pattern, (_match, math) => {
      renderedFromDelimiters = true
      return safeRenderKatex(math, false, config.katexOptions)
    })
  })

  // If we successfully rendered any delimiter-based math, stop here.
  // The ad-hoc regex passes below are intended for naked math fallback and can
  // inadvertently mutate already-rendered KaTeX/MathML structure.
  if (renderedFromDelimiters) {
    return rendered
  }

  // Protect KaTeX MathML annotation blocks from subsequent regex-based post-processing.
  // These blocks intentionally contain raw LaTeX source, and mutating them can corrupt
  // rendered output structure in the browser.
  const annotationBlocks: string[] = []
  rendered = rendered.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, match => {
    const idx = annotationBlocks.length
    annotationBlocks.push(match)
    return `__KATEX_ANNOTATION_${idx}__`
  })

  // Ad-hoc patterns for naked math (no delimiters) - run after delimiter processing
  rendered = rendered.replace(
    /\\displaystyle\s+(.+?)(\n+|$)/g,
    (_match, expression, newlines, offset, fullText) => {
      // Skip if this \displaystyle is inside inline delimiters like \( ... \)
      // (that case should be handled by delimiter-based rendering above).
      const before = fullText.substring(0, offset)
      const lastInlineOpen = Math.max(before.lastIndexOf('\\('), before.lastIndexOf('\\\\('))
      const lastInlineClose = Math.max(before.lastIndexOf('\\)'), before.lastIndexOf('\\\\)'))
      if (lastInlineOpen > lastInlineClose) {
        return _match
      }

      const alreadyRendered =
        expression.includes('<span class="katex">') || expression.includes('katex')
      if (!alreadyRendered) {
        const clean = expression
          .replace(/<[^>]*>/g, '')
          .replace(/style="[^"]*"/g, '')
          .replace(/\.?\s*$/, '')
          .trim()
        if (clean) {
          const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
          return safeRenderKatex(clean, true, config.katexOptions) + newlineHtml
        }
      }
      return _match
    }
  )

  rendered = rendered.replace(/^x\s*=\s*(.+?)(\n+|$)/gm, (_match, rightSide, newlines) => {
    const fullExpression = `x = ${rightSide}`
    const hasLatexCommands =
      /\\(sqrt|frac|cdot|times|pm|neq|leq|geq|alpha|beta|gamma|pi|theta|infty|partial)/.test(
        fullExpression
      )
    const alreadyRendered =
      fullExpression.includes('<span class="katex">') || fullExpression.includes('katex')
    const hasConnectors = /\s+(or|and)\s+/i.test(fullExpression)

    if (!alreadyRendered && hasConnectors) {
      const parts = fullExpression.split(/\s+(or|and)\s+/i)
      const result: string[] = []
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim()
        if (/^(or|and)$/i.test(part)) {
          result.push(` ${part} `)
        } else if (part && (looksMathematical(part) || hasLatexCommands)) {
          result.push(safeRenderKatex(part, false, config.katexOptions))
        } else {
          result.push(part)
        }
      }
      const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
      return result.join('') + newlineHtml
    }

    if (
      !alreadyRendered &&
      (looksMathematical(fullExpression) || hasLatexCommands) &&
      !looksProse(fullExpression)
    ) {
      const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
      return safeRenderKatex(fullExpression, false, config.katexOptions) + newlineHtml
    }
    return _match
  })

  rendered = rendered.replace(
    /^([a-zA-Z]+[₀-₉₁-₉]*\s*=\s*[^=\n<]+?)(\n+|$)/gm,
    (_match, expression, newlines) => {
      const hasLatexCommands =
        /\\(sqrt|frac|cdot|times|pm|neq|leq|geq|alpha|beta|gamma|pi|theta|infty|partial)/.test(
          expression
        )
      const alreadyRendered =
        expression.includes('<span class="katex">') || expression.includes('katex')
      const hasConnectors = /\s+(or|and)\s+/i.test(expression)

      if (!alreadyRendered && hasConnectors) {
        const parts = expression.split(/\s+(or|and)\s+/i)
        const result: string[] = []
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i].trim()
          if (/^(or|and)$/i.test(part)) {
            result.push(` ${part} `)
          } else if (part && (looksMathematical(part) || hasLatexCommands)) {
            result.push(safeRenderKatex(part, false, config.katexOptions))
          } else {
            result.push(part)
          }
        }
        const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
        return result.join('') + newlineHtml
      }

      const proseInParensMatch = expression.match(/\(([^)]+)\)/)
      if (!alreadyRendered && proseInParensMatch) {
        const parenContent = proseInParensMatch[1]
        if (looksProse(parenContent)) {
          const parts: string[] = []
          let lastIndex = 0
          let match
          const parenRegex = /\(([^)]+)\)/g

          while ((match = parenRegex.exec(expression)) !== null) {
            const beforeParen = expression.substring(lastIndex, match.index)
            if (beforeParen.trim()) {
              const trimmedBefore = beforeParen.trim()
              if (looksMathematical(trimmedBefore) || hasLatexCommands) {
                const leadingSpace = beforeParen.match(/^(\s*)/)?.[1] || ''
                const trailingSpace = beforeParen.match(/(\s*)$/)?.[1] || ''
                parts.push(
                  leadingSpace +
                    safeRenderKatex(trimmedBefore, false, config.katexOptions) +
                    trailingSpace
                )
              } else {
                parts.push(beforeParen)
              }
            } else if (beforeParen) {
              parts.push(beforeParen)
            }
            parts.push(`(${match[1]})`)
            lastIndex = match.index + match[0].length
          }

          const afterLastParen = expression.substring(lastIndex)
          if (afterLastParen.trim()) {
            const trimmedAfter = afterLastParen.trim()
            if (looksMathematical(trimmedAfter) || hasLatexCommands) {
              const leadingSpace = afterLastParen.match(/^(\s*)/)?.[1] || ''
              const trailingSpace = afterLastParen.match(/(\s*)$/)?.[1] || ''
              parts.push(
                leadingSpace +
                  safeRenderKatex(trimmedAfter, false, config.katexOptions) +
                  trailingSpace
              )
            } else {
              parts.push(afterLastParen)
            }
          } else if (afterLastParen) {
            parts.push(afterLastParen)
          }

          const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
          return parts.join('') + newlineHtml
        }
      }

      if (
        !alreadyRendered &&
        (looksMathematical(expression) || hasLatexCommands) &&
        !looksProse(expression)
      ) {
        const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
        return safeRenderKatex(expression, false, config.katexOptions) + newlineHtml
      }
      return _match
    }
  )

  rendered = rendered.replace(
    /(\d+\([^)]+\)[²³⁴⁵⁶⁷⁸⁹⁰¹]?\s*[-+]\s*\d+\([^)]+\)\s*[-+]\s*\d+\s*=\s*[^=\n<]+)/g,
    (_match, mathExpression) => {
      const alreadyRendered =
        mathExpression.includes('<span class="katex">') || mathExpression.includes('katex')
      if (!alreadyRendered && looksMathematical(mathExpression)) {
        return safeRenderKatex(mathExpression, false, config.katexOptions)
      }
      return _match
    }
  )

  // Undelimited `\sqrt` / `\frac` stay as CommonMark text. Wrapping them as
  // KaTeX is a custom recovery, not `$...$` math enhancement.

  const processBoxed = (t: string): string => {
    let result = ''
    let i = 0
    while (i < t.length) {
      if (t.substring(i).startsWith('\\boxed{')) {
        const beforeMatch = t.substring(0, i)
        const lastKatexStart = beforeMatch.lastIndexOf('<span class="katex">')
        const lastKatexEnd = beforeMatch.lastIndexOf('</span>')
        if (lastKatexStart > lastKatexEnd) {
          result += t[i]
          i++
          continue
        }
        let braceCount = 1
        const contentStart = i + 7
        let contentEnd = contentStart
        while (braceCount > 0 && contentEnd < t.length) {
          if (t[contentEnd] === '{') braceCount++
          else if (t[contentEnd] === '}') braceCount--
          contentEnd++
        }
        if (braceCount === 0) {
          const content = t.substring(contentStart, contentEnd - 1)
          const cleanContent = content
            .replace(/<[^>]*>/g, '')
            .replace(/\\\(\s*([^\\]+?)\s*\\\)/g, '$1')
            .trim()
          result += safeRenderKatex(`\\boxed{${cleanContent}}`, false, config.katexOptions)
          i = contentEnd
        } else {
          result += t[i]
          i++
        }
      } else {
        result += t[i]
        i++
      }
    }
    return result
  }

  rendered = processBoxed(rendered)

  const symbols = [
    { pattern: /\\cdot/g, latex: '\\cdot' },
    { pattern: /\\times/g, latex: '\\times' },
    { pattern: /\\div/g, latex: '\\div' },
    { pattern: /\\pm/g, latex: '\\pm' },
    { pattern: /\\mp/g, latex: '\\mp' },
    { pattern: /\\leq/g, latex: '\\leq' },
    { pattern: /\\geq/g, latex: '\\geq' },
    { pattern: /\\neq/g, latex: '\\neq' },
    { pattern: /\\approx/g, latex: '\\approx' },
    { pattern: /\\equiv/g, latex: '\\equiv' },
    { pattern: /\\sim/g, latex: '\\sim' },
    { pattern: /\\infty/g, latex: '\\infty' },
    { pattern: /\\partial/g, latex: '\\partial' },
    { pattern: /\\nabla/g, latex: '\\nabla' },
    { pattern: /\\emptyset/g, latex: '\\emptyset' },
    { pattern: /\\in/g, latex: '\\in' },
    { pattern: /\\notin/g, latex: '\\notin' },
    { pattern: /\\subset/g, latex: '\\subset' },
    { pattern: /\\supset/g, latex: '\\supset' },
    { pattern: /\\cup/g, latex: '\\cup' },
    { pattern: /\\cap/g, latex: '\\cap' },
    { pattern: /\\rightarrow/g, latex: '\\rightarrow' },
    { pattern: /\\leftarrow/g, latex: '\\leftarrow' },
    { pattern: /\\Rightarrow/g, latex: '\\Rightarrow' },
    { pattern: /\\Leftarrow/g, latex: '\\Leftarrow' },
    { pattern: /\\alpha/g, latex: '\\alpha' },
    { pattern: /\\beta/g, latex: '\\beta' },
    { pattern: /\\gamma/g, latex: '\\gamma' },
    { pattern: /\\delta/g, latex: '\\delta' },
    { pattern: /\\epsilon/g, latex: '\\epsilon' },
    { pattern: /\\zeta/g, latex: '\\zeta' },
    { pattern: /\\eta/g, latex: '\\eta' },
    { pattern: /\\theta/g, latex: '\\theta' },
    { pattern: /\\iota/g, latex: '\\iota' },
    { pattern: /\\kappa/g, latex: '\\kappa' },
    { pattern: /\\lambda/g, latex: '\\lambda' },
    { pattern: /\\mu/g, latex: '\\mu' },
    { pattern: /\\nu/g, latex: '\\nu' },
    { pattern: /\\xi/g, latex: '\\xi' },
    { pattern: /\\pi/g, latex: '\\pi' },
    { pattern: /\\rho/g, latex: '\\rho' },
    { pattern: /\\sigma/g, latex: '\\sigma' },
    { pattern: /\\tau/g, latex: '\\tau' },
    { pattern: /\\upsilon/g, latex: '\\upsilon' },
    { pattern: /\\phi/g, latex: '\\phi' },
    { pattern: /\\chi/g, latex: '\\chi' },
    { pattern: /\\psi/g, latex: '\\psi' },
    { pattern: /\\omega/g, latex: '\\omega' },
    { pattern: /\\Gamma/g, latex: '\\Gamma' },
    { pattern: /\\Delta/g, latex: '\\Delta' },
    { pattern: /\\Theta/g, latex: '\\Theta' },
    { pattern: /\\Lambda/g, latex: '\\Lambda' },
    { pattern: /\\Xi/g, latex: '\\Xi' },
    { pattern: /\\Pi/g, latex: '\\Pi' },
    { pattern: /\\Sigma/g, latex: '\\Sigma' },
    { pattern: /\\Upsilon/g, latex: '\\Upsilon' },
    { pattern: /\\Phi/g, latex: '\\Phi' },
    { pattern: /\\Psi/g, latex: '\\Psi' },
    { pattern: /\\Omega/g, latex: '\\Omega' },
  ]

  // Skip replacement when inside KaTeX annotation (contains raw LaTeX - would corrupt structure)
  const isInsideAnnotation = (str: string, pos: number): boolean => {
    const before = str.substring(0, pos)
    const lastOpen = before.lastIndexOf('<annotation')
    const lastClose = before.lastIndexOf('</annotation>')
    return lastOpen > lastClose && lastOpen !== -1
  }

  symbols.forEach(({ pattern, latex }) => {
    const symbolRegex = new RegExp(pattern.source, pattern.flags)
    let symbolMatch
    const symbolReplacements: Array<{ start: number; end: number; replacement: string }> = []
    while ((symbolMatch = symbolRegex.exec(rendered)) !== null) {
      const start = symbolMatch.index
      const end = start + symbolMatch[0].length
      const beforeMatch = rendered.substring(0, start)
      const lastKatexStart = beforeMatch.lastIndexOf('<span class="katex">')
      const lastKatexEnd = beforeMatch.lastIndexOf('</span>')
      const backticksBefore = (beforeMatch.match(/`/g) || []).length
      if (backticksBefore % 2 === 1) continue
      if (isInsideAnnotation(rendered, start)) continue
      if (lastKatexStart <= lastKatexEnd) {
        symbolReplacements.push({
          start,
          end,
          replacement: safeRenderKatex(latex, false, config.katexOptions),
        })
      }
    }
    symbolReplacements.reverse().forEach(({ start, end, replacement }) => {
      rendered = rendered.substring(0, start) + replacement + rendered.substring(end)
    })
  })

  const processDerivativePlaceholders = (t: string): string => {
    let result = t
    const derivativeRegex = /⟨⟨DERIVATIVE_([a-zA-Z])⟩⟩/g
    let match
    const replacements: Array<{ start: number; end: number; replacement: string }> = []
    while ((match = derivativeRegex.exec(result)) !== null) {
      const placeholderStart = match.index
      const placeholderEnd = placeholderStart + match[0].length
      const variable = match[1]
      const afterPlaceholder = result.substring(placeholderEnd)
      if (afterPlaceholder.startsWith('(')) {
        let depth = 0
        let i = 0
        for (i = 0; i < afterPlaceholder.length; i++) {
          if (afterPlaceholder[i] === '(') depth++
          if (afterPlaceholder[i] === ')') {
            depth--
            if (depth === 0) {
              const expression = afterPlaceholder.substring(1, i)
              replacements.push({
                start: placeholderStart,
                end: placeholderEnd + i + 1,
                replacement: safeRenderKatex(
                  `\\frac{d}{d${variable}}(${expression})`,
                  false,
                  config.katexOptions
                ),
              })
              break
            }
          }
        }
      } else if (afterPlaceholder.startsWith('[')) {
        let depth = 0
        let i = 0
        for (i = 0; i < afterPlaceholder.length; i++) {
          if (afterPlaceholder[i] === '[') depth++
          if (afterPlaceholder[i] === ']') {
            depth--
            if (depth === 0) {
              const expression = afterPlaceholder.substring(1, i)
              replacements.push({
                start: placeholderStart,
                end: placeholderEnd + i + 1,
                replacement: safeRenderKatex(
                  `\\frac{d}{d${variable}}[${expression}]`,
                  false,
                  config.katexOptions
                ),
              })
              break
            }
          }
        }
      } else {
        replacements.push({
          start: placeholderStart,
          end: placeholderEnd,
          replacement: safeRenderKatex(`\\frac{d}{d${variable}}`, false, config.katexOptions),
        })
      }
    }
    replacements.reverse().forEach(({ start, end, replacement }) => {
      result = result.substring(0, start) + replacement + result.substring(end)
    })
    return result
  }

  rendered = processDerivativePlaceholders(rendered)
  rendered = rendered.replace(/\bd\/d([a-zA-Z])\b/g, (_match, variable) => {
    return safeRenderKatex(`\\frac{d}{d${variable}}`, false, config.katexOptions)
  })

  // Leftover `x^2` / Unicode superscripts stay CommonMark text. Wrapping them
  // as KaTeX is not a `$...$` enhancement (list-prefixed `\[`…`- \]`).

  // Restore protected KaTeX annotations.
  rendered = rendered.replace(/__KATEX_ANNOTATION_(\d+)__/g, (_match, index) => {
    const blockIndex = parseInt(index, 10)
    if (blockIndex >= 0 && blockIndex < annotationBlocks.length) {
      return annotationBlocks[blockIndex]
    }
    return _match
  })

  // Safety cleanup: \displaystyle should not appear in final rendered text.
  // If any residual token survives the main rendering passes, drop just the command.
  rendered = rendered.replace(/\\displaystyle\s*/g, '')

  return rendered
}
