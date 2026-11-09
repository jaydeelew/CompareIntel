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

  const extraDelims = actual.leftoverDelimiters.filter(d => !ref.leftoverDelimiters.includes(d))
  if (extraDelims.length) {
    diffs.push({
      field: 'leftoverDelimiters',
      expected: ref.leftoverDelimiters,
      actual: extraDelims,
    })
  }

  if (!sameStringArrays(ref.codeSpans, actual.codeSpans)) {
    diffs.push({ field: 'codeSpans', expected: ref.codeSpans, actual: actual.codeSpans })
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
  const extraDollars = actual.literalDollars.filter(
    s => s.length > 1 && !ref.literalDollars.includes(s)
  )
  const missingDollars = ref.literalDollars.filter(
    s => s.length > 1 && !actual.literalDollars.includes(s)
  )
  const missingAreMathLike = missingDollars.every(s => /^\$[A-Za-z\\]/.test(s))
  if (extraDollars.length) {
    diffs.push({
      field: 'literalDollars.extra',
      expected: ref.literalDollars,
      actual: extraDollars,
    })
  } else if (missingDollars.length && !missingAreMathLike) {
    diffs.push({
      field: 'literalDollars.missing',
      expected: missingDollars,
      actual: actual.literalDollars,
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

  const missingHeadings = ref.headings.filter(h => !actual.headings.includes(h))
  if (missingHeadings.length) {
    diffs.push({ field: 'headings', expected: missingHeadings, actual: actual.headings })
  }

  const refTables = JSON.stringify(ref.tableCells)
  const actTables = JSON.stringify(actual.tableCells)
  if (refTables !== actTables) {
    diffs.push({ field: 'tableCells', expected: ref.tableCells, actual: actual.tableCells })
  }

  if (!sameStringArrays(ref.linkHrefs, actual.linkHrefs)) {
    diffs.push({ field: 'linkHrefs', expected: ref.linkHrefs, actual: actual.linkHrefs })
  }

  // Fewer math spans than the naive $ / \[ extractor is OK when those spans were
  // delimiter examples (`$...$`, `\[...\]`) or when currency protection applies.
  // More math than CommonMark (which leaves `$x$` as text) is an allowed enhancement.

  return { pass: diffs.length === 0, diffs }
}
