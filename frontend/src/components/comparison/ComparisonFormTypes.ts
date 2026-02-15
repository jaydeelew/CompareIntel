import type { SavedModelSelection } from '../../hooks/useSavedModelSelections'
import type { ConversationSummary } from '../../types'

import type { AttachedFile, StoredAttachedFile } from './FileUpload'

export interface HistoryProps {
  showHistoryDropdown: boolean
  setShowHistoryDropdown: (show: boolean) => void
  conversationHistory: ConversationSummary[]
  isLoadingHistory: boolean
  historyLimit: number
  currentVisibleComparisonId: string | null
  onLoadConversation: (summary: ConversationSummary) => void
  onDeleteConversation: (summary: ConversationSummary, e: React.MouseEvent) => void
}

export interface SelectionProps {
  savedModelSelections: SavedModelSelection[]
  onSaveModelSelection: (name: string) => { success: boolean; error?: string }
  onLoadModelSelection: (id: string) => void
  onDeleteModelSelection: (id: string) => void
  onSetDefaultSelection: (id: string | null) => void
  getDefaultSelectionId: () => string | null
  getDefaultSelection: () => SavedModelSelection | null
  defaultSelectionOverridden: boolean
  canSaveMoreSelections: boolean
  maxSavedSelections: number
}

export interface FileProps {
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  setAttachedFiles: (files: (AttachedFile | StoredAttachedFile)[]) => void
  onExpandFiles?: (
    files: (AttachedFile | StoredAttachedFile)[],
    userInput: string
  ) => Promise<string>
}
