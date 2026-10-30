import { useCallback, useMemo, useState } from 'react'

import { createSharedComparison } from '../services/shareService'
import type { Model, ModelConversation, ModelsByProvider } from '../types'
import { showNotification } from '../utils/error'
import logger from '../utils/logger'

export interface UseShareComparisonOptions {
  conversations: ModelConversation[]
  modelsByProvider: ModelsByProvider
  input: string
  getFirstUserMessage: () => { content: string } | undefined
  isComparisonLoading?: boolean
}

export interface UseShareComparisonReturn {
  isSharing: boolean
  canShare: boolean
  handleShare: () => Promise<void>
}

function assistantContent(conversation: ModelConversation): string {
  return conversation.messages
    .filter(message => message.type === 'assistant' && message.content.trim().length > 0)
    .map(message => message.content.trim())
    .join('\n\n')
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export function useShareComparison({
  conversations,
  modelsByProvider,
  input,
  getFirstUserMessage,
  isComparisonLoading = false,
}: UseShareComparisonOptions): UseShareComparisonReturn {
  const [isSharing, setIsSharing] = useState(false)

  const completed = useMemo(
    () => conversations.filter(conversation => assistantContent(conversation).length > 0),
    [conversations]
  )
  const canShare = !isComparisonLoading && completed.length > 0

  const handleShare = useCallback(async () => {
    if (!canShare || isSharing) return

    const prompt = getFirstUserMessage()?.content || input
    if (!prompt.trim()) {
      showNotification('Nothing to share yet.', 'error')
      return
    }

    const modelsLookup: Record<string, Model> = Object.fromEntries(
      Object.values(modelsByProvider)
        .flat()
        .map(model => [model.id, model])
    )

    const payload = {
      prompt: prompt.trim().slice(0, 32_000),
      models: completed.map(conversation => ({
        id: conversation.modelId,
        name: (modelsLookup[conversation.modelId]?.name || conversation.modelId).slice(0, 120),
      })),
      responses: completed.map(conversation => ({
        model_id: conversation.modelId,
        model_name: (modelsLookup[conversation.modelId]?.name || conversation.modelId).slice(
          0,
          120
        ),
        content: assistantContent(conversation).slice(0, 64_000),
      })),
    }

    setIsSharing(true)
    const notification = showNotification('Creating share link...', 'success')
    try {
      const created = await createSharedComparison(payload)
      const url = `${window.location.origin}/c/${created.slug}`
      await copyToClipboard(url)
      notification.update('Share link copied to clipboard', 'success')
    } catch (err) {
      logger.error('Share error:', err)
      notification.update('Failed to create share link. Please try again.', 'error')
    } finally {
      setIsSharing(false)
    }
  }, [canShare, completed, getFirstUserMessage, input, isSharing, modelsByProvider])

  return { isSharing, canShare, handleShare }
}
