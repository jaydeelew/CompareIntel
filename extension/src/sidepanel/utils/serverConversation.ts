import type { ConversationDetail, User } from '@compareintel/core'
import { fetchConversationDetail } from '@compareintel/core'

import { apiClient } from '../api'
import type { ExtensionShellPersistedState } from '../types/shellState'

export async function loadServerConversationState(
  conversationId: number
): Promise<ExtensionShellPersistedState | null> {
  try {
    const detail: ConversationDetail = await fetchConversationDetail(apiClient, conversationId)
    const conversationHistory = detail.messages.map((message) => ({
      role: message.role,
      content: message.content,
      model_id: message.model_id ?? undefined,
    }))

    return {
      input: '',
      selectedModels: detail.models_used,
      results: [],
      conversationId: detail.id,
      conversationHistory,
      error: null,
      sharePageContext: false,
      collapsedResultIds: [],
      submittedPrompt: detail.input_data,
      activeRecentChatId: null,
      closedModelIds: [],
      pageContexts: [],
      pageContextUnavailable: true,
    }
  } catch {
    return null
  }
}

export function formatClientSource(source?: string): string {
  return source === 'extension' ? 'Extension' : 'Web'
}

export function isSignedInUser(user: User | null | undefined): user is User {
  return user != null
}
