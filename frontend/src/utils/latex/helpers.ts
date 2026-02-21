import katex from 'katex'

import type { ModelRendererConfig } from '../../types/rendererConfig'

const DEFAULT_KATEX_OPTIONS = {
  throwOnError: false,
  strict: false,
  trust: (context: { command?: string }) =>
    ['\\url', '\\href', '\\includegraphics'].includes(context.command || ''),
  macros: {
    '\\eqref': '\\href{###1}{(\\text{#1})}',
  },
  maxSize: 500,
  maxExpand: 1000,
}

export const safeRenderKatex = (
  latex: string,
  displayMode: boolean,
  katexOptions?: ModelRendererConfig['katexOptions']
): string => {
  try {
    let cleanLatex = latex
      .trim()
      .replace(/<[^>]*>/g, '')
      .replace(/style="[^"]*"/g, '')

    cleanLatex = cleanLatex
      .replace(/\\\)\s*$/, '')
      .replace(/\\\]\s*$/, '')
      .trim()

    if (!cleanLatex) return ''

    const trustValue = katexOptions?.trust ?? DEFAULT_KATEX_OPTIONS.trust
    const normalizedTrust = Array.isArray(trustValue)
      ? (context: { command?: string }) => trustValue.includes(context.command || '')
      : trustValue

    const options = {
      ...DEFAULT_KATEX_OPTIONS,
      ...katexOptions,
      trust: normalizedTrust,
      displayMode,
    }

    return katex.renderToString(cleanLatex, options)
  } catch {
    const style = displayMode
      ? 'display: block; border: 1px solid #ccc; padding: 8px; margin: 8px 0; background: #f9f9f9;'
      : 'border: 1px solid #ccc; padding: 2px 4px; background: #f9f9f9;'
    return `<span style="${style} font-family: monospace; font-size: 0.9em;">${latex.trim()}</span>`
  }
}

export const looksMathematical = (content: string): boolean => {
  if (
    /\\(frac|int|sum|sqrt|cdot|times|neq|leq|geq|alpha|beta|gamma|pi|theta|infty|partial)\b/.test(
      content
    )
  ) {
    return true
  }
  if (/[=+\-×·÷±≠≤≥≈∞∑∏∫√²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(content)) {
    return true
  }
  if (/[a-z0-9]\^[0-9{]/.test(content) || /[a-z0-9][²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(content)) {
    return true
  }
  if (/[a-z]'/.test(content) || /d[a-z]/.test(content)) {
    return true
  }
  return false
}

export const convertSquareRoots = (content: string): string => {
  let result = content

  const findMatchingParen = (str: string, startPos: number): number => {
    let depth = 1
    let pos = startPos + 1
    while (pos < str.length && depth > 0) {
      if (str[pos] === '(') depth++
      else if (str[pos] === ')') depth--
      pos++
    }
    return depth === 0 ? pos - 1 : -1
  }

  let searchPos = 0
  while (searchPos < result.length) {
    const sqrtIndex = result.indexOf('√', searchPos)
    if (sqrtIndex === -1) break

    if (sqrtIndex + 1 < result.length && result[sqrtIndex + 1] === '(') {
      const openParenPos = sqrtIndex + 1
      const closeParenPos = findMatchingParen(result, openParenPos)

      if (closeParenPos !== -1) {
        const innerContent = result.substring(openParenPos + 1, closeParenPos)
        result =
          result.substring(0, sqrtIndex) +
          `\\sqrt{${innerContent}}` +
          result.substring(closeParenPos + 1)
        searchPos = sqrtIndex + `\\sqrt{${innerContent}}`.length
        continue
      }
    }

    if (sqrtIndex + 1 < result.length && /^\d+/.test(result.substring(sqrtIndex + 1))) {
      const match = result.substring(sqrtIndex + 1).match(/^\d+/)
      if (match) {
        const num = match[0]
        result =
          result.substring(0, sqrtIndex) +
          `\\sqrt{${num}}` +
          result.substring(sqrtIndex + 1 + num.length)
        searchPos = sqrtIndex + `\\sqrt{${num}}`.length
        continue
      }
    }

    if (sqrtIndex + 1 < result.length && /^[a-zA-Z]+/.test(result.substring(sqrtIndex + 1))) {
      const match = result.substring(sqrtIndex + 1).match(/^[a-zA-Z]+/)
      if (match) {
        const letters = match[0]
        result =
          result.substring(0, sqrtIndex) +
          `\\sqrt{${letters}}` +
          result.substring(sqrtIndex + 1 + letters.length)
        searchPos = sqrtIndex + `\\sqrt{${letters}}`.length
        continue
      }
    }

    searchPos = sqrtIndex + 1
  }

  return result
}

export const looksProse = (content: string): boolean => {
  if (/https?:\/\//.test(content)) return true

  if (content.match(/[a-zA-Z]{15,}/) && !looksMathematical(content)) return true

  if (
    /^(where|note|for example|i\.e\.|e\.g\.|etc\.|see|vs\.|antiderivative|a constant|to |for |in |on |at |of |with |from |by )/i.test(
      content
    )
  ) {
    return true
  }

  if (/\s+(or|and)\s+/i.test(content)) {
    return true
  }

  const prosePhrases = [
    /coefficient\s+of/i,
    /constant\s+term/i,
    /leading\s+coefficient/i,
    /degree\s+of/i,
    /solution\s+to/i,
    /roots?\s+of/i,
    /value\s+of/i,
    /equation\s+of/i,
    /graph\s+of/i,
    /derivative\s+of/i,
    /integral\s+of/i,
  ]
  if (prosePhrases.some(pattern => pattern.test(content))) {
    return true
  }

  const wordCount = content.trim().split(/\s+/).length
  if (wordCount > 2) {
    if (
      wordCount > 3 ||
      /^(the|a|an)\s+/i.test(content) ||
      /\s+(of|to|for|in|on|at|with|from|by)\s+/i.test(content)
    ) {
      return true
    }
  }
  if (wordCount > 2 && !looksMathematical(content)) return true

  if (wordCount > 15 && !looksMathematical(content)) return true

  return false
}
