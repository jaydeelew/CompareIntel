/**
 * Detect which renderable features are present in the *source* markdown of a
 * model reply. Used to distinguish "the model never wrote this" (not-covered)
 * from "the model wrote it and the renderer dropped it" (fail).
 */

export interface SourceFeatures {
  hasDisplayMath: boolean
  hasInlineMath: boolean
  hasCodeBlocks: boolean
  hasTables: boolean
  hasLinks: boolean
  hasNestedLists: boolean
  hasCurrency: boolean
  hasCodeDollars: boolean
}

function stripFencedCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '')
}

function stripInlineCode(markdown: string): string {
  return markdown.replace(/`[^`\n]*`/g, '')
}

function extractFencedBlocks(markdown: string): string[] {
  const blocks: string[] = []
  const re = /```[^\n]*\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    blocks.push(m[1])
  }
  return blocks
}

function stripMathSpans(markdown: string): string {
  return markdown
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/(?<!\\)\$(?!\$)(?:\\\$|[^$\n])+?(?<!\\)\$/g, ' ')
}

function hasDisplayMath(text: string): boolean {
  return (
    /\$\$[\s\S]+?\$\$/.test(text) ||
    /\\\[[\s\S]+?\\\]/.test(text) ||
    /\\begin\{(?:align\*?|equation\*?|gather\*?|multline\*?)\}/.test(text)
  )
}

function hasInlineMath(text: string): boolean {
  if (/\\\([\s\S]+?\\\)/.test(text)) return true
  return /(?<!\\)\$(?!\$)(?:\\\$|[^$\n])+?(?<!\\)\$/.test(text)
}

function hasNestedLists(text: string): boolean {
  const indents: number[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^([ \t]*)(?:[-*+]|\d+\.)[ \t]+\S/)
    if (!m) continue
    indents.push(m[1].replace(/\t/g, '    ').length)
  }
  if (indents.length === 0) return false
  const min = Math.min(...indents)
  const levels = new Set(indents.map(i => i - min))
  return levels.size >= 3
}

export function detectSourceFeatures(markdown: string): SourceFeatures {
  const fenced = extractFencedBlocks(markdown)
  const withoutFences = stripFencedCode(markdown)
  const prose = stripInlineCode(withoutFences)
  const proseNoMath = stripMathSpans(prose)

  return {
    hasDisplayMath: hasDisplayMath(prose),
    hasInlineMath: hasInlineMath(prose),
    hasCodeBlocks: fenced.length > 0 || /```/.test(markdown),
    hasTables: /^\s*\|.+\|/m.test(prose),
    hasLinks: /\[[^\]]+\]\([^)\s]+\)/.test(prose),
    hasNestedLists: hasNestedLists(prose),
    hasCurrency: /\$\d/.test(proseNoMath),
    hasCodeDollars: fenced.some(block => block.includes('$')),
  }
}
