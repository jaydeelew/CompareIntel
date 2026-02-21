import type { MathDelimiterPattern, ModelRendererConfig } from '../../types/rendererConfig'

import { safeRenderKatex, looksMathematical, looksProse } from './helpers'

export interface MathRendererConfig {
  displayMathDelimiters: MathDelimiterPattern[]
  inlineMathDelimiters: MathDelimiterPattern[]
  katexOptions?: ModelRendererConfig['katexOptions']
}

function sortDelimiters(delimiters: MathDelimiterPattern[]) {
  return [...delimiters].sort((a, b) => {
    const priorityA = a.priority ?? 999
    const priorityB = b.priority ?? 999
    return priorityA - priorityB
  })
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

  delimiters.forEach(({ pattern }) => {
    processed = processed.replace(pattern, fullMatch => {
      const index = mathBlocks.length
      mathBlocks.push(fullMatch)
      return `${placeholderPrefix}${index}${placeholderSuffix}`
    })
  })

  return { text: processed, mathBlocks }
}

export function restoreDisplayMath(text: string, mathBlocks: string[]): string {
  const placeholderRegex = /__DISPLAY_MATH_(\d+)__/g

  return text.replace(placeholderRegex, (_match, index) => {
    const blockIndex = parseInt(index, 10)
    if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
      return mathBlocks[blockIndex]
    }
    return _match
  })
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
  displayDelimiters.forEach(({ pattern }) => {
    rendered = rendered.replace(pattern, (_match, math) => {
      renderedFromDelimiters = true
      return safeRenderKatex(math, true, config.katexOptions)
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

  const findMatchingBrace = (t: string, openPos: number): number => {
    let depth = 1
    let pos = openPos + 1
    while (depth > 0 && pos < t.length) {
      if (t[pos] === '{') depth++
      else if (t[pos] === '}') depth--
      pos++
    }
    return depth === 0 ? pos - 1 : -1
  }

  const isInsideKatex = (t: string, pos: number): boolean => {
    const before = t.substring(0, pos)
    return before.lastIndexOf('<span class="katex">') > before.lastIndexOf('</span>')
  }

  const cleanHtmlFromLatex = (s: string): string =>
    s
      .replace(/<[^>]*>/g, '')
      .replace(/style="[^"]*"/g, '')
      .replace(/\bclass="[^"]*"/g, '')
      .trim()

  const processSqrt = (t: string): string => {
    let result = ''
    let i = 0
    while (i < t.length) {
      if (t.substring(i).startsWith('\\sqrt{') && !isInsideKatex(t, i)) {
        const braceStart = i + 5
        const braceEnd = findMatchingBrace(t, braceStart)
        if (braceEnd !== -1) {
          const content = t.substring(braceStart + 1, braceEnd)
          result += safeRenderKatex(
            `\\sqrt{${cleanHtmlFromLatex(content)}}`,
            false,
            config.katexOptions
          )
          i = braceEnd + 1
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

  rendered = processSqrt(rendered)

  const processFrac = (t: string): string => {
    let result = ''
    let i = 0
    while (i < t.length) {
      if (t.substring(i).startsWith('\\frac{') && !isInsideKatex(t, i)) {
        const numBraceStart = i + 5
        const numBraceEnd = findMatchingBrace(t, numBraceStart)
        if (numBraceEnd !== -1 && numBraceEnd + 1 < t.length && t[numBraceEnd + 1] === '{') {
          const denBraceStart = numBraceEnd + 1
          const denBraceEnd = findMatchingBrace(t, denBraceStart)
          if (denBraceEnd !== -1) {
            const num = t.substring(numBraceStart + 1, numBraceEnd)
            const den = t.substring(denBraceStart + 1, denBraceEnd)
            result += safeRenderKatex(
              `\\frac{${cleanHtmlFromLatex(num)}}{${cleanHtmlFromLatex(den)}}`,
              false,
              config.katexOptions
            )
            i = denBraceEnd + 1
          } else {
            result += t[i]
            i++
          }
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

  rendered = processFrac(rendered)

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

  const supMap: Record<string, string> = {
    '²': '2',
    '³': '3',
    '⁴': '4',
    '⁵': '5',
    '⁶': '6',
    '⁷': '7',
    '⁸': '8',
    '⁹': '9',
    '⁰': '0',
    '¹': '1',
  }
  const superscriptRegex = /([a-zA-Z0-9])([²³⁴⁵⁶⁷⁸⁹⁰¹])/g
  let superscriptMatch
  const superscriptReplacements: Array<{ start: number; end: number; replacement: string }> = []
  while ((superscriptMatch = superscriptRegex.exec(rendered)) !== null) {
    const start = superscriptMatch.index
    const end = start + superscriptMatch[0].length
    const base = superscriptMatch[1]
    const sup = superscriptMatch[2]
    const beforeMatch = rendered.substring(0, start)
    const lastKatexStart = beforeMatch.lastIndexOf('<span class="katex">')
    const lastKatexEnd = beforeMatch.lastIndexOf('</span>')
    if (lastKatexStart > lastKatexEnd) continue
    if (isInsideAnnotation(rendered, start)) continue
    const backticksBefore = (beforeMatch.match(/`/g) || []).length
    if (backticksBefore % 2 === 1) continue
    const afterMatch = rendered.substring(end)
    if (afterMatch.startsWith('^{')) continue
    superscriptReplacements.push({
      start,
      end,
      replacement: safeRenderKatex(`${base}^{${supMap[sup]}}`, false, config.katexOptions),
    })
  }
  superscriptReplacements.reverse().forEach(({ start, end, replacement }) => {
    rendered = rendered.substring(0, start) + replacement + rendered.substring(end)
  })

  rendered = rendered.replace(/([a-zA-Z0-9)\]])\^\{([^}]+)\}/g, (match, base, exp, offset) => {
    if (match.includes('<span') || match.includes('katex')) return match
    if (isInsideAnnotation(rendered, offset)) return match
    return safeRenderKatex(`${base}^{${exp}}`, false, config.katexOptions)
  })
  rendered = rendered.replace(/([a-zA-Z0-9])\^(\d+|[a-zA-Z])/g, (match, base, exp, offset) => {
    if (match.includes('<span') || match.includes('katex')) return match
    if (isInsideAnnotation(rendered, offset)) return match
    return safeRenderKatex(`${base}^{${exp}}`, false, config.katexOptions)
  })

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
