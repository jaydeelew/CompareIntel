import {
  importConversations,
  type CompareIntelApiClient,
} from '@compareintel/core'

import { listRecentChats, upsertRecentChat } from './recentChats'

export async function importExtensionChatsToAccount(
  client: CompareIntelApiClient
): Promise<number[]> {
  const chats = await listRecentChats()
  const pending = chats.filter(
    (chat) =>
      chat.state.conversationId == null &&
      chat.importedToAccount !== true &&
      (chat.state.conversationHistory.length > 0 || chat.state.results.length > 0)
  )
  if (pending.length === 0) return []

  const payload = pending.map((chat) => {
    const history = chat.state.conversationHistory
    const messages =
      history.length > 0
        ? history.map((message) => ({
            role: (message.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: message.content,
            model_id: message.model_id ?? null,
          }))
        : [
            {
              role: 'user' as const,
              content: chat.title,
              model_id: null,
            },
          ]
    return {
      input_data: chat.title,
      models_used: chat.state.selectedModels,
      messages,
      client_source: 'extension',
      created_at: new Date(chat.updatedAt).toISOString(),
      saved: chat.saved === true,
    }
  })

  const { imported_ids } = await importConversations(client, payload)
  const syncedIds: number[] = []
  for (let index = 0; index < pending.length; index += 1) {
    const conversationId = imported_ids[index]
    const chat = pending[index]
    if (chat == null) continue
    await upsertRecentChat({
      id: chat.id,
      state: {
        ...chat.state,
        conversationId: conversationId ?? chat.state.conversationId,
      },
      sourceTabId: chat.sourceTabId,
      sourceTabTitle: chat.sourceTabTitle,
      sourceTabUrl: chat.sourceTabUrl,
      importedToAccount: true,
    })
    if (typeof conversationId === 'number') syncedIds.push(conversationId)
  }
  return syncedIds
}
