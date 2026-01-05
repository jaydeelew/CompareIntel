/**
 * Tests for modelsService
 *
 * Tests model listing endpoints and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { apiClient } from '../../services/api/client'
import { ApiError } from '../../services/api/errors'
import * as modelsService from '../../services/modelsService'
import { createMockModelsByProvider } from '../utils'

// Mock the API client
vi.mock('../../services/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe('modelsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse })

      const result = await modelsService.getAvailableModels()

      // getAvailableModels now includes cache options
      expect(apiClient.get).toHaveBeenCalledWith('/models', {
        cacheTTL: 600000,
        _cacheKey: 'GET:/models',
      })
      expect(result).toEqual(mockResponse)
    })

    it('should handle API errors', async () => {
      const error = new ApiError('Failed to fetch models', 500, 'Internal Server Error')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(modelsService.getAvailableModels()).rejects.toThrow(ApiError)
    })
  })

  describe('getModelsByProvider', () => {
    it('should get models organized by provider', async () => {
      const mockModelsByProvider = createMockModelsByProvider()
      const mockResponse = {
        models: [],
        models_by_provider: mockModelsByProvider,
      }

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse })

      const result = await modelsService.getModelsByProvider()

      // getModelsByProvider now includes cache options
      expect(apiClient.get).toHaveBeenCalledWith('/models', {
        cacheTTL: 600000,
        _cacheKey: 'GET:/models',
      })
      expect(result).toEqual(mockModelsByProvider)
    })

    it('should handle empty models', async () => {
      const mockResponse = {
        models: [],
        models_by_provider: {},
      }

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse })

      const result = await modelsService.getModelsByProvider()

      expect(result).toEqual({})
    })

    it('should handle API errors', async () => {
      const error = new ApiError('Failed to fetch models', 500, 'Internal Server Error')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(modelsService.getModelsByProvider()).rejects.toThrow(ApiError)
    })
  })
})
