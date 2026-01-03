/**
 * Tests for web search functionality in compareService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { compareStream, processStreamEvents } from '../../services/compareService'

describe('compareService - Web Search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('compareStream with web search', () => {
    it('should include enable_web_search in request payload', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"complete"}\n\n'))
          controller.close()
        },
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      })

      await compareStream({
        input_data: 'What is the current weather?',
        models: ['openai/gpt-4'],
        enable_web_search: true,
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/compare-stream'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"enable_web_search":true'),
        })
      )
    })

    it('should not include enable_web_search when false', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"complete"}\n\n'))
          controller.close()
        },
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      })

      await compareStream({
        input_data: 'What is AI?',
        models: ['openai/gpt-4'],
        enable_web_search: false,
      })

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.enable_web_search).toBe(false)
    })

    it('should handle web search tool calls in stream', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          // Simulate tool call for web search
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"type":"chunk","model":"openai/gpt-4","content":"{\\"type\\":\\"tool_call\\",\\"function\\":{\\"name\\":\\"search_web\\",\\"arguments\\":\\"{\\\\\\"query\\\\\\":\\\\\\"current weather\\\\\\"}\\"}}"}\n\n'
            )
          )
          // Simulate tool result
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"type":"chunk","model":"openai/gpt-4","content":"{\\"type\\":\\"tool_result\\",\\"content\\":\\"Search results: Sunny, 75°F"}"}\n\n'
            )
          )
          // Simulate final response
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

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      })

      const stream = await compareStream({
        input_data: 'What is the current weather?',
        models: ['openai/gpt-4'],
        enable_web_search: true,
      })

      expect(stream).not.toBeNull()

      const chunks: string[] = []
      await processStreamEvents(stream!, {
        onChunk: (model, content) => {
          chunks.push(content)
        },
      })

      // Should have received tool call and response chunks
      expect(chunks.length).toBeGreaterThan(0)
    })
  })

  describe('web search error handling', () => {
    it('should handle web search provider unavailable', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"type":"error","message":"Web search provider not configured"}\n\n'
            )
          )
          controller.close()
        },
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      })

      const stream = await compareStream({
        input_data: 'What is the weather?',
        models: ['openai/gpt-4'],
        enable_web_search: true,
      })

      const errors: string[] = []
      await processStreamEvents(stream!, {
        onError: message => {
          errors.push(message)
        },
      })

      expect(errors.length).toBeGreaterThan(0)
    })

    it('should handle web search API errors gracefully', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          // Tool call
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"type":"chunk","model":"openai/gpt-4","content":"{\\"type\\":\\"tool_call\\",\\"function\\":{\\"name\\":\\"search_web\\"}}"}\n\n'
            )
          )
          // Error in tool execution
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"type":"error","message":"Search failed: Rate limit exceeded"}\n\n'
            )
          )
          controller.close()
        },
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      })

      const stream = await compareStream({
        input_data: 'Test query',
        models: ['openai/gpt-4'],
        enable_web_search: true,
      })

      const errors: string[] = []
      await processStreamEvents(stream!, {
        onError: message => {
          errors.push(message)
        },
      })

      expect(errors.length).toBeGreaterThan(0)
    })
  })
})
