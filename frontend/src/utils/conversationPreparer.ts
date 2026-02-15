/**
 * Conversation history formatting for API requests
 */

import type { AttachedFile, StoredAttachedFile } from '../components/comparison'
import type { ModelConversation } from '../types'

export interface ApiConversationMessage {
  role: 'user' | 'assistant'
  content: string
  model_id?: string
}

export interface PrepareConversationParams {
  isFollowUpMode: boolean
  conversations: ModelConversation[]
  selectedModels: string[]
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  expandFiles: (files: (AttachedFile | StoredAttachedFile)[], text: string) => Promise<string>
  getSuccessfulModels: (models: string[]) => string[]
  isModelFailed: (modelId: string) => boolean
}

export async function prepareApiConversationHistory(
  params: PrepareConversationParams
): Promise<ApiConversationMessage[]> {
  const {
    isFollowUpMode,
    conversations,
    selectedModels,
    attachedFiles,
    expandFiles,
    getSuccessfulModels,
    isModelFailed,
  } = params

  if (!isFollowUpMode || conversations.length === 0) {
    return []
  }

  const successfulSelectedModels = getSuccessfulModels(selectedModels)
  const selectedConversations = conversations.filter(conv => {
    if (!successfulSelectedModels.includes(conv.modelId)) return false
    if (isModelFailed(conv.modelId)) return false
    return true
  })

  if (selectedConversations.length === 0) {
    return []
  }

  type MessageWithTs = ApiConversationMessage & { timestamp: string }
  const allMessages: MessageWithTs[] = []

  selectedConversations.forEach(conv => {
    conv.messages.forEach(msg => {
      allMessages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
        model_id: msg.type === 'assistant' ? conv.modelId : undefined,
        timestamp: msg.timestamp,
      })
    })
  })

  const seenUserMessages = new Set<string>()
  const deduplicatedMessages: MessageWithTs[] = []
  const sortedMessages = [...allMessages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  sortedMessages.forEach(msg => {
    if (msg.role === 'user') {
      const key = `${msg.content}-${Math.floor(new Date(msg.timestamp).getTime() / 1000)}`
      if (!seenUserMessages.has(key)) {
        seenUserMessages.add(key)
        deduplicatedMessages.push(msg)
      }
    } else {
      deduplicatedMessages.push(msg)
    }
  })

  const expandedMessages = await Promise.all(
    deduplicatedMessages.map(async msg => {
      if (msg.role === 'user' && attachedFiles.length > 0) {
        const hasPlaceholder = attachedFiles.some(f => msg.content.includes(f.placeholder))
        if (hasPlaceholder) {
          const expandedContent = await expandFiles(attachedFiles, msg.content)
          return {
            role: msg.role,
            content: expandedContent,
            model_id: msg.model_id,
          }
        }
      }
      return {
        role: msg.role,
        content: msg.content,
        model_id: msg.model_id,
      }
    })
  )

  return expandedMessages
}
