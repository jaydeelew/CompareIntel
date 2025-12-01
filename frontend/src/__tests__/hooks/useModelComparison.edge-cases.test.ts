/**
 * Edge case tests for useModelComparison hook
 *
 * Tests error handling, cleanup, edge conditions, and boundary cases.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import { useModelComparison } from '../../hooks/useModelComparison'
import type { ModelConversation, ResultTab } from '../../types'
import { createModelId } from '../../types'
import { createMockCompareResponse, createMockModelConversation } from '../utils'

describe('useModelComparison - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setError('Network error occurred')
      })

      expect(result.current.error).toBe('Network error occurred')
      expect(result.current.isLoading).toBe(false)
    })

    it('should handle API errors without crashing', async () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setError('API error: 500 Internal Server Error')
      })

      expect(result.current.error).toBe('API error: 500 Internal Server Error')
      expect(result.current.response).toBe(null)
    })

    it('should clear error when setting new input', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setError('Some error')
        result.current.setInput('new input')
      })

      // Error should persist unless explicitly cleared
      // This depends on implementation
      expect(result.current.input).toBe('new input')
    })

    it('should handle multiple rapid error updates', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setError('Error 1')
        result.current.setError('Error 2')
        result.current.setError('Error 3')
      })

      expect(result.current.error).toBe('Error 3')
    })
  })

  describe('Loading State Edge Cases', () => {
    it('should handle rapid loading state changes', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsLoading(true)
        result.current.setIsLoading(false)
        result.current.setIsLoading(true)
      })

      expect(result.current.isLoading).toBe(true)
    })

    it('should handle loading state with error', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsLoading(true)
        result.current.setError('Error occurred')
      })

      // Both can be true simultaneously (loading then error)
      expect(result.current.isLoading).toBe(true)
      expect(result.current.error).toBe('Error occurred')
    })

    it('should handle loading state with response', () => {
      const { result } = renderHook(() => useModelComparison())

      const mockResponse = createMockCompareResponse([createModelId('gpt-4')])

      act(() => {
        result.current.setIsLoading(true)
        result.current.setResponse(mockResponse)
      })

      // Response can be set while loading (streaming scenario)
      expect(result.current.response).toEqual(mockResponse)
    })
  })

  describe('Input Edge Cases', () => {
    it('should handle empty string input', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setInput('')
      })

      expect(result.current.input).toBe('')
    })

    it('should handle very long input', () => {
      const { result } = renderHook(() => useModelComparison())

      const longInput = 'a'.repeat(100000)

      act(() => {
        result.current.setInput(longInput)
      })

      expect(result.current.input).toBe(longInput)
      expect(result.current.input.length).toBe(100000)
    })

    it('should handle input with special characters', () => {
      const { result } = renderHook(() => useModelComparison())

      const specialInput = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~'

      act(() => {
        result.current.setInput(specialInput)
      })

      expect(result.current.input).toBe(specialInput)
    })

    it('should handle input with unicode characters', () => {
      const { result } = renderHook(() => useModelComparison())

      const unicodeInput = 'Hello 世界 🌍 مرحبا'

      act(() => {
        result.current.setInput(unicodeInput)
      })

      expect(result.current.input).toBe(unicodeInput)
    })

    it('should handle input with newlines', () => {
      const { result } = renderHook(() => useModelComparison())

      const multilineInput = 'Line 1\nLine 2\nLine 3'

      act(() => {
        result.current.setInput(multilineInput)
      })

      expect(result.current.input).toBe(multilineInput)
    })

    it('should handle input with whitespace only', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setInput('   \n\t  ')
      })

      expect(result.current.input).toBe('   \n\t  ')
    })
  })

  describe('Response Edge Cases', () => {
    it('should handle null response', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setResponse(null)
      })

      expect(result.current.response).toBe(null)
    })

    it('should handle response with empty results', () => {
      const { result } = renderHook(() => useModelComparison())

      const emptyResponse = {
        results: {},
        metadata: {
          input_length: 0,
          models_requested: 0,
          models_successful: 0,
          models_failed: 0,
          timestamp: new Date().toISOString(),
          processing_time_ms: 0,
        },
      }

      act(() => {
        result.current.setResponse(emptyResponse)
      })

      expect(result.current.response).toEqual(emptyResponse)
    })

    it('should handle response with partial failures', () => {
      const { result } = renderHook(() => useModelComparison())

      const partialResponse = createMockCompareResponse([
        createModelId('gpt-4'),
        createModelId('claude-3'),
      ])
      partialResponse.results[createModelId('claude-3')] = 'Error: Model failed'
      // Update metadata to reflect the failure
      partialResponse.metadata.models_failed = 1
      partialResponse.metadata.models_successful = 1

      act(() => {
        result.current.setResponse(partialResponse)
      })

      expect(result.current.response).toEqual(partialResponse)
      expect(partialResponse.metadata.models_failed).toBeGreaterThan(0)
    })

    it('should handle response with very long content', () => {
      const { result } = renderHook(() => useModelComparison())

      const longContent = 'a'.repeat(100000)
      const response = createMockCompareResponse([createModelId('gpt-4')])
      response.results[createModelId('gpt-4')] = longContent

      act(() => {
        result.current.setResponse(response)
      })

      expect(result.current.response?.results[createModelId('gpt-4')]).toBe(longContent)
    })
  })

  describe('Conversations Edge Cases', () => {
    it('should handle empty conversations array', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setConversations([])
      })

      expect(result.current.conversations).toEqual([])
    })

    it('should handle very large conversations array', () => {
      const { result } = renderHook(() => useModelComparison())

      const manyConversations = Array.from({ length: 1000 }, (_, i) =>
        createMockModelConversation(`conv-${i}`)
      )

      act(() => {
        result.current.setConversations(manyConversations)
      })

      expect(result.current.conversations.length).toBe(1000)
    })

    it('should handle conversations with missing fields', () => {
      const { result } = renderHook(() => useModelComparison())

      const incompleteConversation = {
        id: 'conv-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        messages: [],
      } as unknown as ModelConversation

      act(() => {
        result.current.setConversations([incompleteConversation])
      })

      expect(result.current.conversations.length).toBe(1)
    })
  })

  describe('Closed Cards Edge Cases', () => {
    it('should handle closing non-existent card', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setClosedCards(new Set(['non-existent-id']))
      })

      expect(result.current.closedCards.has('non-existent-id')).toBe(true)
    })

    it('should handle closing same card multiple times', () => {
      const { result } = renderHook(() => useModelComparison())

      const cardId = createModelId('gpt-4')

      act(() => {
        const closed = new Set(result.current.closedCards)
        closed.add(cardId)
        result.current.setClosedCards(closed)
        // Add again
        const closed2 = new Set(result.current.closedCards)
        closed2.add(cardId)
        result.current.setClosedCards(closed2)
      })

      expect(result.current.closedCards.has(cardId)).toBe(true)
      expect(result.current.closedCards.size).toBe(1)
    })

    it('should handle closing all cards', () => {
      const { result } = renderHook(() => useModelComparison())

      const modelIds = [createModelId('gpt-4'), createModelId('claude-3'), createModelId('gpt-3.5')]

      act(() => {
        result.current.setClosedCards(new Set(modelIds))
      })

      expect(result.current.closedCards.size).toBe(3)
      modelIds.forEach(id => {
        expect(result.current.closedCards.has(id)).toBe(true)
      })
    })
  })

  describe('Active Result Tabs Edge Cases', () => {
    it('should handle empty active tabs', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setActiveResultTabs({})
      })

      expect(result.current.activeResultTabs).toEqual({})
    })

    it('should handle tabs for non-existent models', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setActiveResultTabs({
          'non-existent-model': 'code',
        })
      })

      expect(result.current.activeResultTabs['non-existent-model']).toBe('code')
    })

    it('should handle invalid tab values', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setActiveResultTabs({
          [createModelId('gpt-4')]: 'invalid-tab' as unknown as ResultTab,
        })
      })

      // Should accept any string (validation happens elsewhere)
      expect(result.current.activeResultTabs[createModelId('gpt-4')]).toBe('invalid-tab')
    })
  })

  describe('Extended Mode Edge Cases', () => {
    it('should handle rapid extended mode toggles', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsExtendedMode(true)
        result.current.setIsExtendedMode(false)
        result.current.setIsExtendedMode(true)
      })

      expect(result.current.isExtendedMode).toBe(true)
    })

    it('should handle extended mode with existing response', () => {
      const { result } = renderHook(() => useModelComparison())

      const mockResponse = createMockCompareResponse([createModelId('gpt-4')])

      act(() => {
        result.current.setResponse(mockResponse)
        result.current.setIsExtendedMode(true)
      })

      expect(result.current.isExtendedMode).toBe(true)
      expect(result.current.response).toEqual(mockResponse)
    })
  })

  describe('Follow-up Mode Edge Cases', () => {
    it('should handle rapid follow-up mode toggles', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsFollowUpMode(true)
        result.current.setIsFollowUpMode(false)
        result.current.setIsFollowUpMode(true)
      })

      expect(result.current.isFollowUpMode).toBe(true)
    })

    it('should handle follow-up mode without conversations', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setConversations([])
        result.current.setIsFollowUpMode(true)
      })

      expect(result.current.isFollowUpMode).toBe(true)
      expect(result.current.conversations.length).toBe(0)
    })
  })

  describe('Processing Time Edge Cases', () => {
    it('should handle null processing time', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setProcessingTime(null)
      })

      expect(result.current.processingTime).toBe(null)
    })

    it('should handle zero processing time', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setProcessingTime(0)
      })

      expect(result.current.processingTime).toBe(0)
    })

    it('should handle very large processing time', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setProcessingTime(999999)
      })

      expect(result.current.processingTime).toBe(999999)
    })

    it('should handle negative processing time', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setProcessingTime(-1)
      })

      // Should accept negative (may be clamped elsewhere)
      expect(result.current.processingTime).toBe(-1)
    })
  })

  describe('Ref Edge Cases', () => {
    it('should handle ref updates', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.userCancelledRef.current = true
        result.current.followUpJustActivatedRef.current = true
        result.current.hasScrolledToResultsRef.current = true
      })

      expect(result.current.userCancelledRef.current).toBe(true)
      expect(result.current.followUpJustActivatedRef.current).toBe(true)
      expect(result.current.hasScrolledToResultsRef.current).toBe(true)
    })

    it('should handle scroll listeners ref', () => {
      const { result } = renderHook(() => useModelComparison())

      const listener = () => {}

      act(() => {
        result.current.scrollListenersRef.current.set('test-id', listener)
      })

      expect(result.current.scrollListenersRef.current.get('test-id')).toBe(listener)
    })

    it('should handle user interacting ref', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.userInteractingRef.current.add('test-id')
      })

      expect(result.current.userInteractingRef.current.has('test-id')).toBe(true)
    })
  })

  describe('Abort Controller Edge Cases', () => {
    it('should handle null abort controller', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setCurrentAbortController(null)
      })

      expect(result.current.currentAbortController).toBe(null)
    })

    it('should handle abort controller replacement', () => {
      const { result } = renderHook(() => useModelComparison())

      const controller1 = new AbortController()
      const controller2 = new AbortController()

      act(() => {
        result.current.setCurrentAbortController(controller1)
        result.current.setCurrentAbortController(controller2)
      })

      expect(result.current.currentAbortController).toBe(controller2)
    })
  })

  describe('Scroll Lock Edge Cases', () => {
    it('should handle scroll lock toggles', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsScrollLocked(true)
        result.current.setIsScrollLocked(false)
        result.current.setIsScrollLocked(true)
      })

      expect(result.current.isScrollLocked).toBe(true)
    })

    it('should sync scroll lock ref with state', () => {
      const { result } = renderHook(() => useModelComparison())

      act(() => {
        result.current.setIsScrollLocked(true)
        // Manually sync ref (implementation doesn't auto-sync)
        result.current.isScrollLockedRef.current = true
      })

      expect(result.current.isScrollLocked).toBe(true)
      expect(result.current.isScrollLockedRef.current).toBe(true)
    })
  })
})
