import type { AssertionStatus, AssertionResult } from './dom-assertions.js'

/**
 * Truncation / empty visible replies are incomplete coverage: never a
 * comprehensive pass and never a renderer fail.
 */
export type OverallStatus = AssertionStatus | 'truncated' | 'incomplete'

export function isTruncatedReply(data: {
  truncated?: boolean
  finishReason?: string | null
  nativeFinishReason?: string | null
}): boolean {
  if (data.truncated === true) return true
  const finish = (data.finishReason || '').toLowerCase()
  const native = (data.nativeFinishReason || '').toLowerCase()
  return (
    finish === 'length' ||
    native === 'length' ||
    native === 'max_tokens' ||
    native === 'max_output_tokens'
  )
}

/** Visible assistant text is empty (all completion tokens may still be reasoning). */
export function isEmptyVisibleReply(response?: string | null): boolean {
  return !(response || '').trim()
}

export function isIncompleteReply(data: {
  truncated?: boolean
  finishReason?: string | null
  nativeFinishReason?: string | null
  response?: string | null
  emptyVisible?: boolean
}): boolean {
  return data.emptyVisible === true || isEmptyVisibleReply(data.response) || isTruncatedReply(data)
}

function isRendererLossFail(assertion: AssertionResult): boolean {
  if (assertion.status !== 'fail') return false
  return (
    /lost it/.test(assertion.message) ||
    /unsafe javascript/.test(assertion.message)
  )
}

/**
 * Combine DOM validation with finish-reason truncation and empty visible text.
 * Empty reasoning-only replies are `incomplete`. Truncated non-empty replies
 * stay `truncated`. Neither is a renderer fail. Renderer-loss / unsafe links
 * still fail. KaTeX errors on incomplete source are not promoted to fail.
 */
export function overallStatus(opts: {
  truncated: boolean
  emptyVisible?: boolean
  error?: string
  validation?: { status: AssertionStatus; assertions: AssertionResult[] }
}): OverallStatus {
  if (opts.error) return 'fail'
  const validation = opts.validation
  const rendererLoss = Boolean(validation?.assertions.some(isRendererLossFail))
  if (rendererLoss) return 'fail'
  if (opts.emptyVisible) return 'incomplete'
  if (opts.truncated) return 'truncated'
  if (!validation) return 'fail'
  return validation.status
}

export interface CoverageRecord {
  modelId: string
  promptName: string
  truncated?: boolean
  emptyVisible?: boolean
  response?: string | null
  finishReason?: string | null
  nativeFinishReason?: string | null
  timestamp?: string
}

/**
 * One coverage cell per (modelId, promptName). A complete later attempt
 * replaces truncated/empty provenance; originals stay in history.
 * Do not treat incomplete cells as concluded unique coverage.
 */
export function uniqueCoverageRecords<T extends CoverageRecord>(records: T[]): T[] {
  const byKey = new Map<string, T>()
  for (const record of records) {
    const key = `${record.modelId}::${record.promptName}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, record)
      continue
    }
    const recordOpen = isIncompleteReply(record)
    const existingOpen = isIncompleteReply(existing)
    if (existingOpen && !recordOpen) {
      byKey.set(key, record)
      continue
    }
    if (!existingOpen && recordOpen) continue
    if ((record.timestamp || '') > (existing.timestamp || '')) {
      byKey.set(key, record)
    }
  }
  return [...byKey.values()]
}
