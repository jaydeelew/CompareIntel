import { describe, expect, it } from 'vitest'

import { getPerModelContextMessageCount } from '../contextMessageCount'

describe('getPerModelContextMessageCount', () => {
  it('returns 0 for empty history', () => {
    expect(getPerModelContextMessageCount([])).toBe(0)
  })

  it('counts one user and one assistant message for a single model', () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi', model_id: 'openai/gpt-4' },
    ]

    expect(getPerModelContextMessageCount(history, ['openai/gpt-4'])).toBe(2)
  })

  it('does not count other models assistant replies as shared context', () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi from A', model_id: 'openai/gpt-4' },
      { role: 'assistant', content: 'Hi from B', model_id: 'anthropic/claude-3' },
    ]

    expect(
      getPerModelContextMessageCount(history, ['openai/gpt-4', 'anthropic/claude-3'])
    ).toBe(2)
  })

  it('counts multiple follow-up turns per model', () => {
    const history = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'A1', model_id: 'openai/gpt-4' },
      { role: 'assistant', content: 'B1', model_id: 'anthropic/claude-3' },
      { role: 'user', content: 'Second' },
      { role: 'assistant', content: 'A2', model_id: 'openai/gpt-4' },
      { role: 'assistant', content: 'B2', model_id: 'anthropic/claude-3' },
    ]

    expect(
      getPerModelContextMessageCount(history, ['openai/gpt-4', 'anthropic/claude-3'])
    ).toBe(4)
  })
})
