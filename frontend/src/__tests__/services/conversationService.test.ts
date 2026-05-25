/**
 * Tests for conversationService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { ApiError } from '../../services/api/errors'
import * as conversationService from '../../services/conversationService'
import { createConversationId } from '../../types'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'
import { createMockConversationSummary } from '../utils'

describe('conversationService', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('getConversations', () => {
    it('should get list of conversations', async () => {
      const mockConversations = [
        createMockConversationSummary({ id: createConversationId(1) }),
        createMockConversationSummary({ id: createConversationId(2) }),
      ]

      server.use(
        http.get(apiPathGlob('/api/conversations'), () => HttpResponse.json(mockConversations))
      )

      const result = await conversationService.getConversations()

      expect(result).toEqual(mockConversations)
    })

    it('should return empty array when no conversations', async () => {
      server.use(http.get(apiPathGlob('/api/conversations'), () => HttpResponse.json([])))

      const result = await conversationService.getConversations()

      expect(result).toEqual([])
    })

    it('should handle API errors', () => {
      server.use(
        http.get(apiPathGlob('/api/conversations'), () =>
          HttpResponse.json({ detail: 'Failed to fetch conversations' }, { status: 500 })
        )
      )

      return expect(conversationService.getConversations()).rejects.toThrow(ApiError)
    })

    it('should handle authentication errors', () => {
      server.use(
        http.get(apiPathGlob('/api/conversations'), () =>
          HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
        )
      )

      return expect(conversationService.getConversations()).rejects.toThrow(ApiError)
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

      server.use(
        http.get(apiPathGlob(`/api/conversations/${conversationId}`), () =>
          HttpResponse.json(mockConversation)
        )
      )

      const result = await conversationService.getConversation(conversationId)

      expect(result).toEqual(mockConversation)
    })

    it('should handle not found errors', () => {
      const conversationId = createConversationId(999)
      server.use(
        http.get(apiPathGlob(`/api/conversations/${conversationId}`), () =>
          HttpResponse.json({ detail: 'Conversation not found' }, { status: 404 })
        )
      )

      return expect(conversationService.getConversation(conversationId)).rejects.toThrow(ApiError)
    })
  })

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      const conversationId = createConversationId(1)
      let invoked = false
      server.use(
        http.delete(apiPathGlob(`/api/conversations/${conversationId}`), ({ request }) => {
          invoked = true
          expect(request.method).toBe('DELETE')
          return new HttpResponse(null, { status: 204 })
        })
      )

      await conversationService.deleteConversation(conversationId)
      expect(invoked).toBe(true)
    })

    it('should handle deletion errors', () => {
      const conversationId = createConversationId(1)
      server.use(
        http.delete(apiPathGlob(`/api/conversations/${conversationId}`), () =>
          HttpResponse.json({ detail: 'Failed to delete' }, { status: 500 })
        )
      )

      return expect(conversationService.deleteConversation(conversationId)).rejects.toThrow(
        ApiError
      )
    })

    it('should handle not found errors', () => {
      const conversationId = createConversationId(999)
      server.use(
        http.delete(apiPathGlob(`/api/conversations/${conversationId}`), () =>
          HttpResponse.json({ detail: 'Conversation not found' }, { status: 404 })
        )
      )

      return expect(conversationService.deleteConversation(conversationId)).rejects.toThrow(
        ApiError
      )
    })
  })

  describe('deleteAllConversations', () => {
    it('should delete all conversations and return count', async () => {
      const mockResponse = {
        message: 'Successfully deleted 5 conversation(s)',
        deleted_count: 5,
      }
      server.use(
        http.delete(apiPathGlob('/api/conversations/all'), () => HttpResponse.json(mockResponse))
      )

      const result = await conversationService.deleteAllConversations()

      expect(result).toEqual(mockResponse)
      expect(result.deleted_count).toBe(5)
    })

    it('should handle zero conversations to delete', async () => {
      const mockResponse = {
        message: 'Successfully deleted 0 conversation(s)',
        deleted_count: 0,
      }
      server.use(
        http.delete(apiPathGlob('/api/conversations/all'), () => HttpResponse.json(mockResponse))
      )

      const result = await conversationService.deleteAllConversations()

      expect(result.deleted_count).toBe(0)
    })

    it('should handle authentication errors', () => {
      server.use(
        http.delete(apiPathGlob('/api/conversations/all'), () =>
          HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
        )
      )

      return expect(conversationService.deleteAllConversations()).rejects.toThrow(ApiError)
    })

    it('should handle server errors', () => {
      server.use(
        http.delete(apiPathGlob('/api/conversations/all'), () =>
          HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        )
      )

      return expect(conversationService.deleteAllConversations()).rejects.toThrow(ApiError)
    })
  })
})
