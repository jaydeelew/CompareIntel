/**
 * Tests for useModelComparison hook
 *
 * Tests comparison state management, helper functions, and refs.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useModelComparison } from '../../hooks/useModelComparison'
import { createModelId } from '../../types'
import {
  createMockCompareResponse,
  createMockModelConversation,
  createMockConversationMessage,
} from '../utils'

describe('useModelComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useModelComparison())

      expect(result.current.input).toBe('')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe(null)
      expect(result.current.response).toBe(null)
      expect(result.current.processingTime).toBe(null)
      expect(result.current.conversations).toEqual([])
      expect(result.current.isFollowUpMode).toBe(false)
      expect(result.current.closedCards).toEqual(new Set())
      expect(result.current.activeResultTabs).toEqual({})
      expect(result.current.currentAbortController).toBe(null)
      expect(result.current.isScrollLocked).toBe(false)
    })

    it('should initialize refs with correct default values', () => {
      const { result } = renderHook(() => useModelComparison())

      expect(result.current.userCancelledRef.current).toBe(false)
      expect(result.current.followUpJustActivatedRef.current).toBe(false)
      expect(result.current.hasScrolledToResultsRef.current).toBe(false)
      expect(result.current.lastAlignedRoundRef.current).toBe(0)
      expect(result.current.autoScrollPausedRef.current).toEqual(new Set())
      expect(result.current.scrollListenersRef.current).toEqual(new Map())
      expect(result.current.userInteractingRef.current).toEqual(new Set())
      expect(result.current.lastScrollTopRef.current).toEqual(new Map())
      expect(result.current.isScrollLockedRef.current).toBe(false)
      expect(result.current.syncingFromElementRef.current).toBe(null)
      expect(result.current.lastSyncTimeRef.current).toBe(0)
    })
  })

  describe('input state', () => {
    it('should allow setting input', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setInput('test input')
      })

      expect(result.current.input).toBe('test input')
    })

    it('should allow setting input with function updater', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setInput('initial')
        result.current.setInput(prev => `${prev} updated`)
      })

      expect(result.current.input).toBe('initial updated')
    })
  })

  // Note: Extended mode functionality was removed from useModelComparison hook
  // Extended mode is now managed directly in App.tsx

  describe('loading state', () => {
    it('should allow setting loading state', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsLoading(true)
      })

      expect(result.current.isLoading).toBe(true)

      act(() => {
        result.current.setIsLoading(false)
      })

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('error state', () => {
    it('should allow setting error', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setError('Test error')
      })

      expect(result.current.error).toBe('Test error')

      act(() => {
        result.current.setError(null)
      })

      expect(result.current.error).toBe(null)
    })
  })

  describe('response state', () => {
    it('should allow setting response', () => {
      const { result } = renderHook(() => useModelComparison())
      const mockResponse = createMockCompareResponse([createModelId('gpt-4')])

      act(() => {
        result.current.setResponse(mockResponse)
      })

      expect(result.current.response).toEqual(mockResponse)
    })
  })

  describe('processing time', () => {
    it('should allow setting processing time', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setProcessingTime(1500)
      })

      expect(result.current.processingTime).toBe(1500)
    })
  })

  describe('conversations', () => {
    it('should allow setting conversations', () => {
      const { result } = renderHook(() => useModelComparison())
      const mockConversations = [
        createMockModelConversation({ modelId: createModelId('gpt-4') }),
        createMockModelConversation({ modelId: createModelId('claude-3') }),
      ]

      act(() => {
        result.current.setConversations(mockConversations)
      })

      expect(result.current.conversations).toEqual(mockConversations)
    })

    it('should allow updating conversations with function updater', () => {
      const { result } = renderHook(() => useModelComparison())
      const initialConversations = [
        createMockModelConversation({ modelId: createModelId('gpt-4') }),
      ]

      act(() => {
        result.current.setConversations(initialConversations)
        result.current.setConversations(prev => [
          ...prev,
          createMockModelConversation({ modelId: createModelId('claude-3') }),
        ])
      })

      expect(result.current.conversations.length).toBe(2)
    })
  })

  describe('follow-up mode', () => {
    it('should allow toggling follow-up mode', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsFollowUpMode(true)
      })

      expect(result.current.isFollowUpMode).toBe(true)
    })
  })

  describe('closed cards', () => {
    it('should allow managing closed cards', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setClosedCards(new Set(['card1', 'card2']))
      })

      expect(result.current.closedCards).toEqual(new Set(['card1', 'card2']))
    })

    it('should allow updating closed cards with function updater', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setClosedCards(new Set(['card1']))
        result.current.setClosedCards(prev => {
          const newSet = new Set(prev)
          newSet.add('card2')
          return newSet
        })
      })

      expect(result.current.closedCards).toEqual(new Set(['card1', 'card2']))
    })
  })

  describe('active result tabs', () => {
    it('should allow setting active result tabs', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setActiveResultTabs({
          [createModelId('gpt-4')]: 'formatted',
          [createModelId('claude-3')]: 'raw',
        })
      })

      expect(result.current.activeResultTabs).toEqual({
        [createModelId('gpt-4')]: 'formatted',
        [createModelId('claude-3')]: 'raw',
      })
    })
  })

  describe('abort controller', () => {
    it('should allow setting abort controller', () => {
      const { result } = renderHook(() => useModelComparison())
      const controller = new AbortController()

      act(() => {
        result.current.setCurrentAbortController(controller)
      })

      expect(result.current.currentAbortController).toBe(controller)
    })
  })

  describe('resetComparisonState', () => {
    it('should reset comparison state', () => {
      const { result } = renderHook(() => useModelComparison())

      // Set up some state
      act(() => {
        result.current.setResponse(createMockCompareResponse([createModelId('gpt-4')]))
        result.current.setProcessingTime(1500)
        result.current.setClosedCards(new Set(['card1']))
        result.current.setIsScrollLocked(true)
        result.current.userCancelledRef.current = true
        result.current.hasScrolledToResultsRef.current = true
        result.current.lastAlignedRoundRef.current = 5
        result.current.autoScrollPausedRef.current.add('model1')
        result.current.userInteractingRef.current.add('model2')
        result.current.lastScrollTopRef.current.set('model3', 100)
      })

      // Reset
      act(() => {
        result.current.resetComparisonState()
      })

      expect(result.current.response).toBe(null)
      expect(result.current.processingTime).toBe(null)
      expect(result.current.closedCards).toEqual(new Set())
      expect(result.current.isScrollLocked).toBe(false)
      expect(result.current.userCancelledRef.current).toBe(false)
      expect(result.current.hasScrolledToResultsRef.current).toBe(false)
      expect(result.current.lastAlignedRoundRef.current).toBe(0)
      expect(result.current.autoScrollPausedRef.current.size).toBe(0)
      expect(result.current.userInteractingRef.current.size).toBe(0)
      expect(result.current.lastScrollTopRef.current.size).toBe(0)
    })

    it('should not reset input or conversations', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setInput('test input')
        result.current.setConversations([
          createMockModelConversation({ modelId: createModelId('gpt-4') }),
        ])
      })

      act(() => {
        result.current.resetComparisonState()
      })

      expect(result.current.input).toBe('test input')
      expect(result.current.conversations.length).toBe(1)
    })
  })

  describe('cancelComparison', () => {
    it('should abort controller and set loading to false', () => {
      const { result } = renderHook(() => useModelComparison())
      const controller = new AbortController()
      const abortSpy = vi.spyOn(controller, 'abort')

      act(() => {
        result.current.setCurrentAbortController(controller)
        result.current.setIsLoading(true)
      })

      act(() => {
        result.current.cancelComparison()
      })

      expect(abortSpy).toHaveBeenCalled()
      expect(result.current.currentAbortController).toBe(null)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.userCancelledRef.current).toBe(true)
    })

    it('should handle cancel when no controller exists', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsLoading(true)
        result.current.cancelComparison()
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.userCancelledRef.current).toBe(true)
    })
  })

  describe('getFirstUserMessage', () => {
    it('should return undefined when no conversations', () => {
      const { result } = renderHook(() => useModelComparison())

      expect(result.current.getFirstUserMessage()).toBeUndefined()
    })

    it('should return first user message chronologically', () => {
      const { result } = renderHook(() => useModelComparison())

      const message1 = createMockConversationMessage({
        type: 'user',
        content: 'First message',
        timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
      })
      const message2 = createMockConversationMessage({
        type: 'user',
        content: 'Second message',
        timestamp: new Date('2024-01-01T11:00:00Z').toISOString(),
      })

      act(() => {
        result.current.setConversations([
          createMockModelConversation({
            modelId: createModelId('gpt-4'),
            messages: [message2, message1], // Out of order
          }),
        ])
      })

      const firstMessage = result.current.getFirstUserMessage()
      expect(firstMessage).toEqual(message1)
      expect(firstMessage?.content).toBe('First message')
    })

    it('should handle multiple conversations', () => {
      const { result } = renderHook(() => useModelComparison())

      const message1 = createMockConversationMessage({
        type: 'user',
        content: 'First',
        timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
      })
      const message2 = createMockConversationMessage({
        type: 'user',
        content: 'Second',
        timestamp: new Date('2024-01-01T11:00:00Z').toISOString(),
      })

      act(() => {
        result.current.setConversations([
          createMockModelConversation({
            modelId: createModelId('gpt-4'),
            messages: [message2],
          }),
          createMockModelConversation({
            modelId: createModelId('claude-3'),
            messages: [message1],
          }),
        ])
      })

      const firstMessage = result.current.getFirstUserMessage()
      expect(firstMessage?.content).toBe('First')
    })

    it('should ignore assistant messages', () => {
      const { result } = renderHook(() => useModelComparison())

      const userMessage = createMockConversationMessage({
        type: 'user',
        content: 'User message',
        timestamp: new Date('2024-01-01T11:00:00Z').toISOString(),
      })
      const assistantMessage = createMockConversationMessage({
        type: 'assistant',
        content: 'Assistant message',
        timestamp: new Date('2024-01-01T10:00:00Z').toISOString(), // Earlier
      })

      act(() => {
        result.current.setConversations([
          createMockModelConversation({
            modelId: createModelId('gpt-4'),
            messages: [assistantMessage, userMessage],
          }),
        ])
      })

      const firstMessage = result.current.getFirstUserMessage()
      expect(firstMessage).toEqual(userMessage)
    })
  })

  describe('getConversationsWithMessages', () => {
    it('should return conversations for selected models', () => {
      const { result } = renderHook(() => useModelComparison())

      const conv1 = createMockModelConversation({
        modelId: createModelId('gpt-4'),
        messages: [createMockConversationMessage()],
      })
      const conv2 = createMockModelConversation({
        modelId: createModelId('claude-3'),
        messages: [createMockConversationMessage()],
      })
      const conv3 = createMockModelConversation({
        modelId: createModelId('gemini'),
        messages: [],
      })

      act(() => {
        result.current.setConversations([conv1, conv2, conv3])
      })

      const selectedModels = [createModelId('gpt-4'), createModelId('claude-3')]
      const conversations = result.current.getConversationsWithMessages(selectedModels)

      expect(conversations).toEqual([conv1, conv2])
      expect(conversations.length).toBe(2)
    })

    it('should filter out conversations with no messages', () => {
      const { result } = renderHook(() => useModelComparison())

      const conv1 = createMockModelConversation({
        modelId: createModelId('gpt-4'),
        messages: [createMockConversationMessage()],
      })
      const conv2 = createMockModelConversation({
        modelId: createModelId('claude-3'),
        messages: [],
      })

      act(() => {
        result.current.setConversations([conv1, conv2])
      })

      const selectedModels = [createModelId('gpt-4'), createModelId('claude-3')]
      const conversations = result.current.getConversationsWithMessages(selectedModels)

      expect(conversations).toEqual([conv1])
      expect(conversations.length).toBe(1)
    })

    it('should return empty array when no matching conversations', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setConversations([
          createMockModelConversation({
            modelId: createModelId('gpt-4'),
            messages: [createMockConversationMessage()],
          }),
        ])
      })

      const conversations = result.current.getConversationsWithMessages([createModelId('claude-3')])

      expect(conversations).toEqual([])
    })
  })

  describe('refs', () => {
    it('should allow modifying refs directly', () => {
      const { result } = renderHook(() => useModelComparison())

      result.current.userCancelledRef.current = true
      expect(result.current.userCancelledRef.current).toBe(true)

      result.current.followUpJustActivatedRef.current = true
      expect(result.current.followUpJustActivatedRef.current).toBe(true)

      result.current.hasScrolledToResultsRef.current = true
      expect(result.current.hasScrolledToResultsRef.current).toBe(true)

      result.current.lastAlignedRoundRef.current = 5
      expect(result.current.lastAlignedRoundRef.current).toBe(5)
    })

    it('should allow modifying scroll-related refs', () => {
      const { result } = renderHook(() => useModelComparison())

      result.current.autoScrollPausedRef.current.add('model1')
      expect(result.current.autoScrollPausedRef.current.has('model1')).toBe(true)

      result.current.userInteractingRef.current.add('model2')
      expect(result.current.userInteractingRef.current.has('model2')).toBe(true)

      result.current.lastScrollTopRef.current.set('model3', 100)
      expect(result.current.lastScrollTopRef.current.get('model3')).toBe(100)
    })
  })
})
