export interface ConversationHistoryMessage {
  role: string
  content: string
  model_id?: string
}

/**
 * Count messages in context from a per-model perspective.
 *
 * Multi-model comparisons store one shared user message plus one assistant
 * message per model in the flat history array. Each model only sees its own
 * assistant replies, so the displayed count should not treat every model
 * response as additional shared context.
 */
export function getPerModelContextMessageCount(
  history: ConversationHistoryMessage[],
  selectedModels: string[] = []
): number {
  if (history.length === 0) return 0

  const userCount = history.filter((m) => m.role === 'user').length
  const assistantMessages = history.filter((m) => m.role === 'assistant')

  const assistantsByModel = new Map<string, number>()
  for (const message of assistantMessages) {
    if (!message.model_id) continue
    assistantsByModel.set(
      message.model_id,
      (assistantsByModel.get(message.model_id) ?? 0) + 1
    )
  }

  const modelsInHistory = [...assistantsByModel.keys()]
  const modelsToCount =
    selectedModels.length > 0 ? selectedModels : modelsInHistory.length > 0 ? modelsInHistory : []

  const assistantPerModel =
    modelsToCount.length > 0
      ? Math.max(...modelsToCount.map((modelId) => assistantsByModel.get(modelId) ?? 0))
      : assistantMessages.length

  return userCount + assistantPerModel
}
