/**
 * Live paid-call accounting used by the harness runner.
 * Tests inject a transport; production wraps OpenRouter fetch. No API in tests.
 *
 * Missing usage.cost is unknown spend (actualCost/resolution stay null), not a
 * catalog-token guess. After beginRequest, any interrupted POST must be
 * reconciled as unknown — it cannot be forgotten as $0.
 */

import crypto from 'node:crypto'
import {
  type CatalogPricing,
  type PricingInfo,
  type UsageLike,
  SharedCostGuard,
} from './budget-guard.js'

export function requestMayHaveBeenBilled(
  httpStatus: number | undefined,
  transportFailed: boolean
): boolean {
  if (transportFailed) return true
  if (httpStatus === 200) return true
  if (httpStatus != null && httpStatus >= 500) return true
  return false
}

export interface PaidTransportResult {
  httpStatus: number
  usage?: UsageLike | null
  content?: string
}

export type PaidTransport = (req: {
  modelId: string
  prompt: string
  completionCap: number
}) => Promise<PaidTransportResult>

export async function runPaidPromptAttempt(opts: {
  guard: SharedCostGuard
  modelId: string
  prompt: string
  completionCap: number
  catalog?: CatalogPricing
  pricing?: PricingInfo
  promptName?: string
  transport: PaidTransport
}): Promise<{
  response: string
  actualCost: number
  usage?: UsageLike | null
  error?: string
  skipped?: boolean
  callId?: string
}> {
  const callId =
    opts.guard.batchId + ':' + crypto.randomUUID() + ':' + opts.modelId + ':' + (opts.promptName || '')
  const context = { callId, modelId: opts.modelId, promptName: opts.promptName }
  let intentPersisted = false
  try {
    const reserve = opts.guard.reserve({
      modelId: opts.modelId,
      prompt: opts.prompt,
      completionCap: opts.completionCap,
      catalog: opts.catalog,
    })
    opts.guard.beginRequest(reserve, context)
    intentPersisted = true
  } catch (guardError) {
    const reason = guardError instanceof Error ? guardError.message : String(guardError)
    return { response: '', actualCost: 0, error: reason, skipped: true, callId }
  }

  try {
    const result = await opts.transport({
      modelId: opts.modelId,
      prompt: opts.prompt,
      completionCap: opts.completionCap,
    })
    if (result.httpStatus !== 200) {
      try {
        opts.guard.markUnknown(`OpenRouter HTTP ${result.httpStatus}`, context)
      } catch {
        /* persisted */
      }
      return {
        response: '',
        actualCost: 0,
        usage: result.usage,
        error: `OpenRouter HTTP ${result.httpStatus}`,
        callId,
      }
    }
    const usage = result.usage ?? null
    if (!usage || typeof usage.cost !== 'number' || !Number.isFinite(usage.cost) || usage.cost < 0) {
      try {
        opts.guard.markUnknown('Missing/invalid usage.cost', context)
      } catch {
        /* persisted */
      }
      return {
        response: result.content || '',
        actualCost: 0,
        usage,
        error: 'Unknown billed cost: fail closed',
        callId,
      }
    }
    opts.guard.observe(opts.modelId, usage, true, context)
    return {
      response: result.content || '',
      actualCost: usage.cost,
      usage,
      callId,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const notSent = /OPENROUTER_API_KEY|API key/i.test(message)
    if (intentPersisted && !notSent) {
      try {
        opts.guard.markUnknown(message, context)
      } catch {
        /* persisted */
      }
    }
    return {
      response: '',
      actualCost: 0,
      error: message,
      callId,
    }
  }
}
