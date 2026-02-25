/**
 * Tests for temperature functionality in compareService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { compareStream } from '../../services/compareService'

describe('compareService - Temperature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('compareStream with temperature', () => {
    it('should include temperature in request payload', async () => {
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
        input_data: 'Explain quantum computing',
        models: ['openai/gpt-4'],
        temperature: 0.7,
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/compare-stream'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"temperature":0.7'),
        })
      )
    })

    it('should include temperature 0 correctly (not omit falsy value)', async () => {
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
        input_data: 'Test',
        models: ['openai/gpt-4'],
        temperature: 0,
      })

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.temperature).toBe(0)
    })

    it('should include temperature 2.0 correctly', async () => {
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
        input_data: 'Test',
        models: ['openai/gpt-4'],
        temperature: 2.0,
      })

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.temperature).toBe(2.0)
    })

    it('should not include temperature when undefined', async () => {
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
        input_data: 'Test',
        models: ['openai/gpt-4'],
      })

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.temperature).toBeUndefined()
    })

    it('should include temperature alongside web search', async () => {
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
        input_data: 'What is the weather?',
        models: ['openai/gpt-4'],
        enable_web_search: true,
        temperature: 0.3,
      })

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.temperature).toBe(0.3)
      expect(body.enable_web_search).toBe(true)
    })
  })
})
