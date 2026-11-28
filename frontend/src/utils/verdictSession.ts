/**
 * Local, per-turn verdict UI decisions. Nothing here is persisted or sent
 * to the API. A new user turn gets a fresh favorite.
 */

import type { ModelConversation } from '../types/conversation'

import { isErrorMessage } from './error'

export function toggleFavorite(current: string | null, modelId: string): string | null {
  return current === modelId ? null : modelId
}

export function verdictTurnKey(conversations: ModelConversation[]): string {
  return conversations
    .map(conversation => {
      const users = conversation.messages.filter(message => message.type === 'user')
      const last = users[users.length - 1]
      return `${conversation.modelId}:${users.length}:${last?.id ?? ''}`
    })
    .join('|')
}

export function isSuccessfulVerdictModel(
  conversation: ModelConversation,
  modelErrorStates: Record<string, boolean> = {}
): boolean {
  if (!conversation?.modelId) return false
  if (modelErrorStates[conversation.modelId] === true) return false

  let assistant: ModelConversation['messages'][number] | undefined
  for (const message of conversation.messages) {
    if (message.type === 'assistant') assistant = message
  }
  if (!assistant) return false

  const hasImages = (assistant.images?.length ?? 0) > 0
  if (!hasImages && isErrorMessage(assistant.content)) return false
  if (hasImages) return true
  return assistant.content.trim().length > 0
}

export function successfulVerdictModelIds(
  conversations: ModelConversation[],
  modelErrorStates: Record<string, boolean> = {}
): string[] {
  const ids: string[] = []
  for (const conversation of conversations) {
    if (isSuccessfulVerdictModel(conversation, modelErrorStates)) {
      ids.push(conversation.modelId)
    }
  }
  return ids
}

export function comparisonFinishedForVerdict(
  conversations: ModelConversation[],
  modelProcessingStates: Record<string, boolean>,
  isComparisonLoading: boolean
): boolean {
  if (isComparisonLoading || conversations.length === 0) return false
  return conversations.every(conversation => !modelProcessingStates[conversation.modelId])
}

export function verdictControlsVisible(options: {
  enabled: boolean
  tutorialActive: boolean
  finished: boolean
  successCount: number
}): boolean {
  return options.enabled && !options.tutorialActive && options.finished && options.successCount >= 2
}
