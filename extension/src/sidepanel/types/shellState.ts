import type { ModelResult } from '@compareintel/core'

export interface ExtensionShellPersistedState {
  input: string
  selectedModels: string[]
  results: ModelResult[]
  conversationId: number | null
  conversationHistory: Array<{ role: string; content: string; model_id?: string }>
  error: string | null
  sharePageContext: boolean
  collapsedResultIds: string[]
  submittedPrompt: string
  activeRecentChatId?: string | null
}
