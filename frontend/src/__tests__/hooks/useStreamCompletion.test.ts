/**
 * useStreamCompletion — smoke test for usage refresh path (successful stream).
 */

import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStreamCompletion } from '../../hooks/useStreamCompletion'
import { apiClient } from '../../services/api/client'
import * as compareService from '../../services/compareService'
import type { ProcessStreamResult } from '../../services/sseProcessor'
import { createModelId } from '../../types'
import { createMockRateLimitStatus } from '../utils'

vi.mock('../../services/compareService', () => ({
  getRateLimitStatus: vi.fn(),
}))

describe('useStreamCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(compareService.getRateLimitStatus).mockResolvedValue(createMockRateLimitStatus())
  })

  it('clears composer input after a successful comparison', async () => {
    const deleteCacheSpy = vi.spyOn(apiClient, 'deleteCache').mockImplementation(() => {})
    const modelId = createModelId('gpt-4')

    const config = {
      selectedModels: ['gpt-4'],
      input: 'hi',
      isFollowUpMode: false,
      isAuthenticated: true,
      attachedFiles: [],
      browserFingerprint: '',
      lastSubmittedInputRef: { current: '' },
      userCancelledRef: { current: false },
      modelMode: 'text' as const,
      temperature: 0.7,
      topP: 1,
      maxTokens: null,
      aspectRatio: '1:1',
      imageSize: '1K',
      suppressResultsAutoScroll: true,
    }

    const setInput = vi.fn()
    const { result } = renderHook(() =>
      useStreamCompletion(config, {
        setError: vi.fn(),
        setModelErrors: vi.fn(),
        setActiveResultTabs: vi.fn(),
        setResponse: vi.fn(),
        setConversations: vi.fn(),
        setInput,
        setCurrentVisibleComparisonId: vi.fn(),
        setUsageCount: vi.fn(),
        extractFileContentForStorage: vi.fn().mockResolvedValue([]),
        saveConversationToLocalStorage: vi.fn(),
        syncHistoryAfterComparison: vi.fn().mockResolvedValue(undefined),
        getFirstUserMessage: vi.fn(() => undefined),
        scrollConversationsToBottom: vi.fn(),
        refreshUser: vi.fn().mockResolvedValue(undefined),
      })
    )

    const streamResult: ProcessStreamResult = {
      streamingResults: { [modelId]: 'done' },
      streamingImages: {},
      completedModels: new Set<string>([modelId]),
      localModelErrors: {},
      modelStartTimes: {},
      modelCompletionTimes: {},
      streamingMetadata: {
        input_length: 2,
        models_requested: 1,
        models_successful: 1,
        models_failed: 0,
        timestamp: new Date().toISOString(),
        processing_time_ms: 10,
      },
      streamError: null,
    }

    await act(async () => {
      await result.current.applyStreamCompletion(streamResult, Date.now(), new Date().toISOString())
    })

    expect(setInput).toHaveBeenCalledWith('')
    deleteCacheSpy.mockRestore()
  })
})
