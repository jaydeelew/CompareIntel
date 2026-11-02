/**
 * Derive Verdict panel rows from conversation data the app already has.
 * Missing cost/latency stays null so the UI can show a dash.
 */

import { createModelId } from '../types'
import type { PerModelUsage } from '../types/comparison'
import type { ModelConversation } from '../types/conversation'

import { isErrorMessage } from './error'

export interface VerdictModelRow {
  modelId: string
  modelName: string
  content: string
  costUsd: number | null
  latencyMs: number | null
  isError: boolean
}

export function lookupPerModelUsage(
  perModel: Record<string, PerModelUsage> | undefined,
  modelId: string
): PerModelUsage | undefined {
  if (!perModel) return undefined
  const direct = perModel[modelId]
  if (direct) return direct
  const target = createModelId(modelId)
  for (const [key, value] of Object.entries(perModel)) {
    if (createModelId(key) === target) return value
  }
  return undefined
}

export function latencyMsBetween(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const delta = end - start
  return delta > 0 ? delta : null
}

export function formatVerdictCost(costUsd: number | null | undefined): string {
  if (costUsd == null || Number.isNaN(costUsd)) return '—'
  if (costUsd === 0) return '$0'
  if (costUsd < 0.0001) return '<$0.0001'
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`
  return `$${costUsd.toFixed(3)}`
}

export function formatVerdictLatency(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function latestAssistantAndUser(conversation: ModelConversation): {
  assistant: ModelConversation['messages'][number] | undefined
  user: ModelConversation['messages'][number] | undefined
} {
  let assistant: ModelConversation['messages'][number] | undefined
  let user: ModelConversation['messages'][number] | undefined
  for (const message of conversation.messages) {
    if (message.type === 'assistant') assistant = message
    if (message.type === 'user') user = message
  }
  return { assistant, user }
}

export function collectLatestPrompt(conversations: ModelConversation[]): string {
  for (let i = conversations.length - 1; i >= 0; i -= 1) {
    const messages = conversations[i]?.messages ?? []
    for (let j = messages.length - 1; j >= 0; j -= 1) {
      if (messages[j].type === 'user' && messages[j].content.trim()) {
        return messages[j].content
      }
    }
  }
  return ''
}

export function collectVerdictModelRows(
  conversations: ModelConversation[],
  allModels: Array<{ id: string; name: string }>,
  modelErrorStates: Record<string, boolean> = {},
  perModelUsage?: Record<string, PerModelUsage>
): VerdictModelRow[] {
  return conversations
    .filter(conversation => conversation?.modelId)
    .map(conversation => {
      const { assistant, user } = latestAssistantAndUser(conversation)
      const content = assistant?.content ?? ''
      const hasImages = (assistant?.images?.length ?? 0) > 0
      const isError =
        modelErrorStates[conversation.modelId] === true || (!hasImages && isErrorMessage(content))

      const usage = lookupPerModelUsage(perModelUsage, conversation.modelId)
      const costFromMessage = assistant?.cost_usd
      const costFromUsage = usage?.cost_usd
      const costUsd =
        costFromMessage != null ? costFromMessage : costFromUsage != null ? costFromUsage : null

      const latencyMs =
        assistant?.latency_ms != null && assistant.latency_ms > 0
          ? assistant.latency_ms
          : latencyMsBetween(user?.timestamp, assistant?.timestamp)

      const model = allModels.find(item => String(item.id) === String(conversation.modelId))

      return {
        modelId: conversation.modelId,
        modelName: model?.name || conversation.modelId,
        content,
        costUsd,
        latencyMs,
        isError,
      }
    })
}

export function highlightExtremes(rows: VerdictModelRow[]): {
  cheapestIds: Set<string>
  fastestIds: Set<string>
} {
  const costValues = rows
    .map(row => row.costUsd)
    .filter((value): value is number => value != null && !Number.isNaN(value))
  const latencyValues = rows
    .map(row => row.latencyMs)
    .filter((value): value is number => value != null && !Number.isNaN(value) && value > 0)

  const minCost = costValues.length > 0 ? Math.min(...costValues) : null
  const minLatency = latencyValues.length > 0 ? Math.min(...latencyValues) : null

  return {
    cheapestIds: new Set(
      minCost == null ? [] : rows.filter(row => row.costUsd === minCost).map(row => row.modelId)
    ),
    fastestIds: new Set(
      minLatency == null
        ? []
        : rows.filter(row => row.latencyMs === minLatency).map(row => row.modelId)
    ),
  }
}
