/**
 * Tests for modelsService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { ApiError } from '../../services/api/errors'
import * as modelsService from '../../services/modelsService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'
import { createMockModelsByProvider } from '../utils'

describe('modelsService', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('getAvailableModels', () => {
    it('should get available models', async () => {
      const mockResponse = {
        models: [
          {
            id: 'gpt-4',
            name: 'GPT-4',
            description: 'GPT-4 model',
            category: 'gpt',
            provider: 'OpenAI',
            available: true,
          },
          {
            id: 'claude-3',
            name: 'Claude 3',
            description: 'Claude 3 model',
            category: 'claude',
            provider: 'Anthropic',
            available: true,
          },
        ],
        models_by_provider: createMockModelsByProvider(),
      }

      server.use(
        http.get(apiPathGlob('/api/models'), ({ request }) => {
          const url = new URL(request.url)
          expect(url.pathname.endsWith('/api/models')).toBe(true)
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await modelsService.getAvailableModels()
      expect(result).toEqual(mockResponse)
    })

    it('should handle API errors', () => {
      server.use(
        http.get(apiPathGlob('/api/models'), () =>
          HttpResponse.json({ detail: 'Failed to fetch models' }, { status: 500 })
        )
      )

      return expect(modelsService.getAvailableModels()).rejects.toThrow(ApiError)
    })
  })

  describe('getModelsByProvider', () => {
    it('should get models organized by provider', async () => {
      const mockModelsByProvider = createMockModelsByProvider()
      const mockResponse = {
        models: [],
        models_by_provider: mockModelsByProvider,
      }

      server.use(http.get(apiPathGlob('/api/models'), () => HttpResponse.json(mockResponse)))

      const result = await modelsService.getModelsByProvider()
      expect(result).toEqual(mockModelsByProvider)
    })

    it('should handle empty models', async () => {
      const mockResponse = {
        models: [],
        models_by_provider: {},
      }

      server.use(http.get(apiPathGlob('/api/models'), () => HttpResponse.json(mockResponse)))

      const result = await modelsService.getModelsByProvider()
      expect(result).toEqual({})
    })

    it('should handle API errors', () => {
      server.use(
        http.get(apiPathGlob('/api/models'), () =>
          HttpResponse.json({ detail: 'Failed to fetch models' }, { status: 500 })
        )
      )

      return expect(modelsService.getModelsByProvider()).rejects.toThrow(ApiError)
    })
  })
})
