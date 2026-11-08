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
