/**
 * Code Block Preservation System
 *
 * Critical: Code blocks must be preserved exactly as received.
 * This system extracts code blocks before processing and restores them after.
 */

import { isInsideOuterDisplayMath } from './latex/mathRenderer'
import logger from './logger'

/**
 * Represents a code block that has been extracted
 */
export interface CodeBlock {
  /** Unique identifier for this code block */
  id: string
  /** Language identifier (if specified) */
  language: string
  /** Original code content */
  content: string
  /** Start position in original text */
  startIndex: number
  /** End position in original text */
  endIndex: number
  /** Placeholder that replaces the code block */
  placeholder: string
}

/**
 * Result of code block extraction
 */
export interface CodeBlockExtraction {
  /** Text with code blocks replaced by placeholders */
  text: string
  /** Array of extracted code blocks */
  blocks: CodeBlock[]
  /** Map of placeholder -> code block for quick lookup */
  placeholderMap: Map<string, CodeBlock>
}

function linePrefix(text: string, index: number): string {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1
  return text.slice(lineStart, index)
}

/** Line-start fence (≤3 spaces) or mid-paragraph prose before ```. */
function isFenceOpenerPrefix(prefix: string): boolean {
  if (/^[ \t]{0,3}$/.test(prefix)) return true
  if (/^[ \t]{4,}$/.test(prefix)) return false
  if (/^[ \t]{0,3}(?:>[ \t]*)+$/.test(prefix)) return false
  return /\S/.test(prefix)
}

function extractFencedCodeBlocks(
  text: string,
  blocks: CodeBlock[],
  placeholderMap: Map<string, CodeBlock>,
  nextPlaceholder: () => string
): string {
  let cursor = 0
  let out = ''
  while (cursor < text.length) {
    const tick = text.indexOf('```', cursor)
    if (tick === -1) {
      out += text.slice(cursor)
      break
    }
    const prefix = linePrefix(text, tick)
    if (!isFenceOpenerPrefix(prefix)) {
      out += text.slice(cursor, tick + 3)
      cursor = tick + 3
      continue
    }
    // Line-start fences keep PR 216's "rest of the line is the info string"
    // so ````markdown` is one opener. Mid-paragraph openers (Llama 3.3) may
    // only have a language token before the newline — prose after ``` is not a fence.
    const lineStartFence = /^[ \t]{0,3}$/.test(prefix)
    const openerRe = lineStartFence
      ? /^```([a-zA-Z0-9+#-]*)[^\n]*\n/
      : /^```([a-zA-Z0-9+#-]*)[ \t]*\n/
    const opener = openerRe.exec(text.slice(tick))
    if (!opener) {
      out += text.slice(cursor, tick + 3)
      cursor = tick + 3
      continue
    }
    const closerRe = /^[ \t]{0,3}```/gm
    closerRe.lastIndex = tick + opener[0].length
    const closer = closerRe.exec(text)
    if (!closer) {
      out += text.slice(cursor, tick + 3)
      cursor = tick + 3
      continue
    }
    const content = text.slice(tick + opener[0].length, closer.index)
    const lang = (opener[1] || '').trim()
    const placeholder = nextPlaceholder()
    const block: CodeBlock = {
      id: `block-${blocks.length}`,
      language: lang,
      content: content.replace(/^\n+|\n+$/g, ''),
      startIndex: tick,
      endIndex: closer.index + closer[0].length,
      placeholder,
    }
    blocks.push(block)
    placeholderMap.set(placeholder, block)
    out += text.slice(cursor, tick) + placeholder
    cursor = closer.index + closer[0].length
  }
  return out
}

/**
 * Extract all code blocks from text and replace with placeholders
 *
 * Handles:
 * - Fenced code blocks (```language\ncontent\n```)
 * - Indented code blocks (4+ spaces)
 * - Nested code blocks
 * - Code blocks containing math-like content
 * - Code blocks containing dollar signs
 *
 * @param text - Original text containing code blocks
 * @returns Extraction result with placeholders and code blocks
 */
export function extractCodeBlocks(text: string): CodeBlockExtraction {
  const blocks: CodeBlock[] = []
  const placeholderMap = new Map<string, CodeBlock>()
  let processed = text
  let blockCounter = 0

  // A fenced block needs a newline after the info string and a closer at the
  // start of a line (0–3 spaces). The opener may sit mid-paragraph when the
  // rest of that line is only the info string (`The code block ```python`),
  // which is how Llama 3.3 70B wrote prompt 06. Not a fence:
  // - same-line `` ``` ``` `` (table cell bug 27)
  // - prose after the opener (`Use ``` for fences`)
  // - a 4-space indent (that closer cannot be a 0–3 space fence, so treating
  //   it as an opener swallows the next real fence and the math after it)
  // - a blockquote marker alone (`> ```python`), whose closer is `> ``` `
  processed = extractFencedCodeBlocks(processed, blocks, placeholderMap, () => {
    const placeholder = `__CODE_BLOCK_${blockCounter}__`
    blockCounter++
    return placeholder
  })

  // Then, extract indented code blocks (4+ spaces at start of line)
  // We need to be careful not to match regular indented text
  // Indented code blocks are consecutive lines starting with 4+ spaces
  // Only extract if it looks like code (has code-like patterns, not prose)
  const indentedBlockRegex = /(?:^|\n)((?: {4,}|\t+).*(?:\n(?: {4,}|\t+).*)*)/gm

  processed = processed.replace(indentedBlockRegex, (match, content, offset) => {
    // Skip if this is already a placeholder
    if (match.includes('__CODE_BLOCK_')) {
      return match
    }

    // Indented `&=` lines inside $$...$$ / \[...\] are align continuations,
    // not markdown code (GLM 5.3 06 leaked __CODE_BLOCK_ into KaTeX).
    const start = typeof offset === 'number' ? offset : 0
    if (isInsideOuterDisplayMath(processed, start + (match.startsWith('\n') ? 1 : 0))) {
      return match
    }

    // Skip if too short (probably not a code block)
    if (match.trim().length < 10) {
      return match
    }

    // Skip if this contains markdown formatting (bold, italic, links, headers, lists)
    // This includes:
    // - Bold: ** or __
    // - Links: [text](url)
    // - Headers: #
    // - List markers: * , - , + , or numbered lists like 1.
    if (match.match(/\*\*|__|\[.*\]\(|#+\s/)) {
      return match // Probably markdown, not code
    }

    // Skip if this looks like markdown list items (indented lists are common in markdown)
    // Check for lines that start with list markers after the indentation
    const listMarkerPattern = /^\s*[*\-+]\s+|^\s*\d+\.\s+/m
    if (listMarkerPattern.test(match)) {
      return match // This is a markdown list, not code
    }

    // Skip if this contains LaTeX delimiters - it should be processed as math, not code
    // Check for display math delimiters: $$, \[, \]
    // This prevents LaTeX formulas from being extracted as code blocks
    const latexDelimiters = [
      /\$[^$]*\$/, // Inline math: $...$
      /\$\$[\s\S]*?\$\$/, // Display math: $$...$$
      /\\\([\s\S]*?\\\)/, // Inline math: \(...\)
      /\\\[[\s\S]*?\\\]/, // Display math: \[...\]
      /\\frac\{/, // LaTeX fractions
      /\\sqrt\{/, // LaTeX square roots
      /\\pm|\pm/, // Plus-minus symbol
      /\\cdot|\\times/, // LaTeX operators
    ]

    const containsLatex = latexDelimiters.some(pattern => pattern.test(match))
    if (containsLatex) {
      return match // This is LaTeX/math, not code - let it be processed as math
    }

    // Skip if this contains mathematical notation without explicit LaTeX delimiters
    // Check for mathematical patterns:
    // 1. Mathematical operators and symbols (including Unicode superscripts and subscripts)
    // 2. Variables with exponents (like b², x³) or subscripts (like x₁, x₂)
    // 3. Mathematical expressions with equals signs and operators
    const mathPatterns = [
      /[×·÷±≠≤≥≈∞∑∏∫√²³⁴⁵⁶⁷⁸⁹⁰¹₀₁₂₃₄₅₆₇₈₉]/, // Mathematical operators, superscripts, and subscripts
      /[a-z][²³⁴⁵⁶⁷⁸⁹⁰¹₀₁₂₃₄₅₆₇₈₉]/, // Variables with Unicode superscripts or subscripts (b², x³, x₁, x₂)
      /[a-z]\^[0-9{]/, // Variables with caret notation (x^2)
      /[a-z]_[0-9{]/, // Variables with underscore subscript notation (x_1)
      /\([^)]*\)[²³⁴⁵⁶⁷⁸⁹⁰¹]/, // Parentheses with superscripts ((-4)²)
      /\d+\s*[×·÷]\s*\d+/, // Number multiplication/division (4 × 2)
      /\d+\s*[+-]\s*\([^)]+\)/, // Number plus/minus parentheses (16 - (-48))
      /\b[a-z]+\s*=\s*[^=\n]+=\s*\d+/, // Multiple equals in sequence (b² = (-4)² = 16)
    ]

    const containsMath = mathPatterns.some(pattern => pattern.test(match))
    if (containsMath) {
      return match // This is mathematical notation, not code - let it be processed as math
    }

    // Skip if it looks like prose (contains common prose words/phrases)
    const prosePatterns = [
      /\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|can|must)\b/i,
      /\b(this|that|these|those|it|they|we|you|he|she|him|her|his|hers|their|them)\b/i,
      /\b(and|or|but|if|then|else|when|where|why|how|what|which|who|whom)\b/i,
    ]

    const looksLikeProse = prosePatterns.some(pattern => pattern.test(match))
    if (looksLikeProse && match.split(/\s+/).length > 5) {
      return match // Probably prose, not code
    }

    // Check if it has code-like patterns (operators, brackets, etc.)
    const codePatterns = [
      /[{}();=<>[\]]/, // Brackets and operators
      /\b(function|def|class|import|export|const|let|var|return|if|else|for|while)\b/, // Code keywords
      /^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[:=]/, // Variable assignment
    ]

    const looksLikeCode = codePatterns.some(pattern => pattern.test(match))
    if (!looksLikeCode) {
      return match // Doesn't look like code
    }

    // This looks like an indented code block
    const cleanContent = content.replace(/^ {4,}|\t+/gm, '') // Remove indentation
    const placeholder = `__CODE_BLOCK_${blockCounter}__`

    const block: CodeBlock = {
      id: `block-${blockCounter}`,
      language: '', // No language specified for indented code blocks
      content: cleanContent,
      startIndex: offset,
      endIndex: offset + match.length,
      placeholder,
    }

    blocks.push(block)
    placeholderMap.set(placeholder, block)
    blockCounter++

    return `\n${placeholder}`
  })

  return {
    text: processed,
    blocks,
    placeholderMap,
  }
}

/**
 * Restore code blocks from placeholders
 *
 * @param text - Text with placeholders
 * @param extraction - Original extraction result
 * @returns Text with code blocks restored
 */
export function restoreCodeBlocks(text: string, extraction: CodeBlockExtraction): string {
  let restored = text

  // Restore blocks in reverse order to preserve indices
  const sortedBlocks = [...extraction.blocks].sort((a, b) => b.startIndex - a.startIndex)

  for (const block of sortedBlocks) {
    // Restore the original code block content
    // For now, we'll use a simple placeholder replacement
    // The actual HTML rendering will be handled by the renderer
    restored = restored.replace(block.placeholder, () => {
      // Return a marker that will be processed by the renderer
      // The renderer will convert this to the actual code block HTML
      return `\`\`\`${block.language}\n${block.content}\n\`\`\``
    })
  }

  return restored
}

/**
 * Verify that code blocks were preserved correctly
 *
 * @param original - Original text
 * @param restored - Restored text
 * @param extraction - Extraction result
 * @returns True if verification passes
 */
export function verifyCodeBlockPreservation(
  original: string,
  restored: string,
  _extraction: CodeBlockExtraction
): boolean {
  // Extract code blocks from both original and restored
  const originalExtraction = extractCodeBlocks(original)
  const restoredExtraction = extractCodeBlocks(restored)

  // Compare block counts
  if (originalExtraction.blocks.length !== restoredExtraction.blocks.length) {
    logger.warn(
      `Code block count mismatch: original has ${originalExtraction.blocks.length}, ` +
        `restored has ${restoredExtraction.blocks.length}`
    )
    return false
  }

  // Compare each block's content
  for (let i = 0; i < originalExtraction.blocks.length; i++) {
    const originalBlock = originalExtraction.blocks[i]
    const restoredBlock = restoredExtraction.blocks[i]

    if (originalBlock.content !== restoredBlock.content) {
      logger.warn(
        `Code block content mismatch at index ${i}:\n` +
          `Original: ${originalBlock.content.substring(0, 50)}...\n` +
          `Restored: ${restoredBlock.content.substring(0, 50)}...`
      )
      return false
    }

    if (originalBlock.language !== restoredBlock.language) {
      logger.warn(
        `Code block language mismatch at index ${i}: ` +
          `original="${originalBlock.language}", restored="${restoredBlock.language}"`
      )
      return false
    }
  }

  return true
}

/**
 * Check if text contains code blocks
 *
 * @param text - Text to check
 * @returns True if text contains code blocks
 */
export function hasCodeBlocks(text: string): boolean {
  return /```[\s\S]*?```/.test(text) || /(?:^|\n)(?: {4,}|\t+).*(?:\n(?: {4,}|\t+).*)*/m.test(text)
}
