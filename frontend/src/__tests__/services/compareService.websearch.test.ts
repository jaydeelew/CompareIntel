/**
 * Tests for web search functionality in compareService (MSW).
 */

import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { compareStream, processStreamEvents } from '../../services/compareService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'

const encoder = new TextEncoder()

function webSearchStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          'data: {"type":"chunk","model":"openai/gpt-4","content":"{\\"type\\":\\"tool_call\\",\\"function\\":{\\"name\\":\\"search_web\\",\\"arguments\\":\\"{\\\\\\"query\\\\\\":\\\\\\"current weather\\\\\\"}\\"}}"}\n\n'
        )
      )
      controller.enqueue(
        new TextEncoder().encode(
          'data: {"type":"chunk","model":"openai/gpt-4","content":"{\\"type\\":\\"tool_result\\",\\"content\\":\\"Search results: Sunny, 75°F\\"}"}\n\n'
        )
      )
      controller.enqueue(
        new TextEncoder().encode(
          'data: {"type":"chunk","model":"openai/gpt-4","content":"Based on the search results"}\n\n'
        )
      )
      controller.enqueue(
        new TextEncoder().encode('data: {"type":"done","model":"openai/gpt-4"}\n\n')
      )
      controller.enqueue(new TextEncoder().encode('data: {"type":"complete"}\n\n'))
      controller.close()
    },
  })
}

describe('compareService - Web Search', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('compareStream with web search', () => {
    it('should include enable_web_search in request payload', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.enable_web_search).toBe(true)

          const stream = new ReadableStream({
            start(c) {
              c.enqueue(encoder.encode('data: {"type":"complete"}\n\n'))
              c.close()
            },
          })
          return new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      await compareStream({
        input_data: 'What is the current weather?',
        models: ['openai/gpt-4'],
        enable_web_search: true,
      })
    })

    it('should not include enable_web_search when false', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>

          expect(body.enable_web_search).toBe(false)

          const stream = new ReadableStream({
            start(c) {
              c.enqueue(encoder.encode('data: {"type":"complete"}\n\n'))
              c.close()
            },
          })
          return new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      await compareStream({
        input_data: 'What is AI?',
        models: ['openai/gpt-4'],
        enable_web_search: false,
      })
    })

    it('should handle web search tool calls in stream', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body.enable_web_search).toBe(true)

          return new HttpResponse(webSearchStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      const stream = await compareStream({
        input_data: 'What is the current weather?',
        models: ['openai/gpt-4'],
        enable_web_search: true,
      })

      expect(stream).not.toBeNull()

      const chunks: string[] = []
      await processStreamEvents(stream!, {
        onChunk: (_model, content) => {
          chunks.push(content)
        },
      })

      expect(chunks.length).toBeGreaterThan(0)
    })
  })

  describe('web search error handling', () => {
    it('should handle web search provider unavailable', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          await request.json()
          const stream = new ReadableStream({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"error","message":"Web search provider not configured"}\n\n'
                )
              )
              c.close()
            },
          })

          return new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      const stream = await compareStream({
        input_data: 'What is the weather?',
        models: ['openai/gpt-4'],
        enable_web_search: true,
      })

      const errors: string[] = []
      await processStreamEvents(stream!, {
        onError: err => {
          errors.push(err.message)
        },
      })

      expect(errors.length).toBeGreaterThan(0)
    })

    it('should handle web search API errors gracefully', async () => {
      server.use(
        http.post(apiPathGlob('/api/compare-stream'), async ({ request }) => {
          await request.json()
          const stream = new ReadableStream({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"chunk","model":"openai/gpt-4","content":"{\\"type\\":\\"tool_call\\",\\"function\\":{\\"name\\":\\"search_web\\"}}"}\n\n'
                )
              )
              c.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"error","message":"Search failed: Rate limit exceeded"}\n\n'
                )
              )
              c.close()
            },
          })

          return new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        })
      )

      const stream = await compareStream({
        input_data: 'Test query',
        models: ['openai/gpt-4'],
        enable_web_search: true,
      })

      const errors: string[] = []
      await processStreamEvents(stream!, {
        onError: err => {
          errors.push(err.message)
        },
      })

      expect(errors.length).toBeGreaterThan(0)
    })
  })
})
