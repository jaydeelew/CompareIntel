/**
 * Tests for compareService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { ApiError } from '../../services/api/errors'
import * as compareService from '../../services/compareService'
import { createModelId } from '../../types'
import { STREAM_EVENT_TYPE, type StreamEvent } from '../../types'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'
import { createMockRateLimitStatus, createMockStreamEvent } from '../utils'

describe('compareService', () => {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  beforeEach(() => {
    server.resetHandlers()
  })

  describe('compareStream', () => {
    it('should perform streaming comparison', async () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4')],
      }

      const mockStreamBody = new ReadableStream<Uint8Array>()
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.input_data).toBe(payload.input_data)
          return new HttpResponse(mockStreamBody, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      const result = await compareService.compareStream(payload)
      expect(result).toBeDefined()
    })

    it('should handle null stream response', async () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4')],
      }

      server.use(
        http.post(
          apiPathGlob('/api/compare-stream'),
          () =>
            new HttpResponse(null, {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream' },
            })
        )
      )

      const result = await compareService.compareStream(payload)
      expect(result).toBeNull()
    })

    it('should handle streaming errors', () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4')],
      }

      server.use(
        http.post(apiPathGlob('/api/compare-stream'), () =>
          HttpResponse.json({ detail: 'Stream failed' }, { status: 500 })
        )
      )

      return expect(compareService.compareStream(payload)).rejects.toThrow(ApiError)
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
      server.use(
        http.get(apiPathGlob('/api/rate-limit-status'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('timezone')).toBe(userTimezone)
          expect(u.searchParams.has('fingerprint')).toBe(false)
          return HttpResponse.json(mockStatus)
        })
      )

      const result = await compareService.getRateLimitStatus()
      expect(result).toEqual(mockStatus)
    })

    it('should get rate limit status with fingerprint', async () => {
      const fingerprint = 'test-fingerprint'
      const mockStatus = createMockRateLimitStatus({ user_type: 'anonymous' })
      server.use(
        http.get(apiPathGlob('/api/rate-limit-status'), ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('timezone')).toBe(userTimezone)
          expect(u.searchParams.get('fingerprint')).toBe(fingerprint)
          return HttpResponse.json(mockStatus)
        })
      )

      const result = await compareService.getRateLimitStatus(fingerprint)
      expect(result).toEqual(mockStatus)
    })

    it('should handle API errors', () => {
      server.use(
        http.get(apiPathGlob('/api/rate-limit-status'), () =>
          HttpResponse.json({ detail: 'Rate limit check failed' }, { status: 500 })
        )
      )

      return expect(compareService.getRateLimitStatus()).rejects.toThrow(ApiError)
    })
  })

  describe('getAnonymousMockModeStatus', () => {
    it('should get anonymous mock mode status', async () => {
      const mockStatus = {
        anonymous_mock_mode_enabled: true,
        is_development: true,
      }

      server.use(
        http.get(apiPathGlob('/api/anonymous-mock-mode-status'), () =>
          HttpResponse.json(mockStatus)
        )
      )

      const result = await compareService.getAnonymousMockModeStatus()
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

      server.use(http.get(apiPathGlob('/api/model-stats'), () => HttpResponse.json(mockStats)))

      const result = await compareService.getModelStats()
      expect(result).toEqual(mockStats.model_stats)
    })
  })

  describe('resetRateLimit', () => {
    it('should reset rate limit for authenticated user', async () => {
      const mockResponse = { message: 'Rate limit reset' }
      server.use(
        http.post(apiPathGlob('/api/dev/reset-rate-limit'), async ({ request }) => {
          expect(request.method).toBe('POST')
          const json = await request.json()
          expect(json).toEqual({})
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await compareService.resetRateLimit()
      expect(result).toEqual(mockResponse)
    })

    it('should reset rate limit with fingerprint', async () => {
      const fingerprint = 'test-fingerprint'
      const mockResponse = { message: 'Rate limit reset' }
      server.use(
        http.post(apiPathGlob('/api/dev/reset-rate-limit'), async ({ request }) => {
          const body = (await request.json()) as { fingerprint?: string }
          expect(body.fingerprint).toBe(fingerprint)
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await compareService.resetRateLimit(fingerprint)
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
