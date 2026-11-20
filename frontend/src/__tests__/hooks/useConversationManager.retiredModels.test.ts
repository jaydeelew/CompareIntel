/**
 * History load keeps retired model cards and drops them from follow-up selection.
 */
import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationManager } from '../../hooks/useConversationManager'
import type { ModelsByProvider } from '../../types'
import { createConversationId, createModelId } from '../../types'
import { loadLocalConversationRecord } from '../../utils/conversationAttachmentStore'

vi.mock('../../services/api/client', () => ({
  apiClient: { deleteCache: vi.fn() },
}))

vi.mock('../../services/conversationService', () => ({
  getConversation: vi.fn(),
}))

vi.mock('../../utils/conversationAttachmentStore', () => ({
  loadLocalConversationRecord: vi.fn(),
  parseLocalConversationRecord: vi.fn(),
}))

const LIVE = 'openai/gpt-4o-mini'
const REMOVED = 'retired/not-in-lineup'

const catalog = {
  OpenAI: [
    {
      id: LIVE,
      name: 'GPT-4o mini',
      description: '',
      category: 'Language',
      provider: 'OpenAI',
    },
  ],
} as ModelsByProvider

function conversationRecord(modelIds: string[]) {
  const created = '2026-01-01T00:00:00.000Z'
  return {
    input_data: 'Hello from history',
    models_used: modelIds,
    messages: [
      { role: 'user' as const, content: 'Hello from history', created_at: created },
      ...modelIds.map(modelId => ({
        role: 'assistant' as const,
        content: `Reply from ${modelId}`,
        created_at: created,
        model_id: createModelId(modelId),
      })),
    ],
  }
}

function renderManager(modelsByProvider: ModelsByProvider = catalog) {
  const setConversations = vi.fn()
  const setSelectedModels = vi.fn()
  const setOriginalSelectedModels = vi.fn()
  const options = {
    isAuthenticated: false,
    showHistoryDropdown: true,
    loadHistoryFromAPI: vi.fn(),
    loadHistoryFromLocalStorage: vi.fn(() => []),
    setConversationHistory: vi.fn(),
    setIsLoadingHistory: vi.fn(),
    setAlreadyBrokenOutModels: vi.fn(),
    setConversations,
    setSelectedModels,
    setOriginalSelectedModels,
    setInput: vi.fn(),
    setIsFollowUpMode: vi.fn(),
    setClosedCards: vi.fn(),
    setResponse: vi.fn(),
    error: null,
    setError: vi.fn(),
    setShowHistoryDropdown: vi.fn(),
    setIsModelsHidden: vi.fn(),
    collapseAllDropdowns: vi.fn(),
    justLoadedFromHistoryRef: { current: false },
    setCurrentVisibleComparisonId: vi.fn(),
    setModelErrors: vi.fn(),
    modelsByProvider,
    setModelMode: vi.fn(),
    allModels: [],
    setTemperature: vi.fn(),
    setTopP: vi.fn(),
    setMaxTokens: vi.fn(),
    setAspectRatio: vi.fn(),
    setImageSize: vi.fn(),
    setAttachedFiles: vi.fn(),
  }
  const hook = renderHook(() => useConversationManager(options))
  return { ...hook, setConversations, setSelectedModels, setOriginalSelectedModels, options }
}

describe('useConversationManager retired models', () => {
  beforeEach(() => {
    vi.mocked(loadLocalConversationRecord).mockReset()
  })

  async function load(modelIds: string[], modelsByProvider?: ModelsByProvider) {
    vi.mocked(loadLocalConversationRecord).mockResolvedValue(conversationRecord(modelIds))
    const rendered = renderManager(modelsByProvider)
    await act(async () => {
      await rendered.result.current.loadConversation({
        id: createConversationId('hist-1'),
        input_data: 'Hello from history',
        models_used: modelIds.map(id => createModelId(id)),
        created_at: '2026-01-01T00:00:00.000Z',
      })
    })
    return rendered
  }

  it('keeps every card and selects only models still in the lineup', async () => {
    const { setConversations, setSelectedModels, setOriginalSelectedModels } = await load([
      REMOVED,
      LIVE,
    ])
    const conversations = setConversations.mock.calls.at(-1)?.[0] as { modelId: string }[]
    expect(conversations.map(conversation => conversation.modelId).sort()).toEqual(
      [LIVE, REMOVED].sort()
    )
    expect(setSelectedModels).toHaveBeenCalledWith([LIVE])
    expect(setOriginalSelectedModels).toHaveBeenCalledWith([LIVE])
  })

  it('selects nothing when every model was removed', async () => {
    const { setConversations, setSelectedModels, setOriginalSelectedModels } = await load([REMOVED])
    const conversations = setConversations.mock.calls.at(-1)?.[0] as { modelId: string }[]
    expect(conversations).toHaveLength(1)
    expect(conversations[0]?.modelId).toBe(REMOVED)
    expect(setSelectedModels).toHaveBeenCalledWith([])
    expect(setOriginalSelectedModels).toHaveBeenCalledWith([])
  })

  it('keeps the full selection when every model is still available', async () => {
    const { setSelectedModels, setOriginalSelectedModels } = await load([LIVE])
    expect(setSelectedModels).toHaveBeenCalledWith([LIVE])
    expect(setOriginalSelectedModels).toHaveBeenCalledWith([LIVE])
  })
})
