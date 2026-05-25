/**
 * Edge case tests for compareService (MSW intercepts HTTP; uses real apiClient).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { ApiError } from '../../services/api/errors'
import * as compareService from '../../services/compareService'
import { createModelId } from '../../types'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'

describe('compareService - Edge Cases', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('Streaming Error Handling', () => {
    it('should handle streaming connection errors', async () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4')],
      }

      server.use(http.post(apiPathGlob('/api/compare-stream'), () => HttpResponse.error()))

      await expect(compareService.compareStream(payload)).rejects.toThrow()
    })

    it('should handle streaming timeout', () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4')],
      }

      server.use(
        http.post(apiPathGlob('/api/compare-stream'), () =>
          HttpResponse.json({ detail: 'Request timeout' }, { status: 408 })
        )
      )

      return expect(compareService.compareStream(payload)).rejects.toThrow(ApiError)
    })

    it('should handle partial stream failure', async () => {
      const payload = {
        input_data: 'test input',
        models: [createModelId('gpt-4'), createModelId('claude-3')],
      }

      server.use(
        http.post(apiPathGlob('/api/compare-stream'), () => {
          const stream = new ReadableStream({
            async start(controller) {
              controller.enqueue(
                new TextEncoder().encode('data: {"type":"start","model":"gpt-4"}\n\n')
              )
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"chunk","model":"gpt-4","content":"Partial"}\n\n'
                )
              )
              controller.error(new Error('Stream interrupted'))
            },
          })

          return new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      const result = await compareService.compareStream(payload)
      expect(result).toBeDefined()
    })
  })

  describe('Rate Limit Status Edge Cases', () => {
    it('should handle rate limit status errors', () => {
      server.use(
        http.get(apiPathGlob('/api/rate-limit-status'), () =>
          HttpResponse.json({ detail: 'Rate limit check failed' }, { status: 500 })
        )
      )

      return expect(compareService.getRateLimitStatus()).rejects.toThrow(ApiError)
    })

    it('should handle rate limit status with null response', async () => {
      server.use(http.get(apiPathGlob('/api/rate-limit-status'), () => HttpResponse.json(null)))

      const result = (await compareService.getRateLimitStatus()) as unknown
      expect(result).toBeNull()
    })

    it('should handle rate limit status with sparse response', async () => {
      server.use(
        http.get(apiPathGlob('/api/rate-limit-status'), () =>
          HttpResponse.json({
            daily_usage: 0,
            user_type: 'anonymous',
          })
        )
      )

      const result = await compareService.getRateLimitStatus()

      expect(result.user_type).toBe('anonymous')
      expect(result.daily_usage).toBe(0)
    })
  })
})
