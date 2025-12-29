/**
 * LatexRenderer - Comprehensive LaTeX/Markdown Renderer
 *
 * A unified parser that handles AI model responses from multiple providers.
 *
 * Key Features:
 * - Unified delimiter detection ($$, $, \[\], \(\))
 * - Automatic normalization to KaTeX format
 * - Permissive KaTeX configuration with trust mode
 * - Graceful error handling with visual fallbacks
 * - Multi-stage preprocessing pipeline
 * - Handles malformed content (MathML, SVG, KaTeX artifacts)
 * - Implicit math detection (parentheses/brackets with math content)
 * - Full markdown support (lists, code blocks, formatting)
 *
 * Processing Pipeline:
 * 1. Clean malformed content (MathML, SVG, HTML artifacts)
 * 2. Fix common LaTeX issues (missing backslashes, malformed commands)
 * 3. Convert implicit math notation to explicit delimiters
 * 4. Preserve code blocks (bypass LaTeX processing)
 * 5. Process markdown lists with math content
 * 6. Normalize and render all math delimiters
 * 6.5. Preserve line breaks between consecutive INLINE math expressions (skip display math)
 * 7. Process markdown formatting (bold, italic, links, etc.)
 * 8. Convert list placeholders to HTML
 * 9. Apply paragraph breaks
 * 10. Restore code blocks and final cleanup
 */

import katex from 'katex'
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'

import { getModelConfig } from '../config/modelRendererRegistry'
import type { ModelRendererConfig } from '../types/rendererConfig'
import { extractCodeBlocks, restoreCodeBlocks } from '../utils/codeBlockPreservation'
import { loadKatexCss } from '../utils/katexLoader'
import { loadPrism, getPrism, isPrismLoaded } from '../utils/prismLoader'

interface LatexRendererProps {
  children: string
  className?: string
  modelId?: string
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Default KaTeX options (fallback if model config doesn't specify)
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely render LaTeX with KaTeX with error handling
 */
const safeRenderKatex = (
  latex: string,
  displayMode: boolean,
  katexOptions?: ModelRendererConfig['katexOptions']
): string => {
  try {
    const cleanLatex = latex
      .trim()
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/style="[^"]*"/g, '') // Remove style attributes

    if (!cleanLatex) return ''

    // Merge model-specific options with defaults
    // Normalize trust property: convert string[] to function if needed
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
  } catch (error) {
    console.warn('KaTeX rendering error:', error, 'Input:', latex.substring(0, 100))
    // Return formatted fallback
    const style = displayMode
      ? 'display: block; border: 1px solid #ccc; padding: 8px; margin: 8px 0; background: #f9f9f9;'
      : 'border: 1px solid #ccc; padding: 2px 4px; background: #f9f9f9;'
    return `<span style="${style} font-family: monospace; font-size: 0.9em;">${latex.trim()}</span>`
  }
}

/**
 * Check if content looks like mathematical notation
 */
const looksMathematical = (content: string): boolean => {
  // LaTeX commands
  if (
    /\\(frac|int|sum|sqrt|cdot|times|neq|leq|geq|alpha|beta|gamma|pi|theta|infty|partial)\b/.test(
      content
    )
  ) {
    return true
  }

  // Mathematical operators and symbols
  if (/[=+\-×·÷±≠≤≥≈∞∑∏∫√²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(content)) {
    return true
  }

  // Variables with exponents
  if (/[a-z0-9]\^[0-9{]/.test(content) || /[a-z0-9][²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(content)) {
    return true
  }

  // Derivatives
  if (/[a-z]'/.test(content) || /d[a-z]/.test(content)) {
    return true
  }

  return false
}

/**
 * Convert Unicode square root symbols to LaTeX \sqrt with proper nested parentheses handling
 * Handles cases like √(expr), √((9)² - 4(2)(-5)), etc.
 */
const convertSquareRoots = (content: string): string => {
  let result = content

  // Function to find matching closing parenthesis for nested parentheses
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

  // Convert √(expr) patterns with nested parentheses
  let searchPos = 0
  while (searchPos < result.length) {
    const sqrtIndex = result.indexOf('√', searchPos)
    if (sqrtIndex === -1) break

    // Check if followed by opening parenthesis
    if (sqrtIndex + 1 < result.length && result[sqrtIndex + 1] === '(') {
      const openParenPos = sqrtIndex + 1
      const closeParenPos = findMatchingParen(result, openParenPos)

      if (closeParenPos !== -1) {
        // Extract the content inside parentheses
        const innerContent = result.substring(openParenPos + 1, closeParenPos)
        // Replace √(innerContent) with \sqrt{innerContent}
        result =
          result.substring(0, sqrtIndex) +
          `\\sqrt{${innerContent}}` +
          result.substring(closeParenPos + 1)
        searchPos = sqrtIndex + `\\sqrt{${innerContent}}`.length
        continue
      }
    }

    // Handle √ followed by digits: √123 -> \sqrt{123}
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

    // Handle √ followed by letters: √abc -> \sqrt{abc}
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

/**
 * Check if content looks like prose (not math)
 */
const looksProse = (content: string): boolean => {
  // URLs
  if (/https?:\/\//.test(content)) return true

  // Long words without math
  if (content.match(/[a-zA-Z]{15,}/) && !looksMathematical(content)) return true

  // Common prose patterns
  if (
    /^(where|note|for example|i\.e\.|e\.g\.|etc\.|see|vs\.|antiderivative|a constant|to |for |in |on |at |of |with |from |by )/i.test(
      content
    )
  ) {
    return true
  }

  // Check for prose connectors like "or" and "and" that indicate multiple solutions
  // These are natural language connectors, not mathematical operators
  if (/\s+(or|and)\s+/i.test(content)) {
    return true
  }

  // Check for common mathematical description phrases (even if they contain some math notation)
  // These are prose descriptions, not pure math expressions
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

  // Multiple words (even short phrases are likely prose, not math)
  // Check word count even if content has some math notation (like "coefficient of x^2")
  const wordCount = content.trim().split(/\s+/).length
  if (wordCount > 2) {
    // If it has multiple words AND contains prose indicators, it's prose
    // This handles cases like "coefficient of x^2" which has math but is still prose
    if (
      wordCount > 3 ||
      /^(the|a|an)\s+/i.test(content) ||
      /\s+(of|to|for|in|on|at|with|from|by)\s+/i.test(content)
    ) {
      return true
    }
  }
  if (wordCount > 2 && !looksMathematical(content)) return true

  // Many words without math
  if (wordCount > 15 && !looksMathematical(content)) return true

  return false
}

const LatexRenderer: React.FC<LatexRendererProps> = ({ children, className = '', modelId }) => {
  // All hooks must be called before any early returns (Rules of Hooks)

  // Get model-specific configuration (falls back to default if modelId not provided or not found)
  const config = useMemo(() => {
    // getModelConfig returns default config if modelId is not found
    // If modelId is not provided, we'll use a placeholder that will return default config
    return getModelConfig(modelId || '__default__')
  }, [modelId])

  // Safety check - store as variable to use in hooks
  const isValidChildren = typeof children === 'string'

  // Initialize hooks that don't depend on renderLatex - MUST be called before any early returns
  const contentRef = useRef<HTMLDivElement>(null)
  const [prismLoaded, setPrismLoaded] = useState(false)

  // ============================================================================
  // PREPROCESSING PIPELINE
  // ============================================================================

  /**
   * Stage 1: Clean malformed content (MathML, SVG, KaTeX artifacts)
   * Uses model-specific preprocessing options
   */
  const cleanMalformedContent = (text: string): string => {
    const preprocessOpts = config.preprocessing || {}
    let cleaned = text

    // Remove malformed KaTeX/MathML markup
    cleaned = cleaned.replace(/<\s*spanclass\s*=\s*["']katex[^"']*["'][^>]*>/gi, '')
    cleaned = cleaned.replace(/spanclass/gi, '')
    cleaned = cleaned.replace(/mathxmlns/gi, '')
    cleaned = cleaned.replace(/annotationencoding/gi, '')

    // Remove MathML blocks (if enabled in config)
    if (preprocessOpts.removeMathML !== false) {
      cleaned = cleaned.replace(/<math[^>]*xmlns[^>]*>[\s\S]*?<\/math>/gi, '')
      cleaned = cleaned.replace(/xmlns:?[^=]*="[^"]*w3\.org\/1998\/Math\/MathML[^"]*"/gi, '')
      cleaned = cleaned.replace(/https?:\/\/www\.w3\.org\/1998\/Math\/MathML[^\s<>]*/gi, '')
      cleaned = cleaned.replace(/www\.w3\.org\/1998\/Math\/MathML[^\s<>]*/gi, '')

      // Remove MathML tags while preserving content
      const mathmlTags = [
        'math',
        'mrow',
        'mi',
        'mn',
        'mo',
        'msup',
        'msub',
        'mfrac',
        'mtext',
        'mspace',
      ]
      mathmlTags.forEach(tag => {
        // eslint-disable-next-line no-useless-escape
        cleaned = cleaned.replace(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'gi'), '$1')
        // eslint-disable-next-line no-useless-escape
        cleaned = cleaned.replace(new RegExp(`<\/?${tag}[^>]*>`, 'gi'), '')
      })
    }

    // Remove SVG content (if enabled in config)
    if (preprocessOpts.removeSVG !== false) {
      cleaned = cleaned.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
      cleaned = cleaned.replace(/<path[^>]*\/>/gi, '')

      // Remove long sequences that look like SVG path data
      cleaned = cleaned.replace(/[a-zA-Z0-9\s,.-]{50,}/g, match => {
        const hasMany = (pattern: RegExp, threshold: number) =>
          (match.match(pattern) || []).length > threshold
        if (hasMany(/\d/g, 10) && hasMany(/,/g, 5) && hasMany(/[a-zA-Z]/g, 5)) {
          return '' // Remove SVG path data
        }
        return match
      })
    }

    // Remove HTML from math expressions (if enabled in config)
    if (preprocessOpts.removeHtmlFromMath) {
      // This will be applied during math rendering, but we can also do basic cleanup here
      cleaned = cleaned.replace(/(\$\$?[^$]*?)<[^>]+>([^$]*?\$\$?)/g, '$1$2')
    }

    // Fix escaped dollar signs (if enabled in config)
    if (preprocessOpts.fixEscapedDollars) {
      cleaned = cleaned.replace(/\\\$/g, '$')
    }

    // Convert <frac> tags to LaTeX \frac{}{} format
    // Pattern: <frac>numerator</frac> followed by divider div and denominator div
    // Handle variations in style attribute format (quotes, spacing, etc.)
    cleaned = cleaned.replace(
      /<frac>([\s\S]*?)<\/frac>\s*<div[^>]*style\s*=\s*["'][^"']*border-top[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<div[^>]*style\s*=\s*["'][^"']*margin-left[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
      (_match, numerator, denominator) => {
        // Convert HTML entities and tags in numerator
        const num = numerator
          // First handle superscripts before removing HTML tags
          .replace(/<sup>(\d+)<\/sup>/g, '^{$1}') // Superscript
          .replace(/<sup>([^<]+)<\/sup>/g, '^{$1}') // Superscript with content
          // Convert square root: &#x221A;(content) or √(content) -> \sqrt{content}
          .replace(/(&#x221A;|√)\(([^)]+)\)/g, '\\sqrt{$2}') // sqrt( to sqrt{
          .replace(/&#x221A;|√/g, '\\sqrt') // Standalone sqrt symbol
          .replace(/±/g, '\\pm') // Plus-minus
          .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
          .trim()

        // Convert HTML entities and tags in denominator
        const den = denominator
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .trim()

        // Wrap in LaTeX fraction and inline math delimiters
        return `\\(\\frac{${num}}{${den}}\\)`
      }
    )

    // Also handle simpler <frac> tags that might be standalone (convert to inline fraction)
    cleaned = cleaned.replace(/<frac>([\s\S]*?)<\/frac>/gi, (_match, content) => {
      // Convert HTML entities and tags
      const converted = content
        // First handle superscripts before removing HTML tags
        .replace(/<sup>(\d+)<\/sup>/g, '^{$1}') // Superscript
        .replace(/<sup>([^<]+)<\/sup>/g, '^{$1}') // Superscript with content
        // Convert square root: &#x221A;(content) or √(content) -> \sqrt{content}
        .replace(/(&#x221A;|√)\(([^)]+)\)/g, '\\sqrt{$2}') // sqrt( to sqrt{
        .replace(/&#x221A;|√/g, '\\sqrt') // Standalone sqrt symbol
        .replace(/±/g, '\\pm') // Plus-minus
        .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
        .trim()

      // If it looks like a fraction structure, try to split it
      // Otherwise, just return the content wrapped in LaTeX
      return `(${converted})`
    })

    // Remove model-generated placeholders early to prevent interference with list processing
    // Be very aggressive - catch all variations and concatenated placeholders
    // Handle double parentheses format: ((MDPH3)) - remove all occurrences, even concatenated
    while (cleaned.includes('((MDPH')) {
      cleaned = cleaned.replace(/\(\(MDPH\d+\)\)/g, '')
    }
    // Handle curly braces format: {{MDPH3}} - remove all occurrences, even concatenated
    while (cleaned.includes('{{MDPH')) {
      cleaned = cleaned.replace(/\{\{MDPH\d+\}\}/g, '')
    }
    // Handle single parentheses/braces as fallback
    cleaned = cleaned.replace(/\(MDPH\d+\)/g, '')
    cleaned = cleaned.replace(/\{MDPH\d+\}/g, '')
    // Remove any trailing --- that might follow placeholders (but NOT standalone horizontal rules)
    // Only match --- that's on the same line as content, not standalone --- on their own lines
    // Pattern: content followed by whitespace and --- (not a standalone line)
    cleaned = cleaned.replace(/([^\n])\s*---+\s*(?=\S)/g, '$1 ')
    // Also remove --- that's immediately after placeholders on the same line
    cleaned = cleaned.replace(/(MDPH\d+)\s*---+\s*(?=\S)/g, '$1 ')

    // Apply custom preprocessing functions if provided
    if (preprocessOpts.customPreprocessors) {
      for (const preprocessor of preprocessOpts.customPreprocessors) {
        cleaned = preprocessor(cleaned)
      }
    }

    return cleaned
  }

  /**
   * Stage 2: Fix common LaTeX issues
   */
  const fixLatexIssues = (text: string): string => {
    let fixed = text

    // Restore LaTeX commands that lost their leading backslash due to JSON escape sequences
    // e.g. "\frac" becomes form-feed + "rac" when parsed as "\f"
    fixed = fixed
      // eslint-disable-next-line no-control-regex
      .replace(/\x08/g, '\\b') // backspace -> \b
      .replace(/\f/g, '\\f') // form feed -> \f (e.g. \frac)
      .replace(/\t/g, '\\t') // tab -> \t (e.g. \text)
      .replace(/\v/g, '\\v') // vertical tab -> \v (rare)
    fixed = fixed.replace(/\r(?!\n)/g, '\\r') // standalone carriage returns (e.g. \right)

    // Remove standalone delimiter lines (common in AI outputs)
    fixed = fixed.replace(/^\\\[\s*$/gm, '')
    fixed = fixed.replace(/^\\\]\s*$/gm, '')
    fixed = fixed.replace(/^\$\$\s*$/gm, '')

    // Fix missing backslashes in common LaTeX commands
    const commands = [
      'frac',
      'boxed',
      'sqrt',
      'sum',
      'prod',
      'int',
      'lim',
      'sin',
      'cos',
      'tan',
      'log',
      'ln',
      'exp',
    ]
    commands.forEach(cmd => {
      fixed = fixed.replace(new RegExp(`\\b${cmd}\\{`, 'g'), `\\${cmd}{`)
      fixed = fixed.replace(new RegExp(`\\b${cmd}([_^])`, 'g'), `\\${cmd}$1`)
    })

    // Fix missing backslashes in operators
    const operators = [
      'neq',
      'leq',
      'geq',
      'cdot',
      'times',
      'div',
      'pm',
      'mp',
      'approx',
      'equiv',
      'sim',
      'infty',
    ]
    operators.forEach(op => {
      fixed = fixed.replace(new RegExp(`\\b${op}\\b`, 'g'), `\\${op}`)
    })

    // Fix \left and \right (KaTeX handles these automatically in most cases)
    fixed = fixed.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
    fixed = fixed.replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
    fixed = fixed.replace(/\\left\\\{/g, '\\{').replace(/\\right\\\}/g, '\\}')

    // Clean up boxed commands (remove redundant wrappers)
    fixed = fixed.replace(/\(\s*\\boxed\{([^}]+)\}\s*\)\.?/g, '\\boxed{$1}')
    fixed = fixed.replace(/\[\s*\\boxed\{([^}]+)\}\s*\]\.?/g, '\\boxed{$1}')
    fixed = fixed.replace(/\\boxed\{\s*\(\s*([^)]+)\s*\)\s*\}/g, '\\boxed{$1}')
    fixed = fixed.replace(/\\boxed\{\s*\[\s*([^\]]+)\s*\]\s*\}/g, '\\boxed{$1}')

    // Fix double parentheses (( ... )) - often used for emphasis
    fixed = fixed.replace(/\(\(\s*([^()]+)\s*\)\)/g, '( $1 )')

    // Fix specific mathematical patterns that cause rendering issues
    // Fix double negative signs in parentheses: (-(-7)) -> (-(-7))
    // This handles the case where we have -(-7) which should stay as -(-7)
    fixed = fixed.replace(/\(-\s*\(-\s*(\d+)\s*\)\s*\)/g, '(-(-$1))')

    // Fix the specific case where --7 appears (should be -(-7))
    fixed = fixed.replace(/--(\d+)/g, '-(-$1)')

    // Fix multiplication in parentheses: (2(2)) -> (2 \cdot 2) or (2 \times 2)
    fixed = fixed.replace(/\((\d+)\s*\((\d+)\s*\)\s*\)/g, '($1 \\cdot $2)')

    // Fix the specific case where (22) appears (should be (2 \cdot 2))
    fixed = fixed.replace(/\((\d)(\d)\)/g, '($1 \\cdot $2)')

    // Additional fix for the specific pattern: (--7) -> (-(-7))
    fixed = fixed.replace(/\(--(\d+)\)/g, '(-(-$1))')

    // Fix square root symbol: √ -> \sqrt
    fixed = fixed.replace(/√(\d+)/g, '\\sqrt{$1}')

    // Fix plus-minus symbol: ± -> \pm
    // CRITICAL: Convert multiple consecutive ± to single \pm to prevent duplication
    fixed = fixed.replace(/±+/g, '\\pm')

    // Fix multiplication symbol: × -> \times
    fixed = fixed.replace(/×/g, '\\times')

    // Fix spacing around \times in parentheses: (2\times2) -> (2 \times 2)
    fixed = fixed.replace(/\((\d+)\\times(\d+)\)/g, '($1 \\times $2)')

    // Fix various Unicode minus signs to regular ASCII minus
    fixed = fixed.replace(/−/g, '-') // Unicode minus sign (U+2212) to ASCII hyphen-minus
    fixed = fixed.replace(/‒/g, '-') // Figure dash (U+2012) to ASCII hyphen-minus
    fixed = fixed.replace(/–/g, '-') // En dash (U+2013) to ASCII hyphen-minus
    fixed = fixed.replace(/—/g, '-') // Em dash (U+2014) to ASCII hyphen-minus

    // Fix derivative notation
    fixed = fixed.replace(/fracdx\[([^\]]+)\]/g, '\\frac{d}{dx}[$1]')
    fixed = fixed.replace(/fracd([a-z])\[([^\]]+)\]/g, '\\frac{d}{d$1}[$2]')

    // Fix common malformed LaTeX mixed with HTML
    fixed = fixed.replace(/\\boxed\{[^}]*style="[^"]*"[^}]*\}/g, match => {
      const content = match
        .replace(/\\boxed\{/, '')
        .replace(/\}$/, '')
        .replace(/<[^>]*>/g, '')
        .replace(/style="[^"]*"/g, '')
        .trim()
      return `\\boxed{${content}}`
    })

    return fixed
  }

  /**
   * Stage 3: Detect and convert implicit math notation
   */
  const convertImplicitMath = (text: string): string => {
    let converted = text

    // FIRST: Handle d/dx(...) and d/dx[...] patterns before general conversion
    // Replace d/dx with the fraction, keep the argument as-is (will be processed later)
    // Use a placeholder format that won't be interpreted as markdown (avoid double underscores)
    converted = converted.replace(
      /\bd\/d([a-zA-Z])\(([^)]+)\)/g,
      (_match, variable, expression) => {
        // Use a placeholder format that won't be interpreted as markdown bold/italic
        return `⟨⟨DERIVATIVE_${variable}⟩⟩(${expression})`
      }
    )

    converted = converted.replace(
      /\bd\/d([a-zA-Z])\[([^\]]+)\]/g,
      (_match, variable, expression) => {
        return `⟨⟨DERIVATIVE_${variable}⟩⟩[${expression}]`
      }
    )

    // Handle content in parentheses with spaces: ( math content )
    converted = converted.replace(/\(\s+((?:[^()]|\([^()]*\))+?)\s+\)/g, (_match, content) => {
      // Don't convert if content has markdown formatting
      if (content.includes('*') || content.includes('_') || content.includes('`')) return _match
      if (looksMathematical(content) && !looksProse(content)) {
        return `\\(${content.trim()}\\)`
      }
      return _match
    })

    // Handle content in square brackets with spaces: [ math content ]
    // Note: Only convert if it looks like math notation WITH spaces, to avoid
    // interfering with d/dx[expr] notation which should keep its brackets
    converted = converted.replace(/\[\s+((?:[^[\]]|\[[^\]]*\])+?)\s+\]/g, (_match, content) => {
      if (content.includes('\\boxed')) return _match // Already handled
      // Don't convert if preceded by d/dx pattern
      if (looksMathematical(content) && !looksProse(content)) {
        return `\\(${content.trim()}\\)`
      }
      return _match
    })

    // Handle simple parentheses (not function calls) - BUT be more careful about mathematical expressions
    converted = converted.replace(/(?<![a-zA-Z])\(([^()]+)\)/g, (_match, content) => {
      if (_match.includes('\\(') || content.includes('\\boxed')) return _match
      if (content.match(/^(a|an)\s+/i)) return _match // Prose
      // Don't convert if content has markdown formatting (asterisks, underscores, backticks)
      if (content.includes('*') || content.includes('_') || content.includes('`')) return _match

      let trimmed = content.trim()

      // Convert Unicode superscripts to LaTeX format before wrapping
      const supMap: { [key: string]: string } = {
        '²': '^{2}',
        '³': '^{3}',
        '⁴': '^{4}',
        '⁵': '^{5}',
        '⁶': '^{6}',
        '⁷': '^{7}',
        '⁸': '^{8}',
        '⁹': '^{9}',
        '⁰': '^{0}',
        '¹': '^{1}',
      }
      for (const [unicode, latex] of Object.entries(supMap)) {
        trimmed = trimmed.replace(
          new RegExp(`([a-zA-Z0-9])${unicode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
          `$1${latex}`
        )
      }

      // Don't convert if this contains LaTeX commands that were already processed
      if (content.includes('\\cdot') || content.includes('\\pm') || content.includes('\\sqrt')) {
        return _match
      }

      // Don't convert if this is part of a larger mathematical expression
      // Check if this parentheses is part of a mathematical statement (contains =, ±, /, etc.)
      const beforeMatch = text.substring(0, text.indexOf(_match))
      const afterMatch = text.substring(text.indexOf(_match) + _match.length)

      // If there's an equals sign, plus/minus, division, or other math operators nearby,
      // this is likely part of a larger math expression and shouldn't be converted
      const mathContextPattern = /[=+\-×·÷±≠≤≥≈∞∑∏∫√²³⁴⁵⁶⁷⁸⁹⁰¹]/
      if (
        mathContextPattern.test(beforeMatch.slice(-20)) ||
        mathContextPattern.test(afterMatch.slice(0, 20))
      ) {
        return _match
      }

      // Don't convert phrases with multiple words (prose, not math)
      if (trimmed.includes(' ')) return _match

      // Single letter/number or simple math expressions
      if (
        /^[a-zA-Z0-9]$/.test(trimmed) ||
        /^[+-]?\s*[A-Z]$/.test(trimmed) ||
        (looksMathematical(content) && !looksProse(content) && content.length < 100)
      ) {
        return `\\(${trimmed}\\)`
      }

      return _match
    })

    return converted
  }

  /**
   * Render a code block to HTML
   * This is called after code blocks are restored from placeholders
   */
  const renderCodeBlock = (language: string, code: string): string => {
    const lang = language || ''
    const cleanCode = code.replace(/^\n+|\n+$/g, '')

    // List of recognized programming languages that should be rendered as styled code blocks
    // Only these languages will show the code block header with language label
    const recognizedLanguages = new Set([
      // Common programming languages
      'javascript',
      'js',
      'typescript',
      'ts',
      'python',
      'py',
      'java',
      'c',
      'cpp',
      'c++',
      'csharp',
      'c#',
      'cs',
      'go',
      'rust',
      'ruby',
      'rb',
      'php',
      'swift',
      'kotlin',
      'scala',
      'r',
      'perl',
      'lua',
      'dart',
      'elixir',
      'erlang',
      'haskell',
      'clojure',
      'fsharp',
      'f#',
      'ocaml',
      'julia',
      'zig',
      'nim',
      'crystal',
      // Web technologies
      'html',
      'css',
      'scss',
      'sass',
      'less',
      'jsx',
      'tsx',
      'vue',
      'svelte',
      'xml',
      'svg',
      'json',
      'yaml',
      'yml',
      'toml',
      'graphql',
      'wasm',
      // Shell and scripting
      'bash',
      'sh',
      'shell',
      'zsh',
      'fish',
      'powershell',
      'ps1',
      'batch',
      'bat',
      'cmd',
      // Databases and query languages
      'sql',
      'mysql',
      'postgresql',
      'sqlite',
      'mongodb',
      'redis',
      'cassandra',
      // Configuration and markup
      'markdown',
      'md',
      'latex',
      'tex',
      'dockerfile',
      'docker',
      'nginx',
      'apache',
      'makefile',
      'make',
      'cmake',
      'gradle',
      'maven',
      // Data formats
      'csv',
      'ini',
      'properties',
      'env',
      // Other
      'regex',
      'diff',
      'git',
      'http',
      'asm',
      'assembly',
      'wgsl',
      'glsl',
      'hlsl',
      'cuda',
      'opencl',
      'vhdl',
      'verilog',
      'systemverilog',
      'tcl',
      'prolog',
      'scheme',
      'lisp',
      'racket',
      'elm',
      'purescript',
      'reason',
      'rescript',
      'solidity',
      'vyper',
      'move',
      'cairo',
      'terraform',
      'hcl',
      'puppet',
      'ansible',
      'nix',
      'dhall',
      'jsonnet',
      'cue',
      'protobuf',
      'proto',
      'thrift',
      'avro',
      'capnproto',
      'flatbuffers',
    ])

    // Check if this is a recognized programming language
    const isRecognizedLanguage = lang && recognizedLanguages.has(lang.toLowerCase())

    // Map common aliases to Prism language names
    const languageMap: { [key: string]: string } = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      rb: 'ruby',
      sh: 'bash',
      yml: 'yaml',
      html: 'markup',
      xml: 'markup',
      'c++': 'clike',
      cpp: 'clike',
      'c#': 'csharp',
      cs: 'csharp',
    }

    const prismLang = isRecognizedLanguage
      ? languageMap[lang.toLowerCase()] || lang.toLowerCase()
      : 'none'

    // Escape the code for safe HTML insertion
    const escapedCode = cleanCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Base64 encode the original code for reliable storage in data attribute
    const base64Code =
      typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(cleanCode))) : ''

    // For unrecognized languages (including plaintext, text, or empty), render as simple preformatted text
    // without the styled code block header
    if (!isRecognizedLanguage) {
      return `
            <div class="preformatted-text" data-code-base64="${base64Code}" style="
                background: #f6f8fa;
                border: 1px solid #d0d7de;
                border-radius: 6px;
                padding: 16px;
                margin: 16px 0;
                overflow-x: auto;
                font-size: 14px;
                line-height: 1.5;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                white-space: pre-wrap;
                word-wrap: break-word;
                color: #1f2328;
            "><code style="font-family: inherit; background: none; padding: 0;">${escapedCode}</code></div>
        `
    }

    // For recognized languages, render as styled code block with language header
    return `
            <div class="code-block-direct" data-language="${lang}" data-code-base64="${base64Code}" style="
                background: #0d1117;
                border: 1px solid #30363d;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                overflow-x: auto;
                font-size: 14px;
                line-height: 1.5;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                position: relative;
            ">
                <div class="code-block-header" style="
                    position: absolute;
                    top: 8px;
                    left: 12px;
                    right: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    pointer-events: none;
                    z-index: 1;
                ">
                    <span class="code-language-label" style="
                        font-size: 11px;
                        color: #7d8590;
                        text-transform: uppercase;
                        font-weight: 600;
                        background: rgba(125, 133, 144, 0.15);
                        padding: 0.25rem 0.5rem;
                        border-radius: 3px;
                        letter-spacing: 0.5px;
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    ">${lang}</span>
                    <button class="code-copy-btn" onclick="(function(btn){try{const base64=btn.parentElement.parentElement.getAttribute('data-code-base64');const code=decodeURIComponent(escape(atob(base64)));navigator.clipboard.writeText(code).then(()=>{const origHTML=btn.innerHTML;btn.innerHTML='<svg width=\\'14\\' height=\\'14\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><polyline points=\\'20 6 9 17 4 12\\'></polyline></svg>';btn.style.color='#3fb950';setTimeout(()=>{btn.innerHTML=origHTML;btn.style.color='#7d8590';},2000);}).catch(e=>console.error(e));}catch(e){console.error('Copy error:',e);}})(this)" style="
                        pointer-events: auto;
                        background: none;
                        border: none;
                        color: #7d8590;
                        cursor: pointer;
                        padding: 0.25rem;
                        border-radius: 4px;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 24px;
                        height: 24px;
                    " onmouseover="this.style.background='rgba(125, 133, 144, 0.15)'; this.style.color='#e6edf3';" onmouseout="if(!this.style.color.includes('3fb950')){this.style.background='none';this.style.color='#7d8590';}" title="Copy code">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    </button>
                </div>
                <pre class="language-${prismLang}" style="margin: 0; margin-top: 28px; white-space: pre; word-wrap: normal; overflow-wrap: normal;"><code class="language-${prismLang}">${escapedCode}</code></pre>
            </div>
        `
  }

  /**
   * Stage 5: Process markdown lists
   */
  const processMarkdownLists = (text: string): string => {
    // First, remove any model-generated placeholders that might interfere with list detection
    // Be very aggressive - catch all variations and concatenated placeholders
    let processed = text
    // Handle double parentheses format: ((MDPH3)) - remove all occurrences, even concatenated
    while (processed.includes('((MDPH')) {
      processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
    }
    // Handle curly braces format: {{MDPH3}} - remove all occurrences, even concatenated
    while (processed.includes('{{MDPH')) {
      processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
    }
    // Handle single parentheses/braces as fallback
    processed = processed.replace(/\(MDPH\d+\)/g, '')
    processed = processed.replace(/\{MDPH\d+\}/g, '')
    // NOTE: Horizontal rules (---) are intentionally NOT removed here
    // They will be processed in Stage 7 (processMarkdown) and converted to <hr> tags
    // The previous code removed all --- which caused headers after --- to be concatenated
    // onto the same line, breaking header detection

    // Debug: Check for ordered list patterns in input
    const olPattern = /^\d+\.\s+/gm
    const olMatches = processed.match(olPattern)
    console.log(
      `[processMarkdownLists] Input has ${olMatches ? olMatches.length : 0} potential OL items`
    )
    if (olMatches && olMatches.length > 0) {
      console.log('[processMarkdownLists] Sample matches:', olMatches.slice(0, 5))
      // Show context around first match
      const firstMatchIndex = processed.search(olPattern)
      if (firstMatchIndex >= 0) {
        console.log(
          '[processMarkdownLists] Context around first match:',
          processed.substring(Math.max(0, firstMatchIndex - 50), firstMatchIndex + 150)
        )
      }
    }

    // Helper function to process list content (math and markdown formatting)
    const processListContent = (content: string): string => {
      let processedContent = convertImplicitMath(content)

      // CRITICAL: Do NOT restore inline math placeholders here
      // Keep them as __INLINE_MATH_X__ to preserve the list placeholder structure
      // They will be restored and rendered later in the pipeline (Stage 8.5)

      // Process bold/italic inside list items, BUT protect inline math placeholders
      // IMPORTANT: First, temporarily protect inline math placeholders from markdown processing
      const mathPlaceholders = new Map<string, string>()
      let placeholderCounter = 0
      processedContent = processedContent.replace(/__INLINE_MATH_\d+__/g, match => {
        const tempPlaceholder = `%%MATHPH${placeholderCounter}%%`
        mathPlaceholders.set(tempPlaceholder, match)
        placeholderCounter++
        return tempPlaceholder
      })

      // Bold: match ** but allow single * inside
      processedContent = processedContent.replace(
        /\*\*((?:(?!\*\*)[\s\S])+?)\*\*/g,
        '<strong>$1</strong>'
      )
      // Bold: match __ but allow single _ inside
      processedContent = processedContent.replace(/__((?:(?!__)[\s\S])+?)__/g, (match, content) => {
        // Skip if this looks like it might be part of math
        if (content.includes('$') || content.includes('\\(') || content.includes('\\[')) {
          return match // Don't process as bold
        }
        return `<strong>${content}</strong>`
      })
      // Italic: match single * but not when part of **
      processedContent = processedContent.replace(
        /(?<!\*)\*((?:(?!\*)[^\n])+?)\*(?!\*)/g,
        '<em>$1</em>'
      )
      // Italic: match single _ but not when part of __
      processedContent = processedContent.replace(/(?<!_)_((?:(?!_)[^\n])+?)_(?!_)/g, '<em>$1</em>')

      // Restore inline math placeholders (use replaceAll to handle multiple occurrences)
      mathPlaceholders.forEach((original, placeholder) => {
        processedContent = processedContent.replaceAll(placeholder, original)
      })
      // Inline code
      processedContent = processedContent.replace(
        /`([^`\n]+?)`/g,
        '<code class="inline-code">$1</code>'
      )

      return processedContent
    }

    // Task lists
    processed = processed.replace(/^- \[([ x])\] (.+)$/gm, (_, checked, text) => {
      const isChecked = checked === 'x'
      const processedText = processListContent(text)
      return `__TASK_${isChecked ? 'checked' : 'unchecked'}__${processedText}__/TASK__`
    })

    // Unordered lists - support both '-' and '*' bullets
    // Match '-' bullets (but not task lists)
    processed = processed.replace(/^(\s*)- (?!\[[ x]\])(.+)$/gm, (_, indent, content) => {
      const level = indent.length
      const processedContent = processListContent(content)
      return `__UL_${level}__${processedContent}__/UL__`
    })
    // Match '*' bullets (common in Gemini and other models)
    processed = processed.replace(/^(\s*)\* (?!\[[ x]\])(.+)$/gm, (_, indent, content) => {
      const level = indent.length
      const processedContent = processListContent(content)
      return `__UL_${level}__${processedContent}__/UL__`
    })

    // Ordered lists - simpler approach
    // First, match just the list item line with its content
    // Allow one or more spaces after the period, match any non-empty content
    let matchCount = 0
    processed = processed.replace(/^(\s*)(\d+)\.\s+(.+?)$/gm, (_match, indent, num, content) => {
      matchCount++
      const level = indent.length
      console.log(`[OL Match] Found item ${num}: "${content}"`)
      const processedContent = processListContent(content)
      return `__OL_${level}_${num}__${processedContent}__/OL__`
    })
    console.log(`[processMarkdownLists] Total OL items found: ${matchCount}`)

    // Then, find indented lines that follow list items and incorporate them
    // Match pattern: list placeholder followed by blank lines and truly indented content (3+ spaces)
    // This ensures we only capture continuation lines, not the next paragraph or list
    processed = processed.replace(
      /__OL_(\d+)_(\d+)__([\s\S]*?)__\/OL__(?:\n((?:[ \t]{3,}[^\n]+(?:\n|$)|[ \t]*\n)*))?/g,
      (_fullMatch, level, num, content, continuationBlock) => {
        let result = `__OL_${level}_${num}__${content}`

        if (continuationBlock && continuationBlock.trim()) {
          // Process the continuation lines
          const lines = continuationBlock.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed) {
              result += `<div style="margin-left: 2em; margin-top: 0.5em;">${trimmed}</div>`
            }
          }
        }

        return result + '__/OL__'
      }
    )

    return processed
  }

  /**
   * Extract display math blocks to protect them from preprocessing
   * Similar to code block extraction, but for math delimiters
   */
  const extractDisplayMath = (text: string): { text: string; mathBlocks: string[] } => {
    const mathBlocks: string[] = []
    const placeholderPrefix = '__DISPLAY_MATH_'
    const placeholderSuffix = '__'

    let processed = text
    const displayDelimiters = [...config.displayMathDelimiters].sort((a, b) => {
      const priorityA = a.priority ?? 999
      const priorityB = b.priority ?? 999
      return priorityA - priorityB
    })

    // Extract all display math blocks using model-specific delimiters
    displayDelimiters.forEach(({ pattern }) => {
      processed = processed.replace(pattern, fullMatch => {
        const index = mathBlocks.length
        mathBlocks.push(fullMatch) // Store the full match including delimiters
        return `${placeholderPrefix}${index}${placeholderSuffix}`
      })
    })

    return { text: processed, mathBlocks }
  }

  /**
   * Restore display math blocks after preprocessing
   */
  const restoreDisplayMath = (text: string, mathBlocks: string[]): string => {
    const placeholderPrefix = '__DISPLAY_MATH_'
    const placeholderSuffix = '__'
    const placeholderRegex = new RegExp(`${placeholderPrefix}(\\d+)${placeholderSuffix}`, 'g')

    return text.replace(placeholderRegex, (_match, index) => {
      const blockIndex = parseInt(index, 10)
      if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
        return mathBlocks[blockIndex]
      }
      return _match // Return original if index is invalid
    })
  }

  /**
   * Extract inline math blocks to protect them from preprocessing
   * Similar to display math extraction, but for inline math delimiters
   */
  const extractInlineMath = (text: string): { text: string; mathBlocks: string[] } => {
    const mathBlocks: string[] = []
    const placeholderPrefix = '__INLINE_MATH_'
    const placeholderSuffix = '__'

    let processed = text
    const inlineDelimiters = [...config.inlineMathDelimiters].sort((a, b) => {
      const priorityA = a.priority ?? 999
      const priorityB = b.priority ?? 999
      return priorityA - priorityB
    })

    // Extract all inline math blocks using model-specific delimiters
    inlineDelimiters.forEach(({ pattern }) => {
      processed = processed.replace(pattern, fullMatch => {
        const index = mathBlocks.length
        mathBlocks.push(fullMatch) // Store the full match including delimiters
        return `${placeholderPrefix}${index}${placeholderSuffix}`
      })
    })

    return { text: processed, mathBlocks }
  }

  /**
   * Restore inline math blocks after preprocessing
   */
  const restoreInlineMath = (
    text: string,
    mathBlocks: string[],
    skipInsideListPlaceholders: boolean = false
  ): string => {
    const placeholderPrefix = '__INLINE_MATH_'
    const placeholderSuffix = '__'
    const placeholderRegex = new RegExp(`${placeholderPrefix}(\\d+)${placeholderSuffix}`, 'g')

    // If we should skip inline math inside list placeholders, process the text in chunks
    if (skipInsideListPlaceholders) {
      // Split text by list placeholder boundaries
      const listPlaceholderRegex =
        /(__(?:OL|UL)_[\d_]+__[\s\S]*?__\/(?:OL|UL)__|__TASK_(?:checked|unchecked)__[\s\S]*?__\/TASK__)/g
      let result = ''
      let lastIndex = 0
      let match

      while ((match = listPlaceholderRegex.exec(text)) !== null) {
        // Process text before this list placeholder
        const beforeList = text.substring(lastIndex, match.index)
        result += beforeList.replace(placeholderRegex, (_match, index) => {
          const blockIndex = parseInt(index, 10)
          if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
            return mathBlocks[blockIndex]
          }
          return _match
        })

        // Add the list placeholder unchanged (don't restore inline math inside it)
        result += match[0]
        lastIndex = match.index + match[0].length
      }

      // Process remaining text after last list placeholder
      const afterLists = text.substring(lastIndex)
      result += afterLists.replace(placeholderRegex, (_match, index) => {
        const blockIndex = parseInt(index, 10)
        if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
          return mathBlocks[blockIndex]
        }
        return _match
      })

      return result
    }

    // Default behavior: restore all inline math placeholders
    return text.replace(placeholderRegex, (_match, index) => {
      const blockIndex = parseInt(index, 10)
      if (blockIndex >= 0 && blockIndex < mathBlocks.length) {
        return mathBlocks[blockIndex]
      }
      return _match // Return original if index is invalid
    })
  }

  /**
   * Stage 6: Normalize and render math delimiters
   */
  const renderMathContent = (text: string): string => {
    let rendered = text

    // FIRST: Handle explicit display math using model-specific delimiters
    // This must come BEFORE implicit math detection to avoid interference
    // Sort by priority (lower numbers first) if priority is specified
    const displayDelimiters = [...config.displayMathDelimiters].sort((a, b) => {
      const priorityA = a.priority ?? 999
      const priorityB = b.priority ?? 999
      return priorityA - priorityB
    })

    displayDelimiters.forEach(({ pattern }) => {
      rendered = rendered.replace(pattern, (_match, math) => {
        return safeRenderKatex(math, true, config.katexOptions)
      })
    })

    // THEN: Handle mathematical expressions BEFORE individual symbols get processed
    // This catches expressions like "x = ..." that contain LaTeX commands
    // But skip if already rendered (inside display math delimiters)
    // Match the line including the newline to preserve line breaks
    rendered = rendered.replace(/^x\s*=\s*(.+?)(\n+|$)/gm, (_match, rightSide, newlines) => {
      const fullExpression = `x = ${rightSide}`

      // Process if it looks mathematical OR contains LaTeX commands, but doesn't already have KaTeX HTML
      const hasLatexCommands =
        /\\(sqrt|frac|cdot|times|pm|neq|leq|geq|alpha|beta|gamma|pi|theta|infty|partial)/.test(
          fullExpression
        )
      const alreadyRendered =
        fullExpression.includes('<span class="katex">') || fullExpression.includes('katex')

      // Check if the expression contains "or" or "and" connectors (multiple solutions)
      const hasConnectors = /\s+(or|and)\s+/i.test(fullExpression)

      // If it contains connectors, handle separately (bypass looksProse check for connectors)
      if (!alreadyRendered && hasConnectors) {
        const parts = fullExpression.split(/\s+(or|and)\s+/i)
        const result: string[] = []

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i].trim()
          // Check if this part is a connector word
          if (/^(or|and)$/i.test(part)) {
            result.push(` ${part} `)
          } else if (part && (looksMathematical(part) || hasLatexCommands)) {
            // Render this part as math
            result.push(safeRenderKatex(part, false, config.katexOptions))
          } else {
            // Keep as plain text
            result.push(part)
          }
        }

        // Convert newlines to <br> tags for consistency
        const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
        return result.join('') + newlineHtml
      }

      // Normal rendering for expressions without connectors
      if (
        !alreadyRendered &&
        (looksMathematical(fullExpression) || hasLatexCommands) &&
        !looksProse(fullExpression)
      ) {
        // Preserve the newlines after the line
        const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
        return safeRenderKatex(fullExpression, false, config.katexOptions) + newlineHtml
      }
      return _match
    })

    // Handle other mathematical expressions that don't have explicit delimiters
    // Match entire lines that look like equations, preserving newlines
    rendered = rendered.replace(
      /^([a-zA-Z]+[₀-₉₁-₉]*\s*=\s*[^=\n<]+?)(\n+|$)/gm,
      (_match, expression, newlines) => {
        // Process if it looks mathematical OR contains LaTeX commands, but doesn't already have KaTeX HTML
        const hasLatexCommands =
          /\\(sqrt|frac|cdot|times|pm|neq|leq|geq|alpha|beta|gamma|pi|theta|infty|partial)/.test(
            expression
          )
        const alreadyRendered =
          expression.includes('<span class="katex">') || expression.includes('katex')

        // Check if the expression contains "or" or "and" connectors (multiple solutions)
        const hasConnectors = /\s+(or|and)\s+/i.test(expression)

        // If it contains connectors, handle separately (bypass looksProse check for connectors)
        if (!alreadyRendered && hasConnectors) {
          const parts = expression.split(/\s+(or|and)\s+/i)
          const result: string[] = []

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim()
            // Check if this part is a connector word
            if (/^(or|and)$/i.test(part)) {
              result.push(` ${part} `)
            } else if (part && (looksMathematical(part) || hasLatexCommands)) {
              // Render this part as math
              result.push(safeRenderKatex(part, false, config.katexOptions))
            } else {
              // Keep as plain text
              result.push(part)
            }
          }

          // Convert newlines to <br> tags for consistency
          const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
          return result.join('') + newlineHtml
        }

        // Check if expression contains prose in parentheses (e.g., "a = 1 (coefficient of x^2)")
        // If so, split and only render the mathematical parts as math
        const proseInParensMatch = expression.match(/\(([^)]+)\)/)
        if (!alreadyRendered && proseInParensMatch) {
          const parenContent = proseInParensMatch[1]
          // If the parentheses content is prose, split the expression
          if (looksProse(parenContent)) {
            // Split into parts: the math part before parentheses and the prose in parentheses
            // Preserve original spacing by reconstructing the string carefully
            const parts: string[] = []
            let lastIndex = 0
            let match
            const parenRegex = /\(([^)]+)\)/g

            while ((match = parenRegex.exec(expression)) !== null) {
              // Add the part before this parentheses (preserve spacing)
              const beforeParen = expression.substring(lastIndex, match.index)
              if (beforeParen.trim()) {
                // Check if this part is mathematical
                const trimmedBefore = beforeParen.trim()
                if (looksMathematical(trimmedBefore) || hasLatexCommands) {
                  // Preserve leading/trailing whitespace
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
                // Just whitespace, preserve it
                parts.push(beforeParen)
              }

              // Add the parentheses content as plain text (it's prose)
              parts.push(`(${match[1]})`)
              lastIndex = match.index + match[0].length
            }

            // Add any remaining part after the last parentheses
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

            // Convert newlines to <br> tags to ensure line breaks are preserved
            // when mixing math HTML with plain text prose
            // Multiple newlines (blank lines) should become multiple <br> tags
            const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
            return parts.join('') + newlineHtml
          }
        }

        // Normal rendering for expressions without connectors
        if (
          !alreadyRendered &&
          (looksMathematical(expression) || hasLatexCommands) &&
          !looksProse(expression)
        ) {
          // Preserve the newlines after the line
          const newlineHtml = newlines ? '<br>'.repeat(newlines.length) : ''
          return safeRenderKatex(expression, false, config.katexOptions) + newlineHtml
        }
        return _match
      }
    )

    // Handle mathematical expressions within text (like verification steps)
    // Look for patterns like "2(3)² - 7(3) + 3 = 18 - 21 + 3 = 0"
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

    // Then, handle explicit inline math using model-specific delimiters
    // Sort by priority (lower numbers first) if priority is specified
    const inlineDelimiters = [...config.inlineMathDelimiters].sort((a, b) => {
      const priorityA = a.priority ?? 999
      const priorityB = b.priority ?? 999
      return priorityA - priorityB
    })

    inlineDelimiters.forEach(({ pattern }) => {
      rendered = rendered.replace(pattern, (_match, math) => {
        return safeRenderKatex(math, false, config.katexOptions)
      })
    })

    // Handle standalone LaTeX commands
    // Handle \sqrt{...} commands
    const sqrtRegex = /\\sqrt\{([^}]+)\}/g
    let sqrtMatch
    const sqrtReplacements: Array<{ start: number; end: number; replacement: string }> = []

    while ((sqrtMatch = sqrtRegex.exec(rendered)) !== null) {
      const start = sqrtMatch.index
      const end = start + sqrtMatch[0].length
      const content = sqrtMatch[1]

      // Check if already inside KaTeX HTML
      const beforeMatch = rendered.substring(0, start)
      const lastKatexStart = beforeMatch.lastIndexOf('<span class="katex">')
      const lastKatexEnd = beforeMatch.lastIndexOf('</span>')

      // Only process if not already inside KaTeX HTML
      if (lastKatexStart <= lastKatexEnd) {
        sqrtReplacements.push({
          start,
          end,
          replacement: safeRenderKatex(`\\sqrt{${content}}`, false, config.katexOptions),
        })
      }
    }

    // Apply replacements from right to left to maintain positions
    sqrtReplacements.reverse().forEach(({ start, end, replacement }) => {
      rendered = rendered.substring(0, start) + replacement + rendered.substring(end)
    })

    // Handle \frac{...}{...} commands
    rendered = rendered.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (_match, num, den) => {
      // Simple check: if match contains HTML tags, it's already rendered
      if (_match.includes('<span') || _match.includes('katex')) {
        return _match
      }
      return safeRenderKatex(`\\frac{${num}}{${den}}`, false, config.katexOptions)
    })

    // Handle \boxed with proper nested brace matching
    // This function finds the matching closing brace for \boxed{...}
    const processBoxed = (text: string): string => {
      let result = ''
      let i = 0

      while (i < text.length) {
        // Check if we're at the start of \boxed{
        if (text.substring(i).startsWith('\\boxed{')) {
          // Check if this is already inside rendered KaTeX HTML
          const beforeMatch = text.substring(0, i)
          const lastKatexStart = beforeMatch.lastIndexOf('<span class="katex">')
          const lastKatexEnd = beforeMatch.lastIndexOf('</span>')

          // If we're inside KaTeX HTML (opened but not closed), skip
          if (lastKatexStart > lastKatexEnd) {
            result += text[i]
            i++
            continue
          }

          // Find the matching closing brace
          let braceCount = 1
          const contentStart = i + 7 // Length of '\boxed{'
          let contentEnd = contentStart

          while (braceCount > 0 && contentEnd < text.length) {
            if (text[contentEnd] === '{') {
              braceCount++
            } else if (text[contentEnd] === '}') {
              braceCount--
            }
            contentEnd++
          }

          if (braceCount === 0) {
            // Found matching brace
            const content = text.substring(contentStart, contentEnd - 1)
            const cleanContent = content
              .replace(/<[^>]*>/g, '')
              .replace(/\\\(\s*([^\\]+?)\s*\\\)/g, '$1')
              .trim()
            result += safeRenderKatex(`\\boxed{${cleanContent}}`, false, config.katexOptions)
            i = contentEnd // Move past the closing brace
          } else {
            // No matching brace found, just add the character
            result += text[i]
            i++
          }
        } else {
          result += text[i]
          i++
        }
      }

      return result
    }

    rendered = processBoxed(rendered)

    // Math symbols and Greek letters
    const symbols = [
      // Operators
      { pattern: /\\cdot/g, latex: '\\cdot' },
      { pattern: /\\times/g, latex: '\\times' },
      { pattern: /\\div/g, latex: '\\div' },
      { pattern: /\\pm/g, latex: '\\pm' },
      { pattern: /\\mp/g, latex: '\\mp' },

      // Relations
      { pattern: /\\leq/g, latex: '\\leq' },
      { pattern: /\\geq/g, latex: '\\geq' },
      { pattern: /\\neq/g, latex: '\\neq' },
      { pattern: /\\approx/g, latex: '\\approx' },
      { pattern: /\\equiv/g, latex: '\\equiv' },
      { pattern: /\\sim/g, latex: '\\sim' },

      // Special symbols
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

      // Greek letters (lowercase)
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

      // Greek letters (uppercase)
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

    // Process symbols with protection against double-rendering
    symbols.forEach(({ pattern, latex }) => {
      // Use a more careful approach to avoid replacing symbols already inside rendered KaTeX HTML
      const symbolRegex = new RegExp(pattern.source, pattern.flags)
      let symbolMatch
      const symbolReplacements: Array<{ start: number; end: number; replacement: string }> = []

      while ((symbolMatch = symbolRegex.exec(rendered)) !== null) {
        const start = symbolMatch.index
        const end = start + symbolMatch[0].length

        // Check if already inside KaTeX HTML
        const beforeMatch = rendered.substring(0, start)
        const lastKatexStart = beforeMatch.lastIndexOf('<span class="katex">')
        const lastKatexEnd = beforeMatch.lastIndexOf('</span>')

        // CRITICAL: Check if we're inside inline code blocks (single backticks)
        // This prevents processing Unicode symbols that will be handled by processInlineCode in Stage 7
        const backticksBefore = (beforeMatch.match(/`/g) || []).length
        // If odd number of backticks before, we're inside an inline code block
        if (backticksBefore % 2 === 1) {
          continue // Skip - will be processed by processInlineCode
        }

        // Only process if not already inside KaTeX HTML
        if (lastKatexStart <= lastKatexEnd) {
          symbolReplacements.push({
            start,
            end,
            replacement: safeRenderKatex(latex, false, config.katexOptions),
          })
        }
      }

      // Apply replacements from right to left to maintain positions
      symbolReplacements.reverse().forEach(({ start, end, replacement }) => {
        rendered = rendered.substring(0, start) + replacement + rendered.substring(end)
      })
    })

    // Convert derivative placeholders from Stage 3 to actual fractions
    // Handle ⟨⟨DERIVATIVE_x⟩⟩(...) and ⟨⟨DERIVATIVE_x⟩⟩[...] patterns with nested parentheses/brackets
    const processDerivativePlaceholders = (text: string): string => {
      let result = text
      const derivativeRegex = /⟨⟨DERIVATIVE_([a-zA-Z])⟩⟩/g
      let match
      const replacements: Array<{ start: number; end: number; replacement: string }> = []

      // Find all derivative placeholders and process them
      while ((match = derivativeRegex.exec(result)) !== null) {
        const placeholderStart = match.index
        const placeholderEnd = placeholderStart + match[0].length
        const variable = match[1]

        // Check if followed by parentheses or brackets
        const afterPlaceholder = result.substring(placeholderEnd)

        // Try to match parentheses with nested support
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
        }
        // Try to match brackets with nested support
        else if (afterPlaceholder.startsWith('[')) {
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
        }
        // Standalone placeholder without parentheses/brackets
        else {
          replacements.push({
            start: placeholderStart,
            end: placeholderEnd,
            replacement: safeRenderKatex(`\\frac{d}{d${variable}}`, false, config.katexOptions),
          })
        }
      }

      // Apply replacements from right to left to maintain positions
      replacements.reverse().forEach(({ start, end, replacement }) => {
        result = result.substring(0, start) + replacement + result.substring(end)
      })

      return result
    }

    rendered = processDerivativePlaceholders(rendered)

    // Handle standalone d/dx (for any remaining cases not caught by Stage 3)
    rendered = rendered.replace(/\bd\/d([a-zA-Z])\b/g, (_match, variable) => {
      return safeRenderKatex(`\\frac{d}{d${variable}}`, false, config.katexOptions)
    })

    // Handle Unicode superscripts
    // CRITICAL: Only process if not already inside KaTeX HTML or inline code blocks to prevent duplication
    const superscriptRegex = /([a-zA-Z0-9])([²³⁴⁵⁶⁷⁸⁹⁰¹])/g
    let superscriptMatch
    const superscriptReplacements: Array<{ start: number; end: number; replacement: string }> = []

    while ((superscriptMatch = superscriptRegex.exec(rendered)) !== null) {
      const start = superscriptMatch.index
      const end = start + superscriptMatch[0].length
      const base = superscriptMatch[1]
      const sup = superscriptMatch[2]

      // Check if this match is already inside KaTeX HTML
      const beforeMatch = rendered.substring(0, start)
      const lastKatexStart = beforeMatch.lastIndexOf('<span class="katex">')
      const lastKatexEnd = beforeMatch.lastIndexOf('</span>')

      // If we're inside KaTeX HTML, skip processing
      if (lastKatexStart > lastKatexEnd) {
        continue // Already rendered, don't process again
      }

      // CRITICAL: Check if we're inside inline code blocks (single backticks)
      // This prevents processing Unicode superscripts that will be handled by processInlineCode in Stage 7
      const backticksBefore = (beforeMatch.match(/`/g) || []).length
      // If odd number of backticks before, we're inside an inline code block
      if (backticksBefore % 2 === 1) {
        continue // Skip - will be processed by processInlineCode
      }

      // Also check if this is already in the form base^{number}
      const afterMatch = rendered.substring(end)
      if (afterMatch.startsWith('^{')) {
        continue // Already converted, skip
      }

      const supMap: { [key: string]: string } = {
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
      superscriptReplacements.push({
        start,
        end,
        replacement: safeRenderKatex(`${base}^{${supMap[sup]}}`, false, config.katexOptions),
      })
    }

    // Apply replacements from right to left to maintain positions
    superscriptReplacements.reverse().forEach(({ start, end, replacement }) => {
      rendered = rendered.substring(0, start) + replacement + rendered.substring(end)
    })

    // Handle caret notation
    rendered = rendered.replace(/([a-zA-Z0-9]+)\^\{([^}]+)\}/g, (_match, base, exp) => {
      return safeRenderKatex(`${base}^{${exp}}`, false, config.katexOptions)
    })

    rendered = rendered.replace(/([a-zA-Z0-9])\^(\d+|[a-zA-Z])/g, (_match, base, exp) => {
      return safeRenderKatex(`${base}^{${exp}}`, false, config.katexOptions)
    })

    return rendered
  }

  /**
   * Stage 0.8: Preserve line breaks for consecutive equation lines
   * Detects consecutive lines that look like equations and ensures they're separated
   * by blank lines so they render as separate lines instead of collapsing into one paragraph
   */
  const preserveEquationLineBreaks = (text: string): string => {
    let processed = text

    // Pattern to match consecutive equation lines (lines starting with variable = ...)
    // We want to ensure there's a blank line between consecutive equation lines
    // so they render as separate lines instead of collapsing into one paragraph

    // Match lines that look like equations: start with letter(s) optionally followed by
    // subscript/superscript, then =, then math content (can include brackets, parentheses, operators, etc.)
    // We want to match consecutive such lines separated by only a single newline (not blank lines)

    // Pattern explanation:
    // ^ - start of line
    // ([a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹₀-₉₁-₉]*\s*=\s*[^\n]+) - equation line: variable, optional superscripts/subscripts, =, math content
    // \n - single newline (not \n\n which would be a blank line)
    // ([a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹₀-₉₁-₉]*\s*=\s*[^\n]+) - another equation line
    // $ - end of line
    // gm flags: global and multiline

    // Apply replacement multiple times to handle sequences of 3+ consecutive lines
    // Each pass will add blank lines between pairs, and subsequent passes will handle remaining pairs
    let previousLength = 0
    let iterations = 0
    const maxIterations = 10 // Safety limit

    while (previousLength !== processed.length && iterations < maxIterations) {
      previousLength = processed.length
      iterations++

      // Match two consecutive equation lines separated by a single newline
      // This ensures we don't match if there's already a blank line between them
      processed = processed.replace(
        /^([a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹₀-₉₁-₉]*\s*=\s*[^\n]+)\n([a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹₀-₉₁-₉]*\s*=\s*[^\n]+)$/gm,
        '$1\n\n$2'
      )
    }

    return processed
  }

  /**
   * Stage 6.5: Preserve line breaks between consecutive math expressions
   * Converts single newlines between rendered INLINE math expressions to <br> tags
   * Display math blocks (katex-display) already have block-level spacing, so we skip those
   */
  const preserveMathLineBreaks = (text: string): string => {
    let processed = text

    // We need to avoid adding <br> tags involving display math blocks
    // Display blocks have structure: <span class="katex-display"><span class="katex">...</span></span>
    // Inline blocks have structure: <span class="katex">...</span>

    // Simple approach: Match transitions between math blocks, but skip if either side is display math
    // We match: (end of math) + newlines + (start of math)
    // Then check the surrounding context to determine if it's display or inline

    // Pattern matches: closing </span> tag(s), newlines, and opening <span class="katex...
    // The pattern captures enough to distinguish between inline and display blocks
    processed = processed.replace(
      /(<\/span>(?:<\/span>)?)\s*(\n+)\s*(<span class="katex(?:-display)?")/g,
      (fullMatch, closing, newlines, opening) => {
        // Determine if we're dealing with display blocks
        // Display block closing: </span></span> (has two closing spans)
        // Display block opening: <span class="katex-display" (contains -display)
        const closingIsDisplay = closing === '</span></span>'
        const openingIsDisplay = opening.includes('katex-display')

        // Only add <br> if BOTH are inline (neither is display)
        if (closingIsDisplay || openingIsDisplay) {
          return fullMatch // Keep original - involves display math
        }

        // Both are inline math, add line break
        const newlineCount = newlines.length

        // If there's exactly one newline, convert it to <br>
        if (newlineCount === 1) {
          return `${closing}<br>${opening}`
        }

        // If there are multiple newlines, convert the first to <br> and keep one newline
        return `${closing}<br>\n${opening}`
      }
    )

    return processed
  }

  /**
   * Stage 7: Process markdown formatting
   * Uses model-specific markdown processing rules
   */
  const processMarkdown = (text: string): string => {
    const markdownRules = config.markdownProcessing || {}
    let processed = text

    // CRITICAL FIX: Some models generate headers without proper line breaks
    // Fix headers that appear mid-line by adding line breaks before them
    // Match: (non-whitespace) followed by (space) followed by (### or #### etc.)
    // Replace with: (text) + (newline) + (newline) + (header)
    processed = processed.replace(/(\S)\s+(#{1,6}\s+)/g, '$1\n\n$2')

    // Additional fix: Ensure headers start at the beginning of a line
    // This handles cases where headers might have leading whitespace or other issues
    processed = processed.replace(/^(\s*)(#{1,6}\s+)/gm, '$2')

    // CRITICAL: Remove model-generated MDPH placeholders BEFORE we introduce our own
    // This prevents them from being wrapped in HTML tags like <strong>((MDPH3))</strong>
    while (processed.includes('((MDPH')) {
      processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
    }
    while (processed.includes('{{MDPH')) {
      processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
    }
    processed = processed.replace(/\(MDPH\d+\)/g, '')
    processed = processed.replace(/\{MDPH\d+\}/g, '')
    processed = processed.replace(/(?<!⟨⟨)MDPH\d+(?!⟩⟩)/g, '')

    // CRITICAL: Protect placeholders from markdown processing by temporarily replacing them
    // This prevents bold/italic regex from matching placeholder patterns
    // Use a unique string format that won't be interpreted as HTML or markdown
    // Format: ⟨⟨MDPHN⟩⟩ using Unicode angle brackets to avoid conflicts
    const placeholderMap = new Map<string, string>()
    let placeholderCounter = 0

    // IMPORTANT: Protect full list placeholder patterns FIRST (before inline math)
    // This ensures that inline math placeholders INSIDE lists are preserved as part of the list block
    // Pattern: __UL_X__content__/UL__ or __OL_X_Y__content__/OL__ or __TASK_X__content__/TASK__
    let listPlaceholderCount = 0
    processed = processed.replace(
      /(__UL_\d+__[\s\S]*?__\/UL__|__OL_\d+_\d+__[\s\S]*?__\/OL__|__TASK_(checked|unchecked)__[\s\S]*?__\/TASK__)/g,
      match => {
        const placeholder = `⟨⟨MDPH${placeholderCounter}⟩⟩`
        placeholderMap.set(placeholder, match)
        if (match.startsWith('__OL_')) {
          listPlaceholderCount++
          console.log(`[processMarkdown] Protecting OL placeholder: ${match.substring(0, 80)}...`)
        }
        placeholderCounter++
        return placeholder
      }
    )
    console.log(`[processMarkdown] Protected ${listPlaceholderCount} OL placeholders`)

    // Protect inline math placeholders (outside of lists)
    // These use __INLINE_MATH_X__ format which would be matched by bold regex
    processed = processed.replace(/(__INLINE_MATH_\d+__)/g, match => {
      const placeholder = `⟨⟨MDPH${placeholderCounter}⟩⟩`
      placeholderMap.set(placeholder, match)
      placeholderCounter++
      return placeholder
    })

    // Protect display math placeholders
    processed = processed.replace(/(__DISPLAY_MATH_\d+__)/g, match => {
      const placeholder = `⟨⟨MDPH${placeholderCounter}⟩⟩`
      placeholderMap.set(placeholder, match)
      placeholderCounter++
      return placeholder
    })

    // Protect code block placeholders (__CODE_BLOCK_X__)
    processed = processed.replace(/(__CODE_BLOCK_\d+__)/g, match => {
      const placeholder = `⟨⟨MDPH${placeholderCounter}⟩⟩`
      placeholderMap.set(placeholder, match)
      placeholderCounter++
      return placeholder
    })

    // Tables - must come first (if enabled)
    if (markdownRules.processTables !== false) {
      processed = processed.replace(/^\|(.+)\|$/gm, (_match, content) => {
        return '__TABLE_ROW__' + content + '__/TABLE_ROW__'
      })

      // Process table rows and convert to HTML
      processed = processed.replace(/(__TABLE_ROW__[\s\S]*__\/TABLE_ROW__)+/g, match => {
        const rows = match.split('__/TABLE_ROW__').filter(row => row.trim())
        let tableHTML = '<table class="markdown-table">'
        let isHeader = true

        rows.forEach((row, index) => {
          const cleanRow = row.replace('__TABLE_ROW__', '').trim()
          // Skip separator rows (like |----|----|)
          if (cleanRow.match(/^[-|\s:]+$/)) {
            isHeader = false
            return
          }

          const cells = cleanRow
            .split('|')
            .map(cell => cell.trim())
            .filter(cell => cell)
          if (cells.length > 0) {
            const tag = isHeader ? 'th' : 'td'
            // Process markdown formatting in each cell before creating HTML
            const processedCells = cells.map(cell => {
              let processed = cell
              // Process bold and italic (bold first, then italic)
              processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              processed = processed.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')
              // Process inline code
              processed = processed.replace(/`([^`\n]+?)`/g, '<code class="inline-code">$1</code>')
              return processed
            })
            const rowHTML =
              '<tr>' + processedCells.map(cell => `<${tag}>${cell}</${tag}>`).join('') + '</tr>'
            tableHTML += rowHTML
            if (index === 0) isHeader = false
          }
        })

        tableHTML += '</table>'
        return tableHTML
      })
    }

    // Bold and italic (if enabled, preserve all spaces)
    // Process BEFORE headings and inline code so formatting works correctly
    // IMPORTANT: Process bold/italic BEFORE inline code to handle cases like **bold `code` text**
    if (markdownRules.processBoldItalic !== false) {
      // Bold: match ** but allow single * inside
      // Use a more robust pattern that handles content with HTML tags or other markdown
      processed = processed.replace(/\*\*((?:(?!\*\*)[\s\S])+?)\*\*/g, '<strong>$1</strong>')
      // Bold: match __ but allow single _ inside (underscore-based bold)
      // Note: Placeholders are already protected above, so we can safely process bold here
      processed = processed.replace(/__((?:(?!__)[\s\S])+?)__/g, '<strong>$1</strong>')
      // Italic: match single * but not when part of **
      // Improved regex to handle LaTeX content inside italic (e.g., *text with $math$*)
      // Use a more robust pattern that doesn't break on newlines or special characters
      processed = processed.replace(/(?<!\*)\*((?:(?!\*)[^\n])+?)\*(?!\*)/g, '<em>$1</em>')
      // Italic: match single _ but not when part of __ (underscore-based italic)
      // Use negative lookbehind/lookahead to avoid matching __text__ as _text_
      processed = processed.replace(/(?<!_)_((?:(?!_)[^\n])+?)_(?!_)/g, '<em>$1</em>')
    }

    // Inline code - ALWAYS process backticks to remove them from output
    // Process AFTER bold/italic so inline code inside bold works correctly
    // The config only controls whether to render as code vs math, not whether to process backticks
    // Use a more robust regex that handles edge cases
    // Match backticks, allowing for whitespace and various characters
    processed = processed.replace(/`([^`\n]+?)`/g, (_match, content) => {
      // Trim whitespace from content for detection
      const trimmedContent = content.trim()

      // If inline code processing is explicitly disabled, render as code without math detection
      if (markdownRules.processInlineCode === false) {
        return `<code class="inline-code">${content}</code>`
      }

      // Check if the content is actually LaTeX/math that should be rendered as math, not code
      // Look for LaTeX commands (like \sqrt, \frac, etc.) - this is the primary indicator
      const hasLatexCommands =
        /\\[a-zA-Z]+\{/.test(trimmedContent) ||
        /\\(sqrt|frac|cdot|times|pm|neq|leq|geq|alpha|beta|gamma|pi|theta|infty|partial|boxed)/.test(
          trimmedContent
        )

      // Check for math symbols that indicate this is math, not code
      const hasMathSymbols = /[√±×÷≤≥≈∞∑∏∫²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(trimmedContent)

      // Check if it looks like a mathematical expression (has operators, parentheses, etc.)
      // Note: - needs to be escaped or at end of character class to be literal
      const hasMathOperators = /[=+\-*/()[\] ]/.test(trimmedContent)
      const hasArithmetic = /\d+\s*[+\-*/]\s*\d+/.test(trimmedContent)

      // Check for mathematical expressions with variables and operators (e.g., ax² + bx + c = 0)
      // This catches equations that have variables with superscripts and operators
      // More permissive: match any letter followed by optional superscript and then operator
      const hasVariableExpression =
        /[a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹]*\s*[+\-*/=]/.test(trimmedContent) ||
        /[+\-*/=]\s*[a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹]*/.test(trimmedContent) ||
        // Also match patterns like "2x²" (number + variable + superscript)
        /\d+[a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹]*/.test(trimmedContent) ||
        // Match any expression with multiple variables and operators
        (/[a-zA-Z].*[+\-*/=]/.test(trimmedContent) && hasMathOperators)

      // Check for equation-like patterns (has = with content on both sides that looks like math)
      // More permissive: if it has = and any math-like content, it's probably math
      const looksLikeEquation =
        /=/.test(trimmedContent) &&
        (hasMathOperators ||
          hasMathSymbols ||
          /[a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(trimmedContent) ||
          /\d+[a-zA-Z]/.test(trimmedContent) ||
          /[a-zA-Z]\d+/.test(trimmedContent))

      // Check for mathematical coefficient notation: number followed by letter (e.g., 2a, 3x, 5y)
      // This is a common pattern in math that should be rendered as math, not code
      const hasCoefficientNotation =
        /\d+[a-zA-Z]/.test(trimmedContent) || /[a-zA-Z]\d+/.test(trimmedContent)

      // Check for negative numbers or expressions starting with minus (e.g., -5, -b, -(5))
      const hasNegativeSign = /^-\s*[\d()a-zA-Z]/.test(trimmedContent)

      // Check for expressions with parentheses that look like math (e.g., (5), 2(2), (5)²)
      const hasMathParentheses =
        /\([^)]*\)/.test(trimmedContent) && (hasMathOperators || /\d/.test(trimmedContent))

      // Check for mathematical patterns: multiple terms that look like math (e.g., 2a, ab, x2)
      // But exclude simple single letters/numbers and prose-like patterns
      const isMathematicalTerm =
        hasCoefficientNotation ||
        (trimmedContent.length > 1 &&
          /^[a-zA-Z0-9]+$/.test(trimmedContent) &&
          /\d/.test(trimmedContent) &&
          /[a-zA-Z]/.test(trimmedContent)) // Has both digits and letters

      // Check if it's a simple single number or letter (should stay as code unless it has math context)
      const isSimpleNumber = /^-?\d+$/.test(trimmedContent)
      const isSimpleLetter = /^[a-zA-Z]$/.test(trimmedContent)
      const isSimpleValue = isSimpleNumber || isSimpleLetter

      // Simple single letters/numbers without math symbols should stay as code
      // BUT: if it has a negative sign or is part of a math expression, render as math
      const isSimpleVariable =
        !hasNegativeSign &&
        !hasMathParentheses &&
        /^[a-zA-Z0-9\s,]+$/.test(trimmedContent) &&
        !hasMathSymbols &&
        !hasLatexCommands &&
        !isMathematicalTerm &&
        isSimpleValue

      // Only render as math if:
      // 1. It has LaTeX commands (definitely math), OR
      // 2. It has math symbols (like ²) AND operators - this is the most common case, OR
      // 3. It has math operators/arithmetic (even without Unicode symbols), OR
      // 4. It looks like a mathematical term (coefficient notation, etc.), OR
      // 5. It has a negative sign or math parentheses (mathematical context), OR
      // 6. It has variable expressions with superscripts and operators (e.g., ax² + bx + c = 0), OR
      // 7. It looks like an equation (has = with math-like content on both sides)

      // CRITICAL: If content has superscripts (²³⁴⁵⁶⁷⁸⁹⁰¹) AND operators, it's definitely math
      // This catches expressions like "ax² + bx + c = 0" which should always be math
      const hasSuperscripts = /[²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(trimmedContent)
      const definitelyMathWithSuperscripts = hasSuperscripts && hasMathOperators

      // If it has math symbols AND operators, it's definitely math (unless it's a simple variable)
      const definitelyMath = hasMathSymbols && hasMathOperators && !isSimpleVariable

      // More aggressive: if it has operators and contains variables/numbers/math symbols, it's probably math
      // This catches cases like "x = 1/2" or "a = 2" that might otherwise be missed
      const hasMathLikeContent = /[a-zA-Z]/.test(trimmedContent) && /\d/.test(trimmedContent)
      const probablyMath =
        hasMathOperators &&
        (hasMathLikeContent || hasMathSymbols || hasSuperscripts) &&
        !isSimpleVariable

      const shouldRenderAsMath =
        hasLatexCommands ||
        definitelyMathWithSuperscripts ||
        definitelyMath ||
        probablyMath ||
        (hasMathSymbols && (hasMathOperators || hasArithmetic) && !isSimpleVariable) ||
        ((hasMathOperators || hasArithmetic || hasNegativeSign || hasMathParentheses) &&
          !isSimpleVariable) ||
        isMathematicalTerm ||
        (hasVariableExpression && !isSimpleVariable) ||
        (looksLikeEquation && !isSimpleVariable)

      if (shouldRenderAsMath) {
        // DEBUG: Log detection
        console.log('[LatexRenderer] Detected math in backticks:', {
          original: content,
          trimmed: trimmedContent,
          hasSuperscripts,
          hasMathOperators,
          hasMathSymbols,
          definitelyMathWithSuperscripts,
          definitelyMath,
          probablyMath,
        })

        // Content inside backticks may not have been processed by fixLatexIssues
        // So we need to convert Unicode to LaTeX, but be careful to avoid double conversion
        let mathContent = content.replace(/\$/g, '').trim()

        // CRITICAL: Check if content already has LaTeX commands (from fixLatexIssues)
        // If it does, we should still check for remaining Unicode symbols that need conversion
        const hasLaTeXCommands = /\\[a-zA-Z]+/.test(mathContent)

        // CRITICAL: Convert superscripts FIRST before square root conversion
        // This prevents issues when superscripts appear inside square root expressions
        // Always convert superscripts even if LaTeX commands exist (they might be in different parts)
        // Use braces for better LaTeX compatibility: b² -> b^{2} instead of b^2
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])²+/g, '$1^{2}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])³+/g, '$1^{3}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])⁴+/g, '$1^{4}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])⁵+/g, '$1^{5}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])⁶+/g, '$1^{6}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])⁷+/g, '$1^{7}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])⁸+/g, '$1^{8}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])⁹+/g, '$1^{9}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])⁰+/g, '$1^{0}')
        mathContent = mathContent.replace(/([a-zA-Z0-9)\]])¹+/g, '$1^{1}')
        // Handle standalone superscripts (at start of expression or after operators)
        mathContent = mathContent.replace(/^²+/g, '^{2}')
        mathContent = mathContent.replace(/^³+/g, '^{3}')
        mathContent = mathContent.replace(/^⁴+/g, '^{4}')
        mathContent = mathContent.replace(/^⁵+/g, '^{5}')
        mathContent = mathContent.replace(/^⁶+/g, '^{6}')
        mathContent = mathContent.replace(/^⁷+/g, '^{7}')
        mathContent = mathContent.replace(/^⁸+/g, '^{8}')
        mathContent = mathContent.replace(/^⁹+/g, '^{9}')
        mathContent = mathContent.replace(/^⁰+/g, '^{0}')
        mathContent = mathContent.replace(/^¹+/g, '^{1}')

        // Convert Unicode square roots with proper nested parentheses handling
        // This must be done regardless of whether LaTeX commands exist, as content may have mixed Unicode and LaTeX
        mathContent = convertSquareRoots(mathContent)

        // Only do full Unicode conversion if content doesn't already have LaTeX commands
        // This prevents double conversion if fixLatexIssues already processed it
        if (!hasLaTeXCommands) {
          // Convert Unicode symbols - CRITICAL: use single replace and handle duplicates
          // Convert multiple consecutive ± to single \pm to prevent rendering duplication
          mathContent = mathContent.replace(/±+/g, '\\pm')
          mathContent = mathContent.replace(/×/g, '\\times')
          mathContent = mathContent.replace(/÷/g, '\\div')
          mathContent = mathContent.replace(/≤/g, '\\leq')
          mathContent = mathContent.replace(/≥/g, '\\geq')
          mathContent = mathContent.replace(/≈/g, '\\approx')
          mathContent = mathContent.replace(/∞/g, '\\infty')
          mathContent = mathContent.replace(/∑/g, '\\sum')
          mathContent = mathContent.replace(/∏/g, '\\prod')
          mathContent = mathContent.replace(/∫/g, '\\int')
        } else {
          // Content has LaTeX commands, but may still have Unicode symbols that weren't converted
          // Only convert Unicode symbols that aren't already LaTeX commands
          // This handles mixed content where some symbols were converted and others weren't
          mathContent = mathContent.replace(/(?<!\\)±+/g, '\\pm') // Only convert ± that isn't already \pm
          mathContent = mathContent.replace(/(?<!\\)×/g, '\\times')
          mathContent = mathContent.replace(/(?<!\\)÷/g, '\\div')
          mathContent = mathContent.replace(/(?<!\\)≤/g, '\\leq')
          mathContent = mathContent.replace(/(?<!\\)≥/g, '\\geq')
          mathContent = mathContent.replace(/(?<!\\)≈/g, '\\approx')
          mathContent = mathContent.replace(/(?<!\\)∞/g, '\\infty')
          mathContent = mathContent.replace(/(?<!\\)∑/g, '\\sum')
          mathContent = mathContent.replace(/(?<!\\)∏/g, '\\prod')
          mathContent = mathContent.replace(/(?<!\\)∫/g, '\\int')
        }

        if (mathContent) {
          try {
            const rendered = safeRenderKatex(mathContent, false, config.katexOptions)
            console.log('[LatexRenderer] Successfully rendered math:', {
              original: content,
              converted: mathContent,
              rendered: rendered.substring(0, 100) + '...',
            })
            return rendered
          } catch (e) {
            // If math rendering fails, fall back to code
            console.error('[LatexRenderer] Math rendering failed:', {
              original: content,
              converted: mathContent,
              error: e,
            })
            return `<code class="inline-code">${content}</code>`
          }
        } else {
          console.warn(
            '[LatexRenderer] mathContent is empty after processing, falling back to code:',
            {
              original: content,
              trimmed: trimmedContent,
            }
          )
          return `<code class="inline-code">${content}</code>`
        }
      }

      // Otherwise, render as regular inline code
      // DEBUG: Log when math is NOT detected
      if (hasMathOperators || hasMathSymbols || hasSuperscripts) {
        console.warn('[LatexRenderer] Math-like content NOT detected as math:', {
          original: content,
          trimmed: trimmedContent,
          hasSuperscripts,
          hasMathOperators,
          hasMathSymbols,
          hasMathLikeContent,
          isSimpleVariable,
          shouldRenderAsMath,
        })
      }
      return `<code class="inline-code">${content}</code>`
    })

    // Horizontal rules (if enabled)
    // NOTE: Horizontal rules are now processed earlier (Stage 2.5) before other markdown processing
    // This ensures they're converted before line structure is modified by other processing stages
    // This code block is kept for backward compatibility but horizontal rules should already be converted
    if (markdownRules.processHorizontalRules !== false) {
      // Double-check: process any remaining horizontal rules that weren't caught earlier
      // This is a safety net in case horizontal rules appear after Stage 2.5
      processed = processed.replace(/^---+(\s*)$/gm, '\n<hr class="markdown-hr">\n')
      processed = processed.replace(/^\*\*\*+(\s*)$/gm, '\n<hr class="markdown-hr">\n')
      processed = processed.replace(/^___+(\s*)$/gm, '\n<hr class="markdown-hr">\n')
    }

    // Headings (if enabled, longest first to avoid partial matches)
    // Process AFTER bold/italic so formatting inside headings is preserved
    if (markdownRules.processHeaders !== false) {
      // CRITICAL FIX: Ensure headers are at the start of lines before processing
      // Headers might not be at the start of lines due to HTML inserted by preserveMathLineBreaks
      // or other preprocessing steps. Normalize them by ensuring they start on new lines.
      // First, ensure headers after horizontal rules (--- converted to <hr>) are properly separated
      // Match: <hr> tag (with optional newline) followed by header marker
      processed = processed.replace(/(<hr[^>]*>\s*\n?\s*)(#{1,6}\s+)/gi, '$1\n\n$2')
      // Ensure headers after closing list tags are properly separated
      // Match: </ul> or </ol> tag (with optional newline) followed by header marker
      processed = processed.replace(/(<\/(ul|ol)[^>]*>\s*\n?\s*)(#{1,6}\s+)/gi, '$1\n\n$3')
      // Replace any header markers that are preceded by non-whitespace (except at start of string)
      // or HTML tags with a newline before them
      processed = processed.replace(/([^\n])(\s*)(#{1,6}\s+)/g, '$1\n\n$3')
      // Also handle headers that might be preceded by HTML closing tags or <br> tags
      processed = processed.replace(/(<\/span>|<br\s*\/?>)(\s*)(#{1,6}\s+)/g, '$1\n\n$3')
      // Remove any leading whitespace from headers to ensure they start cleanly
      processed = processed.replace(/^(\s*)(#{1,6}\s+)/gm, '$2')

      // More robust header matching: allow trailing whitespace and handle HTML content inside headers
      // Match headers even if they contain HTML tags from previous processing (e.g., <strong> tags)
      // Use . with /s flag equivalent ([^] or [\s\S]) but ensure single-line matching with $
      // The $ anchor ensures we only match headers that end at the line boundary
      // Process from longest to shortest to avoid partial matches (e.g., ### matching before ##)
      // Use a more permissive pattern that handles various edge cases
      processed = processed.replace(/^######\s+([^\n]+?)\s*$/gm, '<h6>$1</h6>')
      processed = processed.replace(/^#####\s+([^\n]+?)\s*$/gm, '<h5>$1</h5>')
      processed = processed.replace(/^####\s+([^\n]+?)\s*$/gm, '<h4>$1</h4>')
      processed = processed.replace(/^###\s+([^\n]+?)\s*$/gm, '<h3>$1</h3>')
      processed = processed.replace(/^##\s+([^\n]+?)\s*$/gm, '<h2>$1</h2>')
      processed = processed.replace(/^#\s+([^\n]+?)\s*$/gm, '<h1>$1</h1>')

      // Fallback: Remove any remaining header markers that weren't matched by the above patterns
      // This catches edge cases where headers might not have matched due to formatting issues
      // Only remove if they're at the start of a line and followed by a space (to avoid false positives)
      // This ensures that even if header conversion failed, at least the raw markdown won't show
      processed = processed.replace(/^######\s+/gm, '')
      processed = processed.replace(/^#####\s+/gm, '')
      processed = processed.replace(/^####\s+/gm, '')
      processed = processed.replace(/^###\s+/gm, '')
      processed = processed.replace(/^##\s+/gm, '')
      processed = processed.replace(/^#\s+/gm, '')
    }

    // Strikethrough
    processed = processed.replace(/~~([^~]+?)~~/g, '<del class="markdown-strikethrough">$1</del>')

    // Reference-style links
    const referenceMap: { [key: string]: string } = {}
    processed = processed.replace(/^\[([^\]]+)\]:\s*(.+)$/gm, (_, ref, url) => {
      referenceMap[ref.toLowerCase()] = url.trim()
      return ''
    })

    // Links (both inline and reference-style, if enabled)
    if (markdownRules.processLinks !== false) {
      processed = processed.replace(
        /\[([^\]]+)\]\(([^)]+)(?:\s+"([^"]*)")?\)/g,
        (_, text, url, title) => {
          const titleAttr = title ? ` title="${title}"` : ''
          return `<a href="${url}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
        }
      )

      // Reference-style links
      processed = processed.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, ref) => {
        const reference = ref || text.toLowerCase()
        const url = referenceMap[reference]
        if (url) {
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
        }
        return match
      })

      // Fix broken links (if enabled)
      if (markdownRules.fixBrokenLinks) {
        // Try to fix common broken link patterns
        processed = processed.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (match, text, url) => {
          if (!url || url.trim() === '') {
            // If URL is empty, try to create a link from the text
            if (text.match(/^https?:\/\//)) {
              return `<a href="${text}" target="_blank" rel="noopener noreferrer">${text}</a>`
            }
          }
          return match
        })
      }
    }

    // Images - with lazy loading and optimization
    processed = processed.replace(
      /!\[([^\]]*)\]\(([^)]+)(?:\s+"([^"]*)")?\)/g,
      (_, alt, url, title) => {
        const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
        // Add lazy loading and optimization attributes
        // For external images, use basic lazy loading
        // For internal images, vite-imagetools will handle optimization
        const isExternal =
          url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')
        const loadingAttr = isExternal ? 'loading="lazy"' : 'loading="lazy"'
        const decodingAttr = 'decoding="async"'
        const styleAttr =
          'style="max-width: 100%; height: auto; transition: opacity 0.3s ease-in-out;"'

        // For internal images, add optimization query params if not already present
        let optimizedUrl = url
        if (!isExternal && !url.includes('?')) {
          // Add width hint for optimization (vite-imagetools will process this)
          optimizedUrl = `${url}?w=1024&q=80`
        }

        return `<img src="${optimizedUrl}" alt="${alt.replace(/"/g, '&quot;')}"${titleAttr} ${loadingAttr} ${decodingAttr} ${styleAttr} />`
      }
    )

    // Restore protected placeholders after all markdown processing
    // Use simple string replacement for reliability (placeholders are unique)
    let restoredOLCount = 0
    // Sort placeholders by index (descending) to avoid conflicts when restoring
    const sortedPlaceholders = Array.from(placeholderMap.entries()).sort((a, b) => {
      // Extract numeric index from placeholder (e.g., "⟨⟨MDPH5⟩⟩" -> 5)
      const getIndex = (ph: string) => {
        const match = ph.match(/MDPH(\d+)/)
        return match ? parseInt(match[1], 10) : 0
      }
      return getIndex(b[0]) - getIndex(a[0]) // Descending order
    })

    sortedPlaceholders.forEach(([placeholder, original]) => {
      // Use split/join for reliable replacement that handles all special characters
      const beforeLength = processed.length
      const countBefore = (
        processed.match(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
      ).length

      if (original.startsWith('__OL_')) {
        restoredOLCount++
        console.log(
          `[processMarkdown] Restoring OL - Placeholder: "${placeholder}" found ${countBefore} times`
        )
        if (countBefore === 0) {
          console.log(`[processMarkdown] ERROR: Placeholder not found in processed text!`)
          console.log(`[processMarkdown] Sample of processed text:`, processed.substring(0, 200))
        }
      }

      // Escape the placeholder for regex replacement
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      processed = processed.replace(new RegExp(escapedPlaceholder, 'g'), original)

      const afterLength = processed.length
      if (original.startsWith('__OL_') && afterLength === beforeLength && countBefore > 0) {
        console.log(
          `[processMarkdown] WARNING: No change in length after restoration - placeholder not replaced!`
        )
      }
    })
    console.log(`[processMarkdown] Restored ${restoredOLCount} OL placeholders`)
    console.log(`[processMarkdown] Output contains __OL_: ${processed.includes('__OL_')}`)

    // Final safety check: remove any remaining placeholders that weren't restored
    // This handles edge cases where placeholders might have been missed
    const remainingPlaceholders = processed.match(/⟨⟨MDPH\d+⟩⟩/g)
    if (remainingPlaceholders && remainingPlaceholders.length > 0) {
      // Remove unrecovered placeholders to prevent them from appearing in output
      processed = processed.replace(/⟨⟨MDPH\d+⟩⟩/g, '')
    }

    // CRITICAL: Remove model-generated MDPH placeholders even if they're inside HTML tags
    // This catches placeholders that got wrapped in markdown formatting like **((MDPH3))**
    // Remove all variations aggressively, even inside HTML tags
    // Also handle corrupted formats like <<MDPH (from Unicode angle brackets ⟨⟨)
    while (processed.includes('((MDPH')) {
      processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
    }
    while (processed.includes('{{MDPH')) {
      processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
    }
    // Handle corrupted Unicode angle bracket format: <<MDPH (should be ⟨⟨MDPH)
    while (processed.includes('<<MDPH')) {
      processed = processed.replace(/<<MDPH\d+[^>]*>>?/g, '')
      processed = processed.replace(/<<MDPH\d+\)\)/g, '')
    }
    processed = processed.replace(/\(MDPH\d+\)/g, '')
    processed = processed.replace(/\{MDPH\d+\}/g, '')
    processed = processed.replace(/(?<!⟨⟨)MDPH\d+(?!⟩⟩)/g, '')

    return processed
  }

  /**
   * Stage 8: Convert markdown list placeholders to HTML
   */
  const convertListsToHTML = (text: string): string => {
    console.log('[convertListsToHTML] Input has __OL_:', text.includes('__OL_'))
    console.log('[convertListsToHTML] Input has ⟨⟨MDPH:', text.includes('⟨⟨MDPH'))
    if (text.includes('⟨⟨MDPH')) {
      const mdphIndex = text.indexOf('⟨⟨MDPH')
      console.log(
        '[convertListsToHTML] Sample with MDPH:',
        text.substring(mdphIndex - 50, mdphIndex + 100)
      )
      console.warn(
        '[convertListsToHTML] ERROR: Found unrecovered placeholders! These should have been restored in processMarkdown.'
      )
      // Remove any remaining placeholders to prevent them from appearing in output
      // This is a safety fallback - ideally these should never reach this stage
      text = text.replace(/⟨⟨MDPH\d+⟩⟩/g, '')
    }
    let converted = text

    // Task lists
    converted = converted.replace(/(__TASK_(checked|unchecked)__[\s\S]*?__\/TASK__)+/g, match => {
      const items = match.replace(
        /__TASK_(checked|unchecked)__([\s\S]*?)__\/TASK__/g,
        (_, checked, text) => {
          const checkedAttr = checked === 'checked' ? 'checked' : ''
          return `<li class="task-list-item"><input type="checkbox" ${checkedAttr} disabled> ${text}</li>`
        }
      )
      return `<ul class="task-list">${items}</ul>`
    })

    // Unordered lists
    converted = converted.replace(/(__UL_[\s\S]*?__\/UL__\s*)+/g, match => {
      const items: { level: number; content: string }[] = []
      const regex = /__UL_(\d+)__([\s\S]*?)__\/UL__/g
      let m

      while ((m = regex.exec(match)) !== null) {
        items.push({ level: parseInt(m[1]), content: m[2].trim() })
      }

      if (items.length === 0) return match

      // Normalize levels
      const minLevel = Math.min(...items.map(i => i.level))
      items.forEach(i => (i.level -= minLevel))

      let html = '<ul>'
      let currentLevel = 0
      const openListItems: boolean[] = [] // Track open <li> tags

      items.forEach((item, index) => {
        const nextLevel = index < items.length - 1 ? items[index + 1].level : 0

        // Close deeper levels
        while (currentLevel > item.level) {
          html += '</ul>'
          if (openListItems.length > 0) {
            html += '</li>' // Close the parent <li> that contained the nested <ul>
            openListItems.pop()
          }
          currentLevel--
        }

        // Open new item at current level
        html += `<li>${item.content}`

        // If next item is nested deeper, start a nested list
        if (nextLevel > item.level) {
          html += '<ul>'
          currentLevel++
          openListItems.push(true)
        } else {
          // Close the current list item
          html += '</li>'
        }
      })

      // Close any remaining open tags
      while (currentLevel > 0) {
        html += '</ul>'
        if (openListItems.length > 0) {
          html += '</li>'
          openListItems.pop()
        }
        currentLevel--
      }
      html += '</ul>'

      return html
    })

    // Ordered lists - match and convert each placeholder individually first
    // Then group consecutive ones if needed
    converted = converted.replace(
      /__OL_(\d+)_(\d+)__([\s\S]*?)__\/OL__/g,
      (_fullMatch, _level, num, content) => {
        // Convert each item individually with its number
        return `<ol><li value="${num}">${content.trim()}</li></ol>`
      }
    )

    // Merge consecutive <ol> tags (cleanup pass)
    converted = converted.replace(/<\/ol>\s*<ol>/g, '')

    // Handle model-generated placeholders in format ((MDPH...)) or {{MDPH...}}
    // These placeholders appear when models output placeholders for list items
    // Be very aggressive - catch all variations and concatenated placeholders
    // Handle double parentheses format: ((MDPH3)) - remove all occurrences, even concatenated
    while (converted.includes('((MDPH')) {
      converted = converted.replace(/\(\(MDPH\d+\)\)/g, '')
    }
    // Handle curly braces format: {{MDPH3}} - remove all occurrences, even concatenated
    while (converted.includes('{{MDPH')) {
      converted = converted.replace(/\{\{MDPH\d+\}\}/g, '')
    }
    // Handle single parentheses/braces as fallback
    converted = converted.replace(/\(MDPH\d+\)/g, '')
    converted = converted.replace(/\{MDPH\d+\}/g, '')
    // Remove any trailing --- that might follow placeholders (but NOT standalone horizontal rules)
    // Only match --- that's on the same line as content, not standalone --- on their own lines
    // Pattern: content followed by whitespace and --- (not a standalone line)
    converted = converted.replace(/([^\n])\s*---+\s*(?=\S)/g, '$1 ')
    // Also remove --- that's immediately after placeholders on the same line
    converted = converted.replace(/(MDPH\d+)\s*---+\s*(?=\S)/g, '$1 ')

    return converted
  }

  /**
   * Stage 9: Apply paragraph breaks
   */
  const applyParagraphBreaks = (text: string): string => {
    let processed = text

    // CRITICAL FIX: Ensure proper separation after block-level elements before paragraph processing
    // This ensures content (including bold text like "Step 2:") after <hr> or closing list tags
    // gets proper line breaks and appears on its own line
    // First, ensure content after <hr> tags is properly separated (add double line breaks)
    // Match: <hr> tag followed by optional whitespace/newlines, then any content that starts
    // We use a negative lookahead to skip if a block element follows, otherwise match the start of content
    processed = processed.replace(
      /(<hr[^>]*>)\s*\n?\s*(?!\s*<(h[1-6]|hr|ul|ol|blockquote|pre|table|div|p)[^>]*>)(?=\S)/gi,
      '$1\n\n'
    )
    // Ensure content after closing list tags is properly separated
    // Match: </ul> or </ol> followed by optional whitespace/newlines, then any content that starts
    processed = processed.replace(
      /(<\/(ul|ol)[^>]*>)\s*\n?\s*(?!\s*<(h[1-6]|hr|ul|ol|blockquote|pre|table|div|p)[^>]*>)(?=\S)/gi,
      '$1\n\n'
    )

    // CRITICAL FIX: Ensure headers are properly separated before paragraph processing
    // Headers should always be on their own line, with proper line breaks before and after
    // This prevents headers from being incorrectly wrapped in paragraph tags
    // First, ensure headers after block-level elements (like <hr>) are properly separated
    // Match: closing tag of block element (hr, div, etc.) or self-closing block element, followed by header
    processed = processed.replace(
      /(<\/(hr|h[1-6]|ul|ol|blockquote|pre|table|div|p)[^>]*>|<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>)\s*\n?\s*(<(h[1-6])[^>]*>)/gi,
      '$1\n\n$5'
    )
    // Add line breaks before opening header tags if they're not already preceded by a newline
    processed = processed.replace(/([^\n])(<(h[1-6])[^>]*>)/gi, '$1\n\n$2')
    // Add line breaks after closing header tags if they're not already followed by a newline
    processed = processed.replace(/(<\/(h[1-6])[^>]*>)([^\n<])/gi, '$1\n\n$3')

    // Line breaks
    processed = processed.replace(/ {2}\n/g, '<br>')

    // Paragraph breaks
    processed = processed.replace(/\n\n/g, '</p><p>')

    // CRITICAL: Remove paragraph tags that wrap block-level elements
    // Block-level elements (hr, headings, lists, etc.) should never be inside <p> tags
    // Apply patterns multiple times to catch nested cases and ensure all block-level elements are free

    // Repeat the cleanup until no more changes occur (handles nested/overlapping cases)
    let previousLength = 0
    let iterations = 0
    const maxIterations = 10 // Safety limit to prevent infinite loops
    while (previousLength !== processed.length && iterations < maxIterations) {
      previousLength = processed.length
      iterations++

      // Pattern 1: Remove <p> that opens before a block-level element (with any whitespace)
      // Matches: <p>...<hr> or <p>...<h3> etc.
      processed = processed.replace(
        /<p>(\s*<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>)/gi,
        '$1'
      )

      // Pattern 2: Remove </p><p> that wraps block-level elements (with optional whitespace)
      // Matches: </p><p><h3> or </p><p><hr> etc., including cases with whitespace/newlines
      processed = processed.replace(
        /(<\/p>\s*<p>)(\s*<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>)/gi,
        '</p>$2'
      )

      // Pattern 2b: Also handle </p> followed by whitespace/newlines then <p> then block element
      // Matches: </p>\n<p><h3> or </p> <p><h3> etc.
      processed = processed.replace(
        /<\/p>\s+<p>(\s*<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>)/gi,
        '</p>$1'
      )

      // Pattern 3: Remove </p> that closes after a block-level element
      // Matches: <hr></p> or <h3>...</h3></p> etc. (with optional whitespace)
      processed = processed.replace(
        /(<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>|<\/(h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*>)\s*<\/p>/gi,
        '$1'
      )

      // Pattern 4: Remove paragraph tags between block-level elements
      // Matches: <hr></p><p><h3> or <h3>...</h3></p><p><h4> etc. (with optional whitespace)
      processed = processed.replace(
        /(<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>|<\/(h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*>)\s*<\/p>\s*<p>\s*(<(h[1-6]|ul|ol|blockquote|pre|table|div|hr)[^>]*(\/)?>)/gi,
        '$1$3'
      )

      // Pattern 5: Remove orphaned </p> or <p> tags that are adjacent to block-level elements
      // Matches: </p><hr> or <hr><p> etc. (with optional whitespace)
      // IMPORTANT: Don't remove <p> after closing header tags if it's starting content (not wrapping another block element)
      processed = processed.replace(
        /<\/p>\s*(<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>)/gi,
        '$1'
      )
      // Only remove <p> before block elements, not after closing tags (content after headers should be in paragraphs)
      processed = processed.replace(
        /(<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>)\s*<p>/gi,
        '$1'
      )

      // Pattern 6: Remove any remaining <p> tags that directly contain only block-level elements
      // Matches: <p><h3>content</h3></p> -> <h3>content</h3>
      processed = processed.replace(
        /<p>(\s*<(h[1-6]|ul|ol|blockquote|pre|table|div|hr)[^>]*>[\s\S]*?<\/(h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*>)\s*<\/p>/gi,
        '$1'
      )
      processed = processed.replace(
        /<p>(\s*<(hr|h[1-6]|ul|ol|blockquote|pre|table|div)[^>]*(\/)?>)\s*<\/p>/gi,
        '$1'
      )
    }

    // Wrap in paragraphs if needed (only if content doesn't start with a block-level element)
    if (
      processed.includes('</p><p>') &&
      !processed.match(/^<(h[1-6]|ul|ol|blockquote|pre|table|div|hr)/)
    ) {
      processed = `<p>${processed}</p>`
    }

    // CRITICAL: Remove any MDPH placeholders that might have been exposed during paragraph processing
    // This ensures placeholders don't leak into the final output
    processed = processed.replace(/⟨⟨MDPH\d+⟩⟩/g, '')
    processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
    processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
    processed = processed.replace(/\(MDPH\d+\)/g, '')
    processed = processed.replace(/\{MDPH\d+\}/g, '')
    processed = processed.replace(/(?<!⟨⟨)MDPH\d+(?!⟩⟩)/g, '')

    return processed
  }

  /**
   * Main rendering pipeline
   * Uses model-specific configurations and code block preservation utilities
   */
  const renderLatex = useCallback(
    (text: string): string => {
      try {
        let processed = text

        // Stage 0: Extract code blocks FIRST (before math extraction)
        // This ensures code blocks are preserved and prevents math extraction from matching $$ inside code
        const codeBlockExtraction = extractCodeBlocks(processed)
        processed = codeBlockExtraction.text

        // Stage 0.5: Extract display math blocks BEFORE any processing
        // This protects math content from being modified by preprocessing stages
        const displayMathExtraction = extractDisplayMath(processed)
        processed = displayMathExtraction.text

        // Stage 0.6: Extract inline math blocks BEFORE any processing
        // This protects inline math content from being modified by preprocessing stages
        const inlineMathExtraction = extractInlineMath(processed)
        processed = inlineMathExtraction.text

        // Stage 0.7: Process horizontal rules VERY EARLY (before any preprocessing)
        // This ensures horizontal rules are converted before any text modification
        // Extract and protect horizontal rules by converting them to placeholders first
        const hrPlaceholders: string[] = []
        const markdownRules = config.markdownProcessing || {}
        if (markdownRules.processHorizontalRules !== false) {
          // Convert horizontal rules to protected placeholders
          processed = processed.replace(/^---+(\s*)$/gm, () => {
            const placeholder = `__HR_PLACEHOLDER_${hrPlaceholders.length}__`
            hrPlaceholders.push('<hr class="markdown-hr">')
            return placeholder
          })
          processed = processed.replace(/^\*\*\*+(\s*)$/gm, () => {
            const placeholder = `__HR_PLACEHOLDER_${hrPlaceholders.length}__`
            hrPlaceholders.push('<hr class="markdown-hr">')
            return placeholder
          })
          processed = processed.replace(/^___+(\s*)$/gm, () => {
            const placeholder = `__HR_PLACEHOLDER_${hrPlaceholders.length}__`
            hrPlaceholders.push('<hr class="markdown-hr">')
            return placeholder
          })
        }

        // Stage 2: Clean malformed content (using model-specific preprocessing)
        processed = cleanMalformedContent(processed)

        // Stage 2.5: Restore horizontal rules after preprocessing
        if (markdownRules.processHorizontalRules !== false && hrPlaceholders.length > 0) {
          hrPlaceholders.forEach((hrTag, index) => {
            processed = processed.replace(`__HR_PLACEHOLDER_${index}__`, `\n${hrTag}\n`)
          })
        }

        // Stage 0.8: Preserve line breaks for consecutive equation lines
        // This must happen early, before any processing that might collapse lines
        processed = preserveEquationLineBreaks(processed)

        // Stage 3: Fix LaTeX issues
        processed = fixLatexIssues(processed)

        // Stage 4: Convert implicit math notation
        processed = convertImplicitMath(processed)

        // Stage 5: Process markdown lists
        // Note: Inline math placeholders are kept intact inside list placeholders
        processed = processMarkdownLists(processed)

        // Stage 5.5: Restore display math blocks before rendering
        // This ensures the original math content is available for rendering
        processed = restoreDisplayMath(processed, displayMathExtraction.mathBlocks)

        // Stage 5.6: Restore inline math blocks before rendering
        // This ensures the original inline math content is available for rendering
        // IMPORTANT: Skip restoring inline math inside list placeholders to preserve placeholder structure
        processed = restoreInlineMath(processed, inlineMathExtraction.mathBlocks, true)

        // Stage 6: Render math content (using model-specific delimiters and KaTeX options)
        processed = renderMathContent(processed)

        // Stage 6.5: Preserve line breaks between consecutive math expressions
        processed = preserveMathLineBreaks(processed)

        // Stage 7: Process markdown formatting (using model-specific rules)
        processed = processMarkdown(processed)

        // Stage 7.5: Remove any MDPH placeholders that survived markdown processing
        // This is critical because placeholders might be inside HTML tags from markdown formatting
        while (processed.includes('((MDPH')) {
          processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
        }
        while (processed.includes('{{MDPH')) {
          processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
        }
        processed = processed.replace(/\(MDPH\d+\)/g, '')
        processed = processed.replace(/\{MDPH\d+\}/g, '')
        processed = processed.replace(/(?<!⟨⟨)MDPH\d+(?!⟩⟩)/g, '')

        // Stage 8: Convert lists to HTML
        processed = convertListsToHTML(processed)

        // Stage 8.3: Restore display math placeholders that might be inside converted list HTML
        // This handles cases where display math placeholders were inside list items
        // and weren't restored in Stage 5.5 because they were hidden inside list placeholders
        processed = restoreDisplayMath(processed, displayMathExtraction.mathBlocks)

        // Stage 8.4: Render display math that was restored in Stage 8.3
        // Display math blocks restored here need to be rendered since they weren't rendered in Stage 6
        const displayDelimiters = [...config.displayMathDelimiters].sort((a, b) => {
          const priorityA = a.priority ?? 999
          const priorityB = b.priority ?? 999
          return priorityA - priorityB
        })
        displayDelimiters.forEach(({ pattern }) => {
          processed = processed.replace(pattern, (_match, math) => {
            // Check if already rendered
            if (_match.includes('<span class="katex">')) {
              return _match
            }
            return safeRenderKatex(math, true, config.katexOptions)
          })
        })

        // Stage 8.5: Restore and render any inline math placeholders that were nested inside list placeholders
        // This handles cases where inline math placeholders were inside list items
        // and weren't restored in Stage 5.6 because they were hidden inside list placeholders
        processed = restoreInlineMath(processed, inlineMathExtraction.mathBlocks)

        // Render the restored inline math (using model-specific delimiters)
        const inlineDelimiters = [...config.inlineMathDelimiters].sort((a, b) => {
          const priorityA = a.priority ?? 999
          const priorityB = b.priority ?? 999
          return priorityA - priorityB
        })
        inlineDelimiters.forEach(({ pattern }) => {
          processed = processed.replace(pattern, (_match, math) => {
            // Check if already rendered
            if (_match.includes('<span class="katex">')) {
              return _match
            }
            return safeRenderKatex(math, false, config.katexOptions)
          })
        })

        // Stage 9: Apply paragraph breaks
        processed = applyParagraphBreaks(processed)

        // Stage 10: Restore code blocks from placeholders
        // restoreCodeBlocks returns markdown format, so we need to render them
        processed = restoreCodeBlocks(processed, codeBlockExtraction)

        // Render restored code blocks to HTML
        // Match code blocks in markdown format: ```language\ncontent\n```
        processed = processed.replace(
          /```([a-zA-Z0-9+#-]*)\n?([\s\S]*?)```/g,
          (_match, language, code) => {
            return renderCodeBlock(language || '', code)
          }
        )

        // Apply post-processing if configured
        if (config.postProcessing) {
          for (const postProcessor of config.postProcessing) {
            processed = postProcessor(processed)
          }
        }

        // Final cleanup - handle any remaining inline math placeholders
        // This catches placeholders that might have been missed or had underscores removed by markdown processing
        // First, try to restore standard format placeholders: __INLINE_MATH_X__
        processed = restoreInlineMath(processed, inlineMathExtraction.mathBlocks)

        // Render any restored inline math that might have been restored above
        // Reuse inlineDelimiters from Stage 8.5
        inlineDelimiters.forEach(({ pattern }) => {
          processed = processed.replace(pattern, (_match, math) => {
            // Check if already rendered
            if (_match.includes('<span class="katex">')) {
              return _match
            }
            return safeRenderKatex(math, false, config.katexOptions)
          })
        })

        // Then check for any remaining placeholders in various formats
        // Check for both formats: __INLINE_MATH_X__ and INLINEMATHX (without underscores, possibly from bold processing)
        const remainingInlineMathRegex = /(?:__)?INLINE[_\s]*MATH[_\s]*(\d+)(?:__)?/gi
        processed = processed.replace(remainingInlineMathRegex, (_match, index) => {
          const blockIndex = parseInt(index, 10)
          if (blockIndex >= 0 && blockIndex < inlineMathExtraction.mathBlocks.length) {
            // Restore the original math block and render it
            const mathBlock = inlineMathExtraction.mathBlocks[blockIndex]
            // The mathBlock contains the full match with delimiters (e.g., "$x^2$" or "\\(x^2\\)")
            // Try to extract math content by matching against known delimiter patterns
            for (const { pattern } of inlineDelimiters) {
              const match = mathBlock.match(pattern)
              if (match && match[1]) {
                // Extract the math content (group 1 contains the math without delimiters)
                return safeRenderKatex(match[1], false, config.katexOptions)
              }
            }

            // Fallback: try to extract math content by removing common delimiters
            // Remove dollar signs, backslashes with parens/brackets
            let cleaned = mathBlock.trim()
            // Remove dollar sign delimiters
            cleaned = cleaned.replace(/^\$\$?|\$\$?$/g, '')
            // Remove \( and \) delimiters
            cleaned = cleaned.replace(/^\\\(|\\\)$/g, '')
            // Remove \[ and \] delimiters
            cleaned = cleaned.replace(/^\\\[|\\\]$/g, '')
            cleaned = cleaned.trim()

            if (cleaned) {
              return safeRenderKatex(cleaned, false, config.katexOptions)
            }
          }
          // If index is invalid, remove the placeholder
          return ''
        })

        // Final cleanup - only unescape markdown characters, not LaTeX commands
        // Don't remove backslashes that are part of LaTeX commands
        processed = processed.replace(/\\([`*_#+\-.!|])/g, '$1')

        // Remove orphaned \( and \) delimiters that weren't processed as math
        // These can occur if the content inside wasn't recognized as math or if the pattern didn't match
        // We'll remove the delimiters but keep the content
        // Match \( followed by any content (non-greedy) followed by \)
        processed = processed.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, '$1')

        // Final aggressive cleanup: Remove ANY remaining MDPH or internal placeholders
        // This catches placeholders that might have escaped earlier stages
        // Apply multiple passes to ensure all variations are caught

        // First pass: Remove Unicode angle bracket format (most common internal format)
        processed = processed.replace(/⟨⟨MDPH\d+⟩⟩/g, '')

        // Second pass: Remove double parentheses format
        while (processed.includes('((MDPH')) {
          processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
        }

        // Third pass: Remove curly braces format
        while (processed.includes('{{MDPH')) {
          processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
        }

        // Fourth pass: Handle corrupted Unicode angle bracket format: <<MDPH (should be ⟨⟨MDPH)
        while (processed.includes('<<MDPH')) {
          processed = processed.replace(/<<MDPH\d+[^>]*>>?/g, '')
          processed = processed.replace(/<<MDPH\d+\)\)/g, '')
          processed = processed.replace(/<<MDPH\d+\(\(/g, '')
        }

        // Fifth pass: Remove single parentheses/braces and plain MDPH patterns
        processed = processed.replace(/\(MDPH\d+\)/g, '')
        processed = processed.replace(/\{MDPH\d+\}/g, '')

        // Sixth pass: Remove plain MDPH followed by digits (catches any remaining variations)
        // This is the most aggressive pattern and should catch everything
        processed = processed.replace(/(?<!⟨⟨)MDPH\d+(?!⟩⟩)/g, '')

        // Final pass: Remove any remaining Unicode angle bracket format (safety check)
        processed = processed.replace(/⟨⟨MDPH\d+⟩⟩/g, '')

        // Final attempt to restore any remaining placeholders before removing them
        // This handles cases where placeholders might have been missed in earlier stages
        processed = restoreDisplayMath(processed, displayMathExtraction.mathBlocks)
        processed = restoreInlineMath(processed, inlineMathExtraction.mathBlocks)

        // Render any restored math placeholders
        displayDelimiters.forEach(({ pattern }) => {
          processed = processed.replace(pattern, (_match, math) => {
            if (_match.includes('<span class="katex">')) {
              return _match
            }
            return safeRenderKatex(math, true, config.katexOptions)
          })
        })
        inlineDelimiters.forEach(({ pattern }) => {
          processed = processed.replace(pattern, (_match, math) => {
            if (_match.includes('<span class="katex">')) {
              return _match
            }
            return safeRenderKatex(math, false, config.katexOptions)
          })
        })

        // Only remove placeholders that couldn't be restored (orphaned placeholders)
        // Check if placeholder indices are valid before removing
        processed = processed.replace(/__INLINE_MATH_(\d+)__/g, (_match, index) => {
          const blockIndex = parseInt(index, 10)
          if (blockIndex >= 0 && blockIndex < inlineMathExtraction.mathBlocks.length) {
            // This placeholder should have been restored - try one more time
            const mathBlock = inlineMathExtraction.mathBlocks[blockIndex]
            for (const { pattern } of inlineDelimiters) {
              const match = mathBlock.match(pattern)
              if (match && match[1]) {
                return safeRenderKatex(match[1], false, config.katexOptions)
              }
            }
            // Fallback: extract math content manually
            let cleaned = mathBlock.trim()
            cleaned = cleaned.replace(/^\$\$?|\$\$?$/g, '')
            cleaned = cleaned.replace(/^\\\(|\\\)$/g, '')
            cleaned = cleaned.replace(/^\\\[|\\\]$/g, '')
            if (cleaned) {
              return safeRenderKatex(cleaned.trim(), false, config.katexOptions)
            }
          }
          // Invalid index - remove the placeholder
          return ''
        })

        processed = processed.replace(/__DISPLAY_MATH_(\d+)__/g, (_match, index) => {
          const blockIndex = parseInt(index, 10)
          if (blockIndex >= 0 && blockIndex < displayMathExtraction.mathBlocks.length) {
            // This placeholder should have been restored - try one more time
            const mathBlock = displayMathExtraction.mathBlocks[blockIndex]
            for (const { pattern } of displayDelimiters) {
              const match = mathBlock.match(pattern)
              if (match && match[1]) {
                return safeRenderKatex(match[1], true, config.katexOptions)
              }
            }
            // Fallback: extract math content manually
            let cleaned = mathBlock.trim()
            cleaned = cleaned.replace(/^\$\$|\$\$$/g, '')
            cleaned = cleaned.replace(/^\\\[|\\\]$/g, '')
            if (cleaned) {
              return safeRenderKatex(cleaned.trim(), true, config.katexOptions)
            }
          }
          // Invalid index - remove the placeholder
          return ''
        })

        processed = processed.replace(/__CODE_BLOCK_\d+__/g, '')

        // Remove any malformed placeholder variations (case insensitive)
        processed = processed.replace(/\b(?:INLINE|DISPLAY)[_\s]*MATH[_\s]*\d+\b/gi, '')

        // Final cleanup: Remove any remaining markdown header markers that weren't converted
        // This is a safety net to ensure headers don't show up as raw markdown in the output
        // Only match at the start of a line to avoid false positives
        processed = processed.replace(/^######\s+/gm, '')
        processed = processed.replace(/^#####\s+/gm, '')
        processed = processed.replace(/^####\s+/gm, '')
        processed = processed.replace(/^###\s+/gm, '')
        processed = processed.replace(/^##\s+/gm, '')
        processed = processed.replace(/^#\s+/gm, '')

        // ABSOLUTE FINAL cleanup: Remove ANY remaining MDPH placeholders in ALL formats
        // This is the last chance to catch placeholders before output
        // Apply in multiple passes to catch all variations
        let cleanupIterations = 0
        let previousCleanupLength = 0
        while (previousCleanupLength !== processed.length && cleanupIterations < 5) {
          previousCleanupLength = processed.length
          cleanupIterations++

          // Remove all known MDPH placeholder formats
          processed = processed.replace(/⟨⟨MDPH\d+⟩⟩/g, '')
          processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
          processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
          processed = processed.replace(/\(MDPH\d+\)/g, '')
          processed = processed.replace(/\{MDPH\d+\}/g, '')
          processed = processed.replace(/(?<!⟨⟨)MDPH\d+(?!⟩⟩)/g, '')
          processed = processed.replace(/<<MDPH\d+[^>]*>>?/g, '')
        }

        // Remove any empty placeholder shells that might remain
        processed = processed.replace(/⟨⟨\s*⟩⟩/g, '')

        return processed
      } catch (error) {
        console.error('❌ Critical error in renderLatex:', error)
        return `<div style="color: red; padding: 10px; border: 1px solid red;">
                <strong>Rendering Error:</strong> ${error instanceof Error ? error.message : String(error)}
                <pre style="margin-top: 10px; padding: 10px; background: #f5f5f5;">${text.substring(0, 500)}</pre>
            </div>`
      }
      // Helper functions (cleanMalformedContent, extractDisplayMath, etc.) are pure functions
      // defined in the component scope and don't need to be in dependencies
    },
    [
      config,
      cleanMalformedContent,
      extractDisplayMath,
      extractInlineMath,
      processMarkdown,
      processMarkdownLists,
      renderMathContent,
    ]
  )

  // ============================================================================
  // RENDER
  // ============================================================================

  // These hooks depend on renderLatex function which is defined below (around line 2409)
  // renderLatex will be available when hooks execute during render
  // Note: renderLatex is a const function, so it's not hoisted, but it will be available
  // when these hooks execute because hooks run during render after all code is parsed

  const processedContent = useMemo(() => {
    if (!isValidChildren) return ''
    return renderLatex(children)
  }, [children, isValidChildren, renderLatex])

  // Extract languages from code blocks in the content
  const detectedLanguages = useMemo(() => {
    if (!isValidChildren) return []
    const languages = new Set<string>()
    const codeBlockRegex = /```(\w+)?/g
    let match
    while ((match = codeBlockRegex.exec(children)) !== null) {
      if (match[1]) {
        const lang = match[1].toLowerCase()
        // Map aliases to Prism language names
        const languageMap: Record<string, string> = {
          js: 'javascript',
          ts: 'typescript',
          py: 'python',
          rb: 'ruby',
          sh: 'bash',
          yml: 'yaml',
          html: 'markup',
          xml: 'markup',
          'c++': 'cpp',
          cs: 'csharp',
        }
        languages.add(languageMap[lang] || lang)
      }
    }
    return Array.from(languages)
  }, [children, isValidChildren])

  // Load KaTeX CSS dynamically on component mount (only once)
  useEffect(() => {
    loadKatexCss().catch(error => {
      console.warn('Failed to load KaTeX CSS:', error)
    })
  }, [])

  // Load Prism.js dynamically when code blocks are detected

  useEffect(() => {
    if (detectedLanguages.length === 0) {
      return // No code blocks, no need to load Prism
    }

    if (isPrismLoaded()) {
      setPrismLoaded(true)
      return
    }

    // Load Prism with required languages
    loadPrism({
      languages: detectedLanguages,
      onLoad: () => {
        setPrismLoaded(true)
      },
      onError: error => {
        console.warn('Failed to load Prism.js:', error)
      },
    })
  }, [detectedLanguages])

  // Apply Prism highlighting after content is rendered and Prism is loaded

  useEffect(() => {
    if (!prismLoaded || !contentRef.current) return

    const highlightCode = () => {
      if (!contentRef.current) return

      const Prism = getPrism()
      if (!Prism || !Prism.highlightAllUnder || !Prism.languages) {
        return
      }

      try {
        // Only highlight if we have code elements
        const codeElements = contentRef.current.querySelectorAll('code[class*="language-"]')
        if (codeElements.length > 0) {
          Prism.highlightAllUnder(contentRef.current)
        }
      } catch (error) {
        console.warn('Prism.js highlighting failed:', error)
      }
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(highlightCode, 100)
    return () => clearTimeout(timer)
  }, [children, prismLoaded])

  // Early return check - must be after all hooks
  if (!isValidChildren) {
    console.error('LatexRenderer: children must be a string, got:', typeof children)
    return <div>Invalid content</div>
  }

  return (
    <div
      ref={contentRef}
      className={`latex-content ${className}`}
      dangerouslySetInnerHTML={{ __html: processedContent }}
      style={{
        whiteSpace: 'normal',
        fontFamily: 'inherit',
        lineHeight: 'inherit',
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    />
  )
}

export default LatexRenderer
