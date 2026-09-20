import { describe, expect, it } from 'vitest'

import { mapExtensionHandoff } from '../../hooks/useExtensionHandoff'
import type { ExtensionHandoffPayload } from '../../utils/extensionHandoff'

function payload(
  overrides: Partial<ExtensionHandoffPayload> = {}
): ExtensionHandoffPayload {
  return {
    input: '',
    selectedModels: [],
    results: [],
    conversationHistory: [],
    conversationId: null,
    ...overrides,
  }
}

describe('mapExtensionHandoff', () => {
  it('does not create comparison results from a model selection alone', () => {
    const hydration = mapExtensionHandoff(
      payload({
        selectedModels: ['deepseek/deepseek-chat', 'deepseek/deepseek-v3.2-exp', 'cohere/command-r7b'],
      })
    )

    expect(hydration.selectedModels).toEqual([
      'deepseek/deepseek-chat',
      'deepseek/deepseek-v3.2-exp',
      'cohere/command-r7b',
    ])
    expect(hydration.conversations).toEqual([])
    expect(hydration.isFollowUpMode).toBe(false)
    expect(hydration.conversationId).toBeNull()
  })

  it('keeps an unsent prompt in the composer without opening results', () => {
    const hydration = mapExtensionHandoff(
      payload({
        input: 'Compare these approaches',
        selectedModels: ['openai/gpt-4o'],
      })
    )

    expect(hydration.input).toBe('Compare these approaches')
    expect(hydration.selectedModels).toEqual(['openai/gpt-4o'])
    expect(hydration.conversations).toEqual([])
    expect(hydration.isFollowUpMode).toBe(false)
  })

  it('leaves model selection empty when the extension had none', () => {
    const hydration = mapExtensionHandoff(payload())

    expect(hydration.selectedModels).toEqual([])
    expect(hydration.conversations).toEqual([])
    expect(hydration.isFollowUpMode).toBe(false)
  })

  it('does not treat empty complete results as a conversation', () => {
    const hydration = mapExtensionHandoff(
      payload({
        selectedModels: ['deepseek/deepseek-chat'],
        results: [
          {
            modelId: 'deepseek/deepseek-chat',
            modelName: 'DeepSeek Chat V3.1',
            content: '',
            isStreaming: false,
            error: null,
            isComplete: true,
          },
        ],
      })
    )

    expect(hydration.conversations).toEqual([])
    expect(hydration.isFollowUpMode).toBe(false)
  })

  it('does not turn an unsent composer prompt into a conversation user message', () => {
    const hydration = mapExtensionHandoff(
      payload({
        input: 'Draft prompt still in the box',
        selectedModels: ['openai/gpt-4o'],
        results: [
          {
            modelId: 'openai/gpt-4o',
            modelName: 'GPT-4o',
            content: '',
            isStreaming: false,
            error: null,
            isComplete: true,
          },
        ],
      })
    )

    expect(hydration.input).toBe('Draft prompt still in the box')
    expect(hydration.conversations).toEqual([])
    expect(hydration.isFollowUpMode).toBe(false)
  })

  it('hydrates a submitted comparison and keeps a follow-up draft in the composer', () => {
    const hydration = mapExtensionHandoff(
      payload({
        input: 'follow-up question',
        selectedModels: ['openai/gpt-4o'],
        conversationId: 42,
        conversationHistory: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '4', model_id: 'openai/gpt-4o' },
        ],
        results: [
          {
            modelId: 'openai/gpt-4o',
            modelName: 'GPT-4o',
            content: '4',
            isStreaming: false,
            error: null,
            isComplete: true,
          },
        ],
      })
    )

    expect(hydration.input).toBe('follow-up question')
    expect(hydration.isFollowUpMode).toBe(true)
    expect(hydration.conversationId).toBe(42)
    expect(hydration.conversations).toHaveLength(1)
    expect(hydration.conversations[0]?.messages.map((message) => message.content)).toEqual([
      'What is 2+2?',
      '4',
    ])
  })
})
