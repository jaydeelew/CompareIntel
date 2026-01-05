/**
 * Tests for compareService
 *
 * Tests comparison endpoints, streaming, rate limits, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { apiClient } from '../../services/api/client'
import { ApiError } from '../../services/api/errors'
import * as compareService from '../../services/compareService'
import { createModelId } from '../../types'
import { STREAM_EVENT_TYPE, type StreamEvent } from '../../types'
import { createMockRateLimitStatus, createMockStreamEvent } from '../utils'

// Mock the API client
vi.mock('../../services/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    stream: vi.fn(),
  },
}))

describe('compareService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('compareStream', () => {
    it('should perform streaming comparison', async () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4')],
      }

      const mockStream = new ReadableStream<Uint8Array>()
      vi.mocked(apiClient.stream).mockResolvedValue(mockStream)

      const result = await compareService.compareStream(payload)

      expect(apiClient.stream).toHaveBeenCalledWith('/compare-stream', payload, {
        signal: undefined,
      })
      expect(result).toBe(mockStream)
    })

    it('should handle null stream response', async () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4')],
      }

      vi.mocked(apiClient.stream).mockResolvedValue(null)

      const result = await compareService.compareStream(payload)

      expect(result).toBeNull()
    })

    it('should handle streaming errors', async () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4')],
      }

      const error = new ApiError('Stream failed', 500, 'Internal Server Error')
      vi.mocked(apiClient.stream).mockRejectedValue(error)

      await expect(compareService.compareStream(payload)).rejects.toThrow(ApiError)
    })
  })

  describe('processStreamEvents', () => {
    it('should process stream events correctly', async () => {
      const startEvent = createMockStreamEvent(STREAM_EVENT_TYPE.START, {
        model: createModelId('gpt-4'),
      })
      const chunkEvent = createMockStreamEvent(STREAM_EVENT_TYPE.CHUNK, {
        model: createModelId('gpt-4'),
        content: 'chunk content',
      })
      const doneEvent = createMockStreamEvent(STREAM_EVENT_TYPE.DONE, {
        model: createModelId('gpt-4'),
      })

      const events = [startEvent, chunkEvent, doneEvent]
      const stream = createMockStream(events)

      const callbacks = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onDone: vi.fn(),
      }

      await compareService.processStreamEvents(stream, callbacks)

      expect(callbacks.onStart).toHaveBeenCalledWith(createModelId('gpt-4'))
      expect(callbacks.onChunk).toHaveBeenCalledWith(createModelId('gpt-4'), 'chunk content')
      expect(callbacks.onDone).toHaveBeenCalledWith(createModelId('gpt-4'))
    })

    it('should handle complete event', async () => {
      const completeEvent = createMockStreamEvent(STREAM_EVENT_TYPE.COMPLETE, {
        metadata: {
          input_length: 100,
          models_requested: 2,
          models_successful: 2,
          models_failed: 0,
          timestamp: new Date().toISOString(),
          processing_time_ms: 1500,
        },
      })

      const stream = createMockStream([completeEvent])
      const callbacks = {
        onComplete: vi.fn(),
      }

      await compareService.processStreamEvents(stream, callbacks)

      expect(callbacks.onComplete).toHaveBeenCalledWith(completeEvent.metadata)
    })

    it('should handle error events', async () => {
      const errorEvent = createMockStreamEvent(STREAM_EVENT_TYPE.ERROR, {
        message: 'Stream error',
      })

      const stream = createMockStream([errorEvent])
      const callbacks = {
        onError: vi.fn(),
      }

      await compareService.processStreamEvents(stream, callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should handle null stream', async () => {
      const callbacks = {
        onError: vi.fn(),
      }

      await compareService.processStreamEvents(null, callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should handle stream reading errors', async () => {
      const stream = {
        getReader: () => {
          throw new Error('Stream error')
        },
      } as unknown as ReadableStream<Uint8Array>

      const callbacks = {
        onError: vi.fn(),
      }

      await expect(compareService.processStreamEvents(stream, callbacks)).rejects.toThrow()
    })
  })

  describe('getRateLimitStatus', () => {
    it('should get rate limit status for authenticated user', async () => {
      const mockStatus = createMockRateLimitStatus()
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStatus })

      const result = await compareService.getRateLimitStatus()

      // getRateLimitStatus now includes timezone parameter and cache options
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringMatching(/^\/rate-limit-status\?timezone=/),
        expect.objectContaining({
          cacheTTL: 30000,
          _cacheKey: expect.stringMatching(/^GET:\/rate-limit-status\?timezone=/),
        })
      )
      expect(result).toEqual(mockStatus)
    })

    it('should get rate limit status with fingerprint', async () => {
      const fingerprint = 'test-fingerprint'
      const mockStatus = createMockRateLimitStatus({ user_type: 'anonymous' })
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStatus })

      const result = await compareService.getRateLimitStatus(fingerprint)

      // getRateLimitStatus now includes timezone parameter and cache options
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `^/rate-limit-status\\?fingerprint=${encodeURIComponent(fingerprint)}&timezone=`
          )
        ),
        expect.objectContaining({
          cacheTTL: 30000,
          _cacheKey: expect.stringMatching(
            new RegExp(
              `^GET:/rate-limit-status\\?fingerprint=${encodeURIComponent(fingerprint)}&timezone=`
            )
          ),
        })
      )
      expect(result).toEqual(mockStatus)
    })

    it('should handle API errors', async () => {
      const error = new ApiError('Rate limit check failed', 500, 'Internal Server Error')
      vi.mocked(apiClient.get).mockRejectedValue(error)

      await expect(compareService.getRateLimitStatus()).rejects.toThrow(ApiError)
    })
  })

  describe('getAnonymousMockModeStatus', () => {
    it('should get anonymous mock mode status', async () => {
      const mockStatus = {
        anonymous_mock_mode_enabled: true,
        is_development: true,
      }

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStatus })

      const result = await compareService.getAnonymousMockModeStatus()

      // getAnonymousMockModeStatus now includes cache options
      expect(apiClient.get).toHaveBeenCalledWith('/anonymous-mock-mode-status', {
        cacheTTL: 300000,
        _cacheKey: 'GET:/anonymous-mock-mode-status',
      })
      expect(result).toEqual(mockStatus)
    })
  })

  describe('getModelStats', () => {
    it('should get model statistics', async () => {
      const mockStats = {
        model_stats: {
          [createModelId('gpt-4')]: {
            success: 10,
            failure: 2,
            last_error: null,
            last_success: new Date().toISOString(),
          },
        },
      }

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStats })

      const result = await compareService.getModelStats()

      expect(apiClient.get).toHaveBeenCalledWith('/model-stats')
      expect(result).toEqual(mockStats.model_stats)
    })
  })

  describe('resetRateLimit', () => {
    it('should reset rate limit for authenticated user', async () => {
      const mockResponse = { message: 'Rate limit reset' }
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await compareService.resetRateLimit()

      expect(apiClient.post).toHaveBeenCalledWith('/dev/reset-rate-limit', {})
      expect(result).toEqual(mockResponse)
    })

    it('should reset rate limit with fingerprint', async () => {
      const fingerprint = 'test-fingerprint'
      const mockResponse = { message: 'Rate limit reset' }
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse })

      const result = await compareService.resetRateLimit(fingerprint)

      expect(apiClient.post).toHaveBeenCalledWith('/dev/reset-rate-limit', { fingerprint })
      expect(result).toEqual(mockResponse)
    })
  })
})

/**
 * Helper function to create a mock ReadableStream from events
 */
function createMockStream(events: StreamEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks = events.map(event => {
    const jsonStr = JSON.stringify(event)
    return `data: ${jsonStr}\n\n`
  })

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}
