/**
 * Tests for conversationService
 *
 * Tests conversation CRUD operations and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { apiClient } from '../../services/api/client'
import { ApiError } from '../../services/api/errors'
import * as conversationService from '../../services/conversationService'
import { createConversationId } from '../../types'
import { createMockConversationSummary } from '../utils'

// Mock the API client
vi.mock('../../services/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('conversationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getConversations', () => {
    it('should get list of conversations', async () => {
      const mockConversations = [
        createMockConversationSummary({ id: createConversationId(1) }),
        createMockConversationSummary({ id: createConversationId(2) }),
      ]

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockConversations })

      const result = await conversationService.getConversations()

      expect(apiClient.get).toHaveBeenCalledWith('/conversations')
      expect(result).toEqual(mockConversations)
    })

    it('should return empty array when no conversations', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [] })

      const result = await conversationService.getConversations()

      expect(result).toEqual([])
    })

    it('should handle API errors', async () => {
      const error = new ApiError('Failed to fetch conversations', 500, 'Internal Server Error')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(conversationService.getConversations()).rejects.toThrow(ApiError)
    })

    it('should handle authentication errors', async () => {
      const error = new ApiError('Not authenticated', 401, 'Unauthorized')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(conversationService.getConversations()).rejects.toThrow(ApiError)
    })
  })

  describe('getConversation', () => {
    it('should get conversation details', async () => {
      const conversationId = createConversationId(1)
      const mockConversation = {
        id: conversationId,
        title: 'Test Conversation',
        input_data: 'test input',
        models_used: ['gpt-4', 'claude-3'],
        created_at: new Date().toISOString(),
        messages: [
          {
            id: 1,
            model_id: 'gpt-4',
            role: 'user' as const,
            content: 'test message',
            success: true,
            processing_time_ms: 1000,
            created_at: new Date().toISOString(),
          },
        ],
      }

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockConversation })

      const result = await conversationService.getConversation(conversationId)

      expect(apiClient.get).toHaveBeenCalledWith(`/conversations/${conversationId}`)
      expect(result).toEqual(mockConversation)
    })

    it('should handle not found errors', async () => {
      const conversationId = createConversationId(999)
      const error = new ApiError('Conversation not found', 404, 'Not Found')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(conversationService.getConversation(conversationId)).rejects.toThrow(ApiError)
    })
  })

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      const conversationId = createConversationId(1)
      vi.mocked(apiClient.delete).mockResolvedValue(undefined)

      await conversationService.deleteConversation(conversationId)

      expect(apiClient.delete).toHaveBeenCalledWith(`/conversations/${conversationId}`)
    })

    it('should handle deletion errors', async () => {
      const conversationId = createConversationId(1)
      const error = new ApiError('Failed to delete', 500, 'Internal Server Error')
      vi.mocked(apiClient.delete).mockRejectedValue(error)

      await expect(conversationService.deleteConversation(conversationId)).rejects.toThrow(ApiError)
    })

    it('should handle not found errors', async () => {
      const conversationId = createConversationId(999)
      const error = new ApiError('Conversation not found', 404, 'Not Found')
      vi.mocked(apiClient.delete).mockRejectedValue(error)

      await expect(conversationService.deleteConversation(conversationId)).rejects.toThrow(ApiError)
    })
  })
})
