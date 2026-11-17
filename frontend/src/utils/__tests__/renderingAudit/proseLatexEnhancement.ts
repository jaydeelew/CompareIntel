import type { Diff } from './compare'
import type { HtmlSignature } from './signature'

const SOURCE_UNDELIMITED_RE =
  /(?<!\$)(?<![A-Za-z])\\(?:sqrt|frac|dfrac|tfrac|cdot|times|pi|theta|alpha|beta|gamma|le|ge|leq|geq|approx)\b/

export const PROSE_LATEX_ENHANCEMENT_FIELDS = [
  'visibleText',
  'texSources',
  'inlineMathCount',
  'displayMathCount',
  'tableCells',
  'codeSpans',
  'fencedCode',
  'listItems',
  'listItemCount',
  'listTags',
  'strongTexts',
  'emTexts',
  'headings',
  'blockCodeCount',
  'strayBackticks',
] as const

const ENHANCEMENT_FIELDS = new Set<string>(PROSE_LATEX_ENHANCEMENT_FIELDS)

export function proseLatexEnhancementFields(markdown: string): Set<string> {
  if (!SOURCE_UNDELIMITED_RE.test(proseOutsideFences(markdown))) return new Set()
  return new Set(PROSE_LATEX_ENHANCEMENT_FIELDS)
}

function proseOutsideFences(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '')
}

/** Product renders undelimited prose LaTeX; the independent reference leaves it as text. */
export function filterProseLatexEnhancementDiffs(
  diffs: Diff[],
  markdown: string,
  actual: HtmlSignature
): Diff[] {
  if (diffs.length === 0) return diffs
  if (!SOURCE_UNDELIMITED_RE.test(proseOutsideFences(markdown))) return diffs
  if (!diffs.every(diff => ENHANCEMENT_FIELDS.has(diff.field))) return diffs
  const visible = diffs.find(diff => diff.field === 'visibleText')
  if (!visible) return diffs
  const expected = String(visible.expected ?? '')
  const rendered = String(visible.actual ?? '')
  if (!/\\(sqrt|frac|dfrac|cdot|times|pi|theta)\b/.test(expected)) return diffs
  if (/\\(sqrt|frac|dfrac|cdot|times|pi|theta)\b/.test(rendered)) return diffs
  if (actual.katexErrors.length > 0) return diffs
  if (actual.inlineMathCount + actual.displayMathCount === 0) return diffs
  return []
}