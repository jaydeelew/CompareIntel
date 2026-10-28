/**
 * useComparisonStreaming — guards: validation short-circuits before compareStream.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UseComparisonStreamingConfig } from '../../hooks/useComparisonStreaming'
import { useComparisonStreaming } from '../../hooks/useComparisonStreaming'
import * as compareService from '../../services/compareService'
import type {
  StreamingCreditCallbacks,
  StreamingHelperCallbacks,
  StreamingRefs,
  StreamingStateCallbacks,
} from '../../types/streamingConfig'

vi.mock('../../services/compareService', () => ({
  compareStream: vi.fn(),
}))

function streamingRefs(): StreamingRefs {
  return {
    userCancelledRef: { current: false },
    hasScrolledToResultsRef: { current: false },
    scrolledToTopRef: { current: new Set<string>() },
    shouldScrollToTopAfterFormattingRef: { current: false },
    autoScrollPausedRef: { current: new Set<string>() },
    userInteractingRef: { current: new Set<string>() },
    lastScrollTopRef: { current: new Map<string, number>() },
    lastAlignedRoundRef: { current: 0 },
    isPageScrollingRef: { current: false },
    scrollListenersRef: { current: new Map() },
    lastSubmittedInputRef: { current: '' },
  }
}

function baseConfig(): UseComparisonStreamingConfig {
  return {
    auth: { isAuthenticated: false, user: null, browserFingerprint: '' },
    models: {
      selectedModels: ['gpt-4'],
      modelsByProvider: {},
      originalSelectedModels: [],
    },
    input: {
      input: 'hello',
      attachedFiles: [],
      accurateInputTokens: null,
      webSearchEnabled: false,
      userLocation: null,
      temperature: 0.7,
      topP: 1,
      maxTokens: null,
      modelMode: 'text',
    },
    conversation: {
      conversations: [],
      isFollowUpMode: false,
      currentVisibleComparisonId: null,
    },
    credit: {
      creditBalance: null,
      anonymousCreditsRemaining: null,
      creditWarningType: 'none',
    },
    refs: streamingRefs(),
    modelErrors: {},
    suppressResultsAutoScroll: true,
  }
}

function mockStateCallbacks(
  overrides: Partial<StreamingStateCallbacks> = {}
): StreamingStateCallbacks {
  return {
    setError: vi.fn(),
    setIsLoading: vi.fn(),
    setResponse: vi.fn(),
    setProcessingTime: vi.fn(),
    setClosedCards: vi.fn(),
    setModelErrors: vi.fn(),
    setActiveResultTabs: vi.fn(),
    setConversations: vi.fn(),
    setInput: vi.fn(),
    setIsModelsHidden: vi.fn(),
    setShowDoneSelectingCard: vi.fn(),
    setUserMessageTimestamp: vi.fn(),
    setCurrentAbortController: vi.fn(),
    setOriginalSelectedModels: vi.fn(),
    setCurrentVisibleComparisonId: vi.fn(),
    setAlreadyBrokenOutModels: vi.fn(),
    setIsScrollLocked: vi.fn(),
    setUsageCount: vi.fn(),
    setIsFollowUpMode: vi.fn(),
    setStreamingReasoningByModel: vi.fn(),
    setStreamAnswerStartedByModel: vi.fn(),
    clearStreamingReasoningUi: vi.fn(),
    ...overrides,
  }
}

function mockCreditCallbacks(): StreamingCreditCallbacks {
  return {
    setAnonymousCreditsRemaining: vi.fn(),
    setCreditBalance: vi.fn(),
    setCreditWarningMessage: vi.fn(),
    setCreditWarningType: vi.fn(),
    setCreditWarningDismissible: vi.fn(),
    dismissOverageActive: vi.fn(),
  }
}

function mockHelperCallbacks(): StreamingHelperCallbacks {
  return {
    expandFiles: vi.fn().mockResolvedValue(''),
    getAttachedImagesForApi: vi.fn().mockReturnValue([]),
    extractFileContentForStorage: vi.fn().mockResolvedValue([]),
    setupScrollListener: vi.fn().mockReturnValue(true),
    cleanupScrollListener: vi.fn(),
    saveConversationToLocalStorage: vi.fn().mockReturnValue(null),
    syncHistoryAfterComparison: vi.fn().mockResolvedValue(undefined),
    loadHistoryFromAPI: vi.fn().mockResolvedValue(undefined),
    getFirstUserMessage: vi.fn(),
    getCreditWarningMessage: vi.fn().mockReturnValue(''),
    isLowCreditWarningDismissed: vi.fn().mockReturnValue(false),
    isOverageActiveDismissed: vi.fn().mockReturnValue(false),
    scrollConversationsToBottom: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
  }
}

function renderStreaming(cfg: UseComparisonStreamingConfig, stateCb?: StreamingStateCallbacks) {
  const state = stateCb ?? mockStateCallbacks()
  const { result } = renderHook(() =>
    useComparisonStreaming(cfg, {
      state,
      credit: mockCreditCallbacks(),
      helpers: mockHelperCallbacks(),
    })
  )
  return { result, stateCb: state }
}

describe('useComparisonStreaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(compareService.compareStream).mockReset()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not call compareStream when input is empty', async () => {
    const cfg = baseConfig()
    cfg.input = { ...cfg.input, input: '   ' }
    const { result, stateCb } = renderStreaming(cfg)

    await act(async () => {
      await result.current.submitComparison()
    })

    expect(stateCb.setError).toHaveBeenCalledWith('Please enter some text to compare')
    expect(compareService.compareStream).not.toHaveBeenCalled()
  })

  it('does not call compareStream when no models selected', async () => {
    const cfg = baseConfig()
    cfg.models = { ...cfg.models, selectedModels: [] }
    const { result, stateCb } = renderStreaming(cfg)

    await act(async () => {
      await result.current.submitComparison()
    })

    expect(stateCb.setError).toHaveBeenCalledWith('Please select at least one model')
    expect(compareService.compareStream).not.toHaveBeenCalled()
  })

  it('scrolls to top when user must verify email', async () => {
    const cfg = baseConfig()
    cfg.auth = { ...cfg.auth, user: { is_verified: false } }
    const { result, stateCb } = renderStreaming(cfg)

    await act(async () => {
      await result.current.submitComparison()
    })

    expect(stateCb.setError).toHaveBeenCalledWith(
      expect.stringContaining('verify your email address')
    )
    expect(window.scrollTo).toHaveBeenCalled()
    expect(compareService.compareStream).not.toHaveBeenCalled()
  })
})
