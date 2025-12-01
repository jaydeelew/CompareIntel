/**
 * Tests for useConversationHistory hook
 *
 * Tests conversation history management, localStorage operations, API calls, and error handling.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useConversationHistory } from '../../hooks/useConversationHistory'
import * as apiClient from '../../services/api/client'
import { ApiError } from '../../services/api/errors'
import * as conversationService from '../../services/conversationService'
import type { ConversationSummary } from '../../types'
import { createConversationId, createModelId } from '../../types'
import {
  createMockUser,
  createMockConversationSummary,
  createMockModelConversation,
  createMockConversationMessage,
} from '../utils'

// Mock the services
vi.mock('../../services/conversationService', () => ({
  getConversations: vi.fn(),
  deleteConversation: vi.fn(),
}))

vi.mock('../../services/api/client', () => ({
  apiClient: {
    deleteCache: vi.fn(),
  },
}))

describe('useConversationHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      expect(result.current.conversationHistory).toEqual([])
      expect(result.current.isLoadingHistory).toBe(false)
      expect(result.current.currentVisibleComparisonId).toBe(null)
      expect(result.current.showHistoryDropdown).toBe(false)
    })

    it('should set correct history limit for anonymous users', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      expect(result.current.historyLimit).toBe(2)
    })

    it('should set correct history limit for free tier', () => {
      const user = createMockUser({ subscription_tier: 'free' })
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      expect(result.current.historyLimit).toBe(3)
    })

    it('should set correct history limit for pro tier', () => {
      const user = createMockUser({ subscription_tier: 'pro' })
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      expect(result.current.historyLimit).toBe(50)
    })
  })

  describe('loadHistoryFromLocalStorage', () => {
    it('should load history from localStorage', () => {
      const mockHistory = [
        createMockConversationSummary({ id: createConversationId('1') }),
        createMockConversationSummary({ id: createConversationId('2') }),
      ]
      localStorage.setItem('compareintel_conversation_history', JSON.stringify(mockHistory))

      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const history = result.current.loadHistoryFromLocalStorage()
      expect(history).toEqual(mockHistory)
    })

    it('should return empty array when no history exists', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const history = result.current.loadHistoryFromLocalStorage()
      expect(history).toEqual([])
    })

    it('should handle invalid JSON gracefully', () => {
      localStorage.setItem('compareintel_conversation_history', 'invalid-json')
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const history = result.current.loadHistoryFromLocalStorage()
      expect(history).toEqual([])

      consoleErrorSpy.mockRestore()
    })

    it('should sort history by created_at descending', () => {
      const oldDate = new Date('2024-01-01').toISOString()
      const newDate = new Date('2024-01-02').toISOString()

      const mockHistory = [
        createMockConversationSummary({
          id: createConversationId('1'),
          created_at: oldDate,
        }),
        createMockConversationSummary({
          id: createConversationId('2'),
          created_at: newDate,
        }),
      ]
      localStorage.setItem('compareintel_conversation_history', JSON.stringify(mockHistory))

      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const history = result.current.loadHistoryFromLocalStorage()
      expect(history[0].created_at).toBe(newDate)
      expect(history[1].created_at).toBe(oldDate)
    })
  })

  describe('saveConversationToLocalStorage', () => {
    it('should save new conversation to localStorage', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const conversations = [
        createMockModelConversation({
          modelId: createModelId('gpt-4'),
          messages: [
            createMockConversationMessage({ type: 'user' }),
            createMockConversationMessage({ type: 'assistant' }),
          ],
        }),
      ]

      act(() => {
        const conversationId = result.current.saveConversationToLocalStorage(
          'test input',
          [createModelId('gpt-4')],
          conversations,
          false
        )

        expect(conversationId).toBeTruthy()
      })

      const savedHistory = result.current.loadHistoryFromLocalStorage()
      expect(savedHistory.length).toBe(1)
      expect(savedHistory[0].input_data).toBe('test input')
      expect(localStorage.getItem(`compareintel_conversation_${savedHistory[0].id}`)).toBeTruthy()
    })

    it('should limit to 2 conversations for anonymous users', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const conversations = [
        createMockModelConversation({
          modelId: createModelId('gpt-4'),
          messages: [createMockConversationMessage()],
        }),
      ]

      // Save 3 conversations
      act(() => {
        result.current.saveConversationToLocalStorage(
          'input1',
          [createModelId('gpt-4')],
          conversations,
          false
        )
        result.current.saveConversationToLocalStorage(
          'input2',
          [createModelId('gpt-4')],
          conversations,
          false
        )
        result.current.saveConversationToLocalStorage(
          'input3',
          [createModelId('gpt-4')],
          conversations,
          false
        )
      })

      const savedHistory = result.current.loadHistoryFromLocalStorage()
      expect(savedHistory.length).toBe(2)
      expect(savedHistory[0].input_data).toBe('input3') // Most recent first
    })

    it('should update existing conversation when isUpdate is true', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const conversations = [
        createMockModelConversation({
          modelId: createModelId('gpt-4'),
          messages: [createMockConversationMessage()],
        }),
      ]

      let _conversationId: string

      act(() => {
        _conversationId = result.current.saveConversationToLocalStorage(
          'test input',
          [createModelId('gpt-4')],
          conversations,
          false
        )
      })

      const initialHistory = result.current.loadHistoryFromLocalStorage()
      expect(initialHistory.length).toBe(1)

      // Update the conversation
      act(() => {
        const updatedConversations = [
          createMockModelConversation({
            modelId: createModelId('gpt-4'),
            messages: [createMockConversationMessage(), createMockConversationMessage()],
          }),
        ]

        result.current.saveConversationToLocalStorage(
          'test input',
          [createModelId('gpt-4')],
          updatedConversations,
          true
        )
      })

      const updatedHistory = result.current.loadHistoryFromLocalStorage()
      expect(updatedHistory.length).toBe(1)
      expect(updatedHistory[0].message_count).toBe(2)
    })
  })

  describe('loadHistoryFromAPI', () => {
    it('should load history from API for authenticated users', async () => {
      const mockHistory = [
        createMockConversationSummary({ id: createConversationId(1) }),
        createMockConversationSummary({ id: createConversationId(2) }),
      ]

      vi.mocked(conversationService.getConversations).mockResolvedValue(mockHistory)

      const user = createMockUser()
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      await act(async () => {
        await result.current.loadHistoryFromAPI()
      })

      expect(result.current.conversationHistory).toEqual(mockHistory)
      expect(result.current.isLoadingHistory).toBe(false)
    })

    it('should not load for anonymous users', async () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      await act(async () => {
        await result.current.loadHistoryFromAPI()
      })

      expect(conversationService.getConversations).not.toHaveBeenCalled()
    })

    it('should handle API errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(conversationService.getConversations).mockRejectedValue(
        new ApiError('API Error', 500)
      )

      const user = createMockUser()
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      await act(async () => {
        await result.current.loadHistoryFromAPI()
      })

      expect(result.current.conversationHistory).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('should set loading state during fetch', async () => {
      let resolvePromise: (value: ConversationSummary[]) => void
      const promise = new Promise<ConversationSummary[]>(resolve => {
        resolvePromise = resolve
      })

      vi.mocked(conversationService.getConversations).mockReturnValue(promise)

      const user = createMockUser()
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      act(() => {
        result.current.loadHistoryFromAPI()
      })

      expect(result.current.isLoadingHistory).toBe(true)

      await act(async () => {
        resolvePromise!([])
        await promise
      })

      expect(result.current.isLoadingHistory).toBe(false)
    })
  })

  describe('deleteConversation', () => {
    it('should delete conversation from API for authenticated users', async () => {
      const mockHistory = [
        createMockConversationSummary({ id: createConversationId(1) }),
        createMockConversationSummary({ id: createConversationId(2) }),
      ]

      vi.mocked(conversationService.getConversations).mockResolvedValue(mockHistory)
      vi.mocked(conversationService.deleteConversation).mockResolvedValue(undefined)

      const user = createMockUser()
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      await act(async () => {
        await result.current.loadHistoryFromAPI()
      })

      const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.deleteConversation(mockHistory[0], mockEvent)
      })

      expect(conversationService.deleteConversation).toHaveBeenCalledWith(1)
      expect(apiClient.apiClient.deleteCache).toHaveBeenCalledWith('GET:/conversations')
      expect(mockEvent.stopPropagation).toHaveBeenCalled()
    })

    it('should delete conversation from localStorage for anonymous users', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const conversations = [
        createMockModelConversation({
          modelId: createModelId('gpt-4'),
          messages: [createMockConversationMessage()],
        }),
      ]

      let conversationId: string

      act(() => {
        conversationId = result.current.saveConversationToLocalStorage(
          'test input',
          [createModelId('gpt-4')],
          conversations,
          false
        )
      })

      const history = result.current.loadHistoryFromLocalStorage()
      expect(history.length).toBe(1)

      const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent

      act(() => {
        result.current.deleteConversation(history[0], mockEvent)
      })

      const updatedHistory = result.current.loadHistoryFromLocalStorage()
      expect(updatedHistory.length).toBe(0)
      expect(localStorage.getItem(`compareintel_conversation_${conversationId}`)).toBeNull()
    })

    it('should call onDeleteActiveConversation when deleting active conversation', async () => {
      const onDeleteActiveConversation = vi.fn()
      const mockHistory = [createMockConversationSummary({ id: createConversationId(1) })]

      vi.mocked(conversationService.getConversations).mockResolvedValue(mockHistory)
      vi.mocked(conversationService.deleteConversation).mockResolvedValue(undefined)

      const user = createMockUser()
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
          onDeleteActiveConversation,
        })
      )

      await act(async () => {
        await result.current.loadHistoryFromAPI()
        result.current.setCurrentVisibleComparisonId('1')
      })

      const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.deleteConversation(mockHistory[0], mockEvent)
      })

      expect(onDeleteActiveConversation).toHaveBeenCalled()
      expect(result.current.currentVisibleComparisonId).toBe(null)
    })

    it('should handle delete errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(conversationService.deleteConversation).mockRejectedValue(
        new ApiError('Delete failed', 500)
      )

      const mockHistory = [createMockConversationSummary({ id: createConversationId(1) })]

      vi.mocked(conversationService.getConversations).mockResolvedValue(mockHistory)

      const user = createMockUser()
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      await act(async () => {
        await result.current.loadHistoryFromAPI()
      })

      const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.deleteConversation(mockHistory[0], mockEvent)
      })

      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('loadConversationFromLocalStorage', () => {
    it('should load conversation from localStorage', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const conversationId = 'test-id'
      const mockConversation = createMockModelConversation({
        modelId: createModelId('gpt-4'),
        messages: [createMockConversationMessage()],
      })

      // The hook expects conversations array in the stored data
      const conversationData = {
        conversations: [mockConversation],
      }

      localStorage.setItem(
        `compareintel_conversation_${conversationId}`,
        JSON.stringify(conversationData)
      )

      const loaded = result.current.loadConversationFromLocalStorage(conversationId)
      // The hook adds isStreaming: false to conversations
      expect(loaded).toEqual(
        conversationData.conversations.map(conv => ({ ...conv, isStreaming: false }))
      )
    })

    it('should return empty array when conversation not found', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      const loaded = result.current.loadConversationFromLocalStorage('non-existent')
      expect(loaded).toEqual([])

      consoleErrorSpy.mockRestore()
    })
  })

  describe('syncHistoryAfterComparison', () => {
    it('should reload history from API after comparison', async () => {
      const mockHistory = [
        createMockConversationSummary({
          id: createConversationId(1),
          input_data: 'test input',
          models_used: [createModelId('gpt-4')],
        }),
      ]

      vi.mocked(conversationService.getConversations).mockResolvedValue(mockHistory)

      const user = createMockUser()
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      await act(async () => {
        await result.current.syncHistoryAfterComparison('test input', [createModelId('gpt-4')])
      })

      expect(apiClient.apiClient.deleteCache).toHaveBeenCalledWith('GET:/conversations')
      expect(conversationService.getConversations).toHaveBeenCalled()
    })

    it('should not sync for anonymous users', async () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      await act(async () => {
        await result.current.syncHistoryAfterComparison('test input', [createModelId('gpt-4')])
      })

      expect(conversationService.getConversations).not.toHaveBeenCalled()
    })
  })

  describe('auto-loading on mount', () => {
    it('should load from API for authenticated users on mount', async () => {
      const mockHistory = [createMockConversationSummary({ id: createConversationId(1) })]
      vi.mocked(conversationService.getConversations).mockResolvedValue(mockHistory)

      const user = createMockUser()
      renderHook(() =>
        useConversationHistory({
          isAuthenticated: true,
          user,
        })
      )

      await waitFor(() => {
        expect(conversationService.getConversations).toHaveBeenCalled()
      })
    })

    it('should load from localStorage for anonymous users on mount', () => {
      const mockHistory = [createMockConversationSummary({ id: createConversationId('1') })]
      localStorage.setItem('compareintel_conversation_history', JSON.stringify(mockHistory))

      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      expect(result.current.conversationHistory).toEqual(mockHistory)
    })
  })

  describe('state setters', () => {
    it('should allow setting isLoadingHistory', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.setIsLoadingHistory(true)
      })

      expect(result.current.isLoadingHistory).toBe(true)
    })

    it('should allow setting currentVisibleComparisonId', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.setCurrentVisibleComparisonId('test-id')
      })

      expect(result.current.currentVisibleComparisonId).toBe('test-id')
    })

    it('should allow setting showHistoryDropdown', () => {
      const { result } = renderHook(() =>
        useConversationHistory({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.setShowHistoryDropdown(true)
      })

      expect(result.current.showHistoryDropdown).toBe(true)
    })
  })
})
