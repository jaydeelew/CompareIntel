import type { ModelResult } from '@compareintel/core'

import type { SavedPageContext } from '../utils/pageContextSnapshot'

export type { SavedPageContext }

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
  activeModelDefaultId?: string | null
  closedModelIds?: string[]
  pageContexts?: SavedPageContext[]
  pageContextCollapsed?: boolean
  pageContextUnavailable?: boolean
}
