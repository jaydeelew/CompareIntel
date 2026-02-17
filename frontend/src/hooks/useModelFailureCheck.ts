/**
 * useModelFailureCheck - Helpers to detect failed models from errors and conversation state.
 */

import { useCallback } from 'react'

import type { ModelConversation } from '../types'
import { createModelId } from '../types'
import { isErrorMessage } from '../utils/error'

export function useModelFailureCheck(
  modelErrors: { [key: string]: boolean },
  conversations: ModelConversation[]
) {
  const isModelFailed = useCallback(
    (modelId: string): boolean => {
      const formattedModelId = createModelId(modelId)
      if (modelErrors[modelId] === true || modelErrors[formattedModelId] === true) {
        return true
      }
      const conversation = conversations.find(
        conv => conv.modelId === modelId || conv.modelId === formattedModelId
      )
      if (conversation) {
        const assistantMessages = conversation.messages.filter(msg => msg.type === 'assistant')
        if (assistantMessages.length === 0) return true
        const lastMessage = assistantMessages[assistantMessages.length - 1]
        if (
          lastMessage &&
          (isErrorMessage(lastMessage.content) || !(lastMessage.content || '').trim())
        ) {
          return true
        }
      }
      return false
    },
    [modelErrors, conversations]
  )

  const getSuccessfulModels = useCallback(
    (models: string[]): string[] => models.filter(modelId => !isModelFailed(modelId)),
    [isModelFailed]
  )

  return { isModelFailed, getSuccessfulModels }
}
