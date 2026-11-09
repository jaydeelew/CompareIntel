import type { HtmlSignature } from './signature'

export interface Diff {
  field: string
  expected: unknown
  actual: unknown
  enhancement?: boolean
}

export interface CompareResult {
  pass: boolean
  diffs: Diff[]
}

function sameStringArrays(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function compareSignatures(ref: HtmlSignature, actual: HtmlSignature): CompareResult {
  const diffs: Diff[] = []

  if (actual.leftoverPlaceholders.length) {
    diffs.push({
      field: 'leftoverPlaceholders',
      expected: [],
      actual: actual.leftoverPlaceholders,
    })
  }
  if (actual.katexErrors.length) {
    diffs.push({ field: 'katexErrors', expected: [], actual: actual.katexErrors })
  }

  if (norm(ref.visibleText) !== norm(actual.visibleText)) {
    diffs.push({
      field: 'visibleText',
      expected: norm(ref.visibleText),
      actual: norm(actual.visibleText),
    })
  }

  if (!sameStringArrays(ref.fencedCode.map(norm), actual.fencedCode.map(norm))) {
    diffs.push({ field: 'fencedCode', expected: ref.fencedCode, actual: actual.fencedCode })
  }

  if (ref.blockCodeCount !== actual.blockCodeCount) {
    diffs.push({
      field: 'blockCodeCount',
      expected: ref.blockCodeCount,
      actual: actual.blockCodeCount,
    })
  }

  if (!sameStringArrays(ref.codeSpans, actual.codeSpans)) {
    diffs.push({ field: 'codeSpans', expected: ref.codeSpans, actual: actual.codeSpans })
  }

  if (ref.listItemCount !== actual.listItemCount) {
    diffs.push({
      field: 'listItemCount',
      expected: ref.listItemCount,
      actual: actual.listItemCount,
    })
  }

  if (!sameStringArrays(ref.listItems.map(norm), actual.listItems.map(norm))) {
    diffs.push({ field: 'listItems', expected: ref.listItems, actual: actual.listItems })
  }

  const refTables = JSON.stringify(ref.tableCells)
  const actTables = JSON.stringify(actual.tableCells)
  if (refTables !== actTables) {
    diffs.push({ field: 'tableCells', expected: ref.tableCells, actual: actual.tableCells })
  }

  if (!sameStringArrays(ref.texSources.map(norm), actual.texSources.map(norm))) {
    diffs.push({ field: 'texSources', expected: ref.texSources, actual: actual.texSources })
  }

  if (ref.displayMathCount !== actual.displayMathCount) {
    diffs.push({
      field: 'displayMathCount',
      expected: ref.displayMathCount,
      actual: actual.displayMathCount,
    })
  }
  if (ref.inlineMathCount !== actual.inlineMathCount) {
    diffs.push({
      field: 'inlineMathCount',
      expected: ref.inlineMathCount,
      actual: actual.inlineMathCount,
    })
  }

  const extraDelims = actual.leftoverDelimiters.filter(d => !ref.leftoverDelimiters.includes(d))
  if (extraDelims.length) {
    diffs.push({
      field: 'leftoverDelimiters',
      expected: ref.leftoverDelimiters,
      actual: extraDelims,
    })
  }

  const refDouble = ref.dollarRuns.filter(s => s === '$$').length
  const actDouble = actual.dollarRuns.filter(s => s === '$$').length
  if (refDouble !== actDouble) {
    diffs.push({
      field: 'dollarRuns.$$',
      expected: ref.dollarRuns,
      actual: actual.dollarRuns,
    })
  }

  if (ref.emDashCount !== actual.emDashCount) {
    diffs.push({
      field: 'emDashCount',
      expected: ref.emDashCount,
      actual: actual.emDashCount,
    })
  }

  if (!sameStringArrays(ref.strayBackticks, actual.strayBackticks)) {
    diffs.push({
      field: 'strayBackticks',
      expected: ref.strayBackticks,
      actual: actual.strayBackticks,
    })
  }

  if (!sameStringArrays(ref.headings, actual.headings)) {
    diffs.push({ field: 'headings', expected: ref.headings, actual: actual.headings })
  }

  if (!sameStringArrays(ref.linkHrefs, actual.linkHrefs)) {
    diffs.push({ field: 'linkHrefs', expected: ref.linkHrefs, actual: actual.linkHrefs })
  }

  if (!sameStringArrays(ref.strongTexts, actual.strongTexts)) {
    diffs.push({ field: 'strongTexts', expected: ref.strongTexts, actual: actual.strongTexts })
  }
  if (!sameStringArrays(ref.emTexts, actual.emTexts)) {
    diffs.push({ field: 'emTexts', expected: ref.emTexts, actual: actual.emTexts })
  }
  if (ref.blockquoteCount !== actual.blockquoteCount) {
    diffs.push({
      field: 'blockquoteCount',
      expected: ref.blockquoteCount,
      actual: actual.blockquoteCount,
    })
  }
  if (!sameStringArrays(ref.listTags, actual.listTags)) {
    diffs.push({ field: 'listTags', expected: ref.listTags, actual: actual.listTags })
  }

  return { pass: diffs.length === 0, diffs }
}
