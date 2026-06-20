import { describe, expect, it } from 'vitest'

import { getEventModelId, type StreamEvent } from '../services'

describe('getEventModelId', () => {
  it('reads model field from backend SSE events', () => {
    const event: StreamEvent = { type: 'chunk', model: 'openai/gpt-4o', content: 'hi' }
    expect(getEventModelId(event)).toBe('openai/gpt-4o')
  })

  it('falls back to model_id', () => {
    const event: StreamEvent = { type: 'chunk', model_id: 'anthropic/claude-3' }
    expect(getEventModelId(event)).toBe('anthropic/claude-3')
  })
})
