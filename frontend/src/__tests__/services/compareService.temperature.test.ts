/**
 * Tests for temperature functionality in compareService (MSW).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { compareStream } from '../../services/compareService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'

const encoder = new TextEncoder()

function completeEventOnlyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode('data: {"type":"complete"}\n\n'))
      c.close()
    },
  })
}

describe('compareService - Temperature', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('compareStream with temperature', () => {
    it('should include temperature in request payload', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.temperature).toBeCloseTo(0.7)

          return new HttpResponse(completeEventOnlyStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      await compareStream({
        input_data: 'Explain quantum computing',
        models: ['openai/gpt-4'],
        temperature: 0.7,
      })
    })

    it('should include temperature 0 correctly (not omit falsy value)', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.temperature).toBe(0)

          return new HttpResponse(completeEventOnlyStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      await compareStream({
        input_data: 'Test',
        models: ['openai/gpt-4'],
        temperature: 0,
      })
    })

    it('should include temperature 2.0 correctly', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.temperature).toBe(2.0)

          return new HttpResponse(completeEventOnlyStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      await compareStream({
        input_data: 'Test',
        models: ['openai/gpt-4'],
        temperature: 2.0,
      })
    })

    it('should not include temperature when undefined', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.temperature).toBeUndefined()

          return new HttpResponse(completeEventOnlyStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      await compareStream({
        input_data: 'Test',
        models: ['openai/gpt-4'],
      })
    })

    it('should include temperature alongside web search', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.temperature).toBeCloseTo(0.3)
          expect(body.enable_web_search).toBe(true)

          return new HttpResponse(completeEventOnlyStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      await compareStream({
        input_data: 'What is the weather?',
        models: ['openai/gpt-4'],
        enable_web_search: true,
        temperature: 0.3,
      })
    })
  })
})
