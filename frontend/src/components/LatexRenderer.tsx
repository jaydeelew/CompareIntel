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

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'

import { getModelConfig } from '../config/modelRendererRegistry'
import { extractCodeBlocks, restoreCodeBlocks } from '../utils/codeBlockPreservation'
import { loadKatexCss } from '../utils/katexLoader'
import {
  cleanMalformedContent,
  fixLatexIssues,
  convertImplicitMath,
  processMarkdownLists,
  renderCodeBlock,
  extractDisplayMath,
  restoreDisplayMath,
  extractInlineMath,
  restoreInlineMath,
  renderMathContent,
  preserveEquationLineBreaks,
  preserveMathLineBreaks,
  safeRenderKatex,
  convertSquareRoots,
} from '../utils/latex'
import { loadPrism, getPrism, isPrismLoaded } from '../utils/prismLoader'

interface LatexRendererProps {
  children: string
  className?: string
  modelId?: string
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

  const mathRendererConfig = useMemo(
    () => ({
      displayMathDelimiters: config.displayMathDelimiters,
      inlineMathDelimiters: config.inlineMathDelimiters,
      katexOptions: config.katexOptions,
    }),
    [config]
  )

  /**
   * Stage 7: Process markdown formatting
   * Uses model-specific markdown processing rules
   */
  const processMarkdown = (text: string): string => {
    const markdownRules = config.markdownProcessing || {}
    let processed = text

    // Some models generate headers without proper line breaks - add line breaks before them
    // Match: (non-whitespace) followed by (space) followed by (### or #### etc.)
    // Replace with: (text) + (newline) + (newline) + (header)
    processed = processed.replace(/(\S)\s+(#{1,6}\s+)/g, '$1\n\n$2')

    // Additional fix: Ensure headers start at the beginning of a line
    // This handles cases where headers might have leading whitespace or other issues
    processed = processed.replace(/^(\s*)(#{1,6}\s+)/gm, '$2')

    // Remove model-generated MDPH placeholders before we introduce our own to avoid HTML wrapping
    while (processed.includes('((MDPH')) {
      processed = processed.replace(/\(\(MDPH\d+\)\)/g, '')
    }
    while (processed.includes('{{MDPH')) {
      processed = processed.replace(/\{\{MDPH\d+\}\}/g, '')
    }
    processed = processed.replace(/\(MDPH\d+\)/g, '')
    processed = processed.replace(/\{MDPH\d+\}/g, '')
    processed = processed.replace(/(?<!⟨⟨)MDPH\d+(?!⟩⟩)/g, '')

    // Protect placeholders from markdown processing by temporarily replacing them
    // Use a unique string format that won't be interpreted as HTML or markdown
    // Format: ⟨⟨MDPHN⟩⟩ using Unicode angle brackets to avoid conflicts
    const placeholderMap = new Map<string, string>()
    let placeholderCounter = 0

    // Protect full list placeholder patterns first so inline math inside lists is preserved
    // Pattern: __UL_X__content__/UL__ or __OL_X_Y__content__/OL__ or __TASK_X__content__/TASK__
    processed = processed.replace(
      /(__UL_\d+__[\s\S]*?__\/UL__|__OL_\d+_\d+__[\s\S]*?__\/OL__|__TASK_(checked|unchecked)__[\s\S]*?__\/TASK__)/g,
      match => {
        const placeholder = `⟨⟨MDPH${placeholderCounter}⟩⟩`
        placeholderMap.set(placeholder, match)
        placeholderCounter++
        return placeholder
      }
    )

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
    // Process bold/italic before inline code to handle cases like **bold `code` text**
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

      // Content with superscripts and operators (e.g. ax² + bx + c = 0) is always math
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
        // Content inside backticks may not have been processed by fixLatexIssues
        // So we need to convert Unicode to LaTeX, but be careful to avoid double conversion
        let mathContent = content.replace(/\$/g, '').trim()

        // If content has LaTeX commands, still check for remaining Unicode symbols to convert
        const hasLaTeXCommands = /\\[a-zA-Z]+/.test(mathContent)

        // Convert superscripts before square root conversion
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
          // Use single replace to handle duplicates; convert consecutive ± to single \pm
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
            return rendered
          } catch {
            // If math rendering fails, fall back to code
            return `<code class="inline-code">${content}</code>`
          }
        } else {
          return `<code class="inline-code">${content}</code>`
        }
      }

      // Otherwise, render as regular inline code
      return `<code class="inline-code">${content}</code>`
    })

    // Horizontal rules (if enabled)
    // Horizontal rules are processed in Stage 2.5 before other markdown processing
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
      // Ensure headers are at the start of lines before processing (preserveMathLineBreaks may have inserted HTML)
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

        // For internal images, add optimization query params if not already present
        let optimizedUrl = url
        if (!isExternal && !url.includes('?')) {
          // Add width hint for optimization (vite-imagetools will process this)
          optimizedUrl = `${url}?w=1024&q=80`
        }

        // Add aspect-ratio placeholder to prevent layout shift (Lighthouse best practice)
        // Using 16:9 as default for unknown dimensions
        const styleAttr =
          'style="max-width: 100%; height: auto; aspect-ratio: 16/9; transition: opacity 0.3s ease-in-out;"'
        const altText = alt && alt.trim() ? alt.replace(/"/g, '&quot;') : 'Image'
        return `<img src="${optimizedUrl}" alt="${altText}"${titleAttr} ${loadingAttr} ${decodingAttr} ${styleAttr} />`
      }
    )

    // Restore protected placeholders after all markdown processing
    // Use simple string replacement for reliability (placeholders are unique)
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
      // Escape the placeholder for regex replacement
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      processed = processed.replace(new RegExp(escapedPlaceholder, 'g'), original)
    })

    // Final safety check: remove any remaining placeholders that weren't restored
    // This handles edge cases where placeholders might have been missed
    const remainingPlaceholders = processed.match(/⟨⟨MDPH\d+⟩⟩/g)
    if (remainingPlaceholders && remainingPlaceholders.length > 0) {
      // Remove unrecovered placeholders to prevent them from appearing in output
      processed = processed.replace(/⟨⟨MDPH\d+⟩⟩/g, '')
    }

    // Remove model-generated MDPH placeholders even if inside HTML tags (e.g. **((MDPH3))**)
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
    if (text.includes('⟨⟨MDPH')) {
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

    // Ensure proper separation after block-level elements (e.g. content after <hr> or closing list tags)
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

    // Ensure headers are on their own line with proper separation
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

    // Remove paragraph tags that wrap block-level elements (hr, headings, lists)
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
      // Don't remove <p> after closing header tags if it's starting content
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

    // Remove MDPH placeholders exposed during paragraph processing
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

        // Normalize double-escaped LaTeX in non-code content (e.g., \\( ... \\), \\frac)
        // Some models/providers emit extra escaping; collapse one slash so delimiters/commands parse.
        processed = processed
          .replace(/\\\\(?=[()[\]])/g, '\\')
          .replace(
            /\\\\(?=(?:frac|sqrt|left|right|boxed|pm|mp|neq|leq|geq|cdot|times|div|Rightarrow|Leftarrow|rightarrow|leftarrow|alpha|beta|gamma|delta|theta|pi|infty|displaystyle)\b)/g,
            '\\'
          )

        // Stage 0.5: Extract display math blocks BEFORE any processing
        // This protects math content from being modified by preprocessing stages
        const displayMathExtraction = extractDisplayMath(processed, config.displayMathDelimiters)
        processed = displayMathExtraction.text

        // Stage 0.6: Extract inline math blocks BEFORE any processing
        // This protects inline math content from being modified by preprocessing stages
        const inlineMathExtraction = extractInlineMath(processed, config.inlineMathDelimiters)
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
        processed = cleanMalformedContent(processed, config.preprocessing || {})

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
        // Skip restoring inline math inside list placeholders to preserve structure
        processed = restoreInlineMath(processed, inlineMathExtraction.mathBlocks, true)

        // Stage 6: Render math content (using model-specific delimiters and KaTeX options)
        processed = renderMathContent(processed, mathRendererConfig)

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

        // Render any remaining \\( \\) delimited math (double-escaped variant)
        processed = processed.replace(/\\\\\(\s*([\s\S]*?)\s*\\\\\)/g, (_match, math) => {
          if (_match.includes('<span class="katex">')) return math.trim()
          const trimmed = math.trim()
          if (!trimmed) return ''
          return safeRenderKatex(trimmed, false, config.katexOptions)
        })

        // Render any remaining \( \) delimited math that wasn't processed earlier
        processed = processed.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, math) => {
          if (_match.includes('<span class="katex">')) return math.trim()
          const trimmed = math.trim()
          if (!trimmed) return ''
          return safeRenderKatex(trimmed, false, config.katexOptions)
        })

        // Remove orphan opening delimiters before already-rendered KaTeX spans
        // (can occur when upstream patterns consume a closing \) unexpectedly).
        processed = processed.replace(/\\\\?\(\s*(?=<span class="katex">)/g, '')

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
        return `<div style="color: red; padding: 10px; border: 1px solid red;">
                <strong>Rendering Error:</strong> ${error instanceof Error ? error.message : String(error)}
                <pre style="margin-top: 10px; padding: 10px; background: #f5f5f5;">${text.substring(0, 500)}</pre>
            </div>`
      }
      // Helper functions (cleanMalformedContent, extractDisplayMath, etc.) are pure functions
      // that only depend on `config`. They are included in deps for correctness, and config
      // is the primary dependency that triggers recalculation.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config]
  )

  // RENDER

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
    loadKatexCss().catch(() => {
      // Silently handle KaTeX CSS loading errors
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
      onError: () => {
        // Silently handle Prism.js loading errors
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
      } catch {
        // Silently handle Prism highlighting errors
      }
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(highlightCode, 100)
    return () => clearTimeout(timer)
  }, [children, prismLoaded])

  // Early return check - must be after all hooks
  if (!isValidChildren) {
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
