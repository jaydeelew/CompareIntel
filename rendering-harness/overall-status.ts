import type { AssertionStatus, AssertionResult } from './dom-assertions.js'

/** Truncation is incomplete coverage, never a comprehensive pass and never a renderer fail. */
export type OverallStatus = AssertionStatus | 'truncated'

export function isTruncatedReply(data: {
  truncated?: boolean
  finishReason?: string | null
  nativeFinishReason?: string | null
}): boolean {
  if (data.truncated === true) return true
  const finish = (data.finishReason || '').toLowerCase()
  const native = (data.nativeFinishReason || '').toLowerCase()
  return finish === 'length' || native === 'length' || native === 'max_tokens'
}

function isRendererLossFail(assertion: AssertionResult): boolean {
  if (assertion.status !== 'fail') return false
  return (
    /lost it/.test(assertion.message) ||
    /unsafe javascript/.test(assertion.message)
  )
}

/**
 * Combine DOM validation with finish-reason truncation.
 * Truncated replies stay `truncated` even when DOM checks pass.
 * Renderer-loss / unsafe links still fail. KaTeX errors on a truncated
 * (incomplete) source are not promoted to renderer failure.
 */
export function overallStatus(opts: {
  truncated: boolean
  error?: string
  validation?: { status: AssertionStatus; assertions: AssertionResult[] }
}): OverallStatus {
  if (opts.error) return 'fail'
  const validation = opts.validation
  if (!validation) return opts.truncated ? 'truncated' : 'fail'
  if (validation.assertions.some(isRendererLossFail)) return 'fail'
  if (opts.truncated) return 'truncated'
  return validation.status
}

export interface CoverageRecord {
  modelId: string
  promptName: string
  truncated?: boolean
  finishReason?: string | null
  nativeFinishReason?: string | null
  timestamp?: string
}

/**
 * One coverage cell per (modelId, promptName). A complete (non-truncated) later
 * attempt replaces a truncated original; originals are never deleted from history.
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
    const recordTruncated = isTruncatedReply(record)
    const existingTruncated = isTruncatedReply(existing)
    if (existingTruncated && !recordTruncated) {
      byKey.set(key, record)
      continue
    }
    if (!existingTruncated && recordTruncated) continue
    if ((record.timestamp || '') > (existing.timestamp || '')) {
      byKey.set(key, record)
    }
  }
  return [...byKey.values()]
}
