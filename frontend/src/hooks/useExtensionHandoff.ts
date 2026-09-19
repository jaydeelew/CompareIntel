import { useEffect, useRef } from 'react'

import {
  clearExtensionHandoffParam,
  shouldRequestExtensionHandoff,
} from '../utils/extensionBridge'
import {
  establishSessionFromRefreshToken,
  requestExtensionHandoff,
  type ExtensionHandoffPayload,
} from '../utils/extensionHandoff'
import { createMessageId, createModelId } from '../types'
import type { ModelConversation } from '../types/conversation'

export interface ExtensionHandoffHydration {
  input: string
  selectedModels: string[]
  conversations: ModelConversation[]
  conversationId: number | null
  browserFingerprint?: string
  isFollowUpMode: boolean
}

function buildConversationsFromHandoff(payload: ExtensionHandoffPayload): ModelConversation[] {
  const modelIds = new Set<string>()
  for (const modelId of payload.selectedModels) modelIds.add(modelId)
  for (const result of payload.results) modelIds.add(result.modelId)
  for (const message of payload.conversationHistory) {
    if (message.role === 'assistant' && message.model_id) {
      modelIds.add(message.model_id)
    }
  }

  const messagesByModel = new Map<string, ModelConversation['messages']>()

  for (const modelId of modelIds) {
    messagesByModel.set(modelId, [])
  }

  for (const message of payload.conversationHistory) {
    if (message.role === 'user') {
      for (const modelId of modelIds) {
        messagesByModel.get(modelId)?.push({
          id: createMessageId(`${Date.now()}-user-${Math.random()}`),
          type: 'user',
          content: message.content,
          timestamp: new Date().toISOString(),
        })
      }
      continue
    }

    if (message.role === 'assistant' && message.model_id) {
      messagesByModel.get(message.model_id)?.push({
        id: createMessageId(`${Date.now()}-assistant-${Math.random()}`),
        type: 'assistant',
        content: message.content,
        timestamp: new Date().toISOString(),
      })
    }
  }

  if (payload.results.length > 0) {
    const userPrompt =
      payload.input.trim() ||
      [...payload.conversationHistory].reverse().find((entry) => entry.role === 'user')?.content ||
      ''

    if (userPrompt) {
      for (const result of payload.results) {
        const messages = messagesByModel.get(result.modelId) ?? []
        const hasCurrentUser = messages.some(
          (entry) => entry.type === 'user' && entry.content === userPrompt
        )
        if (!hasCurrentUser) {
          messages.push({
            id: createMessageId(`${Date.now()}-user-${Math.random()}`),
            type: 'user',
            content: userPrompt,
            timestamp: new Date().toISOString(),
          })
        }
        if (result.content.trim()) {
          messages.push({
            id: createMessageId(`${Date.now()}-assistant-${Math.random()}`),
            type: 'assistant',
            content: result.content,
            timestamp: new Date().toISOString(),
          })
        }
        messagesByModel.set(result.modelId, messages)
      }
    }
  }

  return [...modelIds].map((modelId) => ({
    modelId: createModelId(modelId),
    messages: messagesByModel.get(modelId) ?? [],
  }))
}

export function mapExtensionHandoff(
  payload: ExtensionHandoffPayload
): ExtensionHandoffHydration {
  const conversations = buildConversationsFromHandoff(payload)
  const selectedModels =
    payload.selectedModels.length > 0
      ? payload.selectedModels
      : conversations.map((conversation) => String(conversation.modelId))

  return {
    input: payload.input,
    selectedModels,
    conversations,
    conversationId: payload.conversationId,
    browserFingerprint: payload.browserFingerprint,
    isFollowUpMode: conversations.some((conversation) => conversation.messages.length > 0),
  }
}

interface UseExtensionHandoffOptions {
  authLoading: boolean
  isAuthenticated: boolean
  refreshUser: () => Promise<unknown>
  onHydrate: (hydration: ExtensionHandoffHydration) => void
  setBrowserFingerprint?: (fingerprint: string) => void
}

export function useExtensionHandoff({
  authLoading,
  isAuthenticated,
  refreshUser,
  onHydrate,
  setBrowserFingerprint,
}: UseExtensionHandoffOptions): void {
  const handledRef = useRef(false)

  useEffect(() => {
    if (!shouldRequestExtensionHandoff() || handledRef.current || authLoading) return

    handledRef.current = true

    const applyHandoff = async () => {
      const payload = await requestExtensionHandoff()
      clearExtensionHandoffParam()
      if (!payload) return

      if (!isAuthenticated && payload.refreshToken) {
        const established = await establishSessionFromRefreshToken(payload.refreshToken)
        if (established) {
          await refreshUser()
        }
      }

      if (payload.browserFingerprint && setBrowserFingerprint) {
        setBrowserFingerprint(payload.browserFingerprint)
      }

      onHydrate(mapExtensionHandoff(payload))
    }

    void applyHandoff()
  }, [authLoading, isAuthenticated, onHydrate, refreshUser, setBrowserFingerprint])
}
