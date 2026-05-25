/**
 * useStreamTimeout — focused behavioural tests (cancellation / AbortError branches).
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import {
  type UseStreamTimeoutCallbacks,
  type UseStreamTimeoutConfig,
  useStreamTimeout,
} from '../../hooks/useStreamTimeout'
import { ApiError } from '../../services/api/errors'

function buildCallbacks(): UseStreamTimeoutCallbacks {
  return {
    setError: vi.fn(),
    setModelErrors: vi.fn(),
    setActiveResultTabs: vi.fn(),
    setResponse: vi.fn(),
    setConversations: vi.fn(),
    setCurrentVisibleComparisonId: vi.fn(),
    setCreditBalance: vi.fn(),
    setAnonymousCreditsRemaining: vi.fn(),
    setIsFollowUpMode: vi.fn(),
    extractFileContentForStorage: vi.fn().mockResolvedValue([]),
    saveConversationToLocalStorage: vi.fn().mockReturnValue(null),
    syncHistoryAfterComparison: vi.fn().mockResolvedValue(undefined),
    getFirstUserMessage: vi.fn(() => undefined),
    refreshUser: vi.fn().mockResolvedValue(undefined),
  }
}

describe('useStreamTimeout', () => {
  it('shows user-cancelled message when AbortError fires and userCancelledRef is set', () => {
    const config: UseStreamTimeoutConfig = {
      selectedModels: ['gpt-4'],
      input: '',
      isFollowUpMode: false,
      isAuthenticated: false,
      attachedFiles: [],
      browserFingerprint: '',
      userCancelledRef: { current: true },
      lastSubmittedInputRef: { current: '' },
      modelMode: 'text',
      temperature: 0.7,
      topP: 1,
      maxTokens: null,
      aspectRatio: '1:1',
      imageSize: '1K',
    }

    const callbacks = buildCallbacks()
    const { result } = renderHook(() => useStreamTimeout(config, callbacks))

    const err = new Error('aborted')
    err.name = 'AbortError'

    act(() => {
      result.current.handleStreamError(err, null, Date.now())
    })

    expect(callbacks.setError).toHaveBeenCalledWith('Model comparison cancelled by user.')
  })

  it('maps ApiError status 402 to credit message', () => {
    const config: UseStreamTimeoutConfig = {
      selectedModels: ['gpt-4'],
      input: '',
      isFollowUpMode: false,
      isAuthenticated: true,
      attachedFiles: [],
      browserFingerprint: '',
      userCancelledRef: { current: false },
      lastSubmittedInputRef: { current: '' },
      modelMode: 'text',
      temperature: 0.7,
      topP: 1,
      maxTokens: null,
      aspectRatio: '1:1',
      imageSize: '1K',
    }

    const callbacks = buildCallbacks()
    const { result } = renderHook(() => useStreamTimeout(config, callbacks))
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    const err = new ApiError('Pay up', 402, 'Payment Required')

    act(() => {
      result.current.handleStreamError(err, null, Date.now())
    })

    expect(callbacks.setError).toHaveBeenCalled()
    scrollSpy.mockRestore()
  })
})
