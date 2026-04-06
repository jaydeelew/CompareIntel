/**
 * Unit tests for thinking-model detection (model picker icon).
 */

import { describe, it, expect } from 'vitest'

import { isThinkingModel } from '../thinkingModels'

const base = {
  id: 'acme/foo' as const,
  name: 'Foo',
  category: 'Language',
  description: 'A general model.',
}

describe('isThinkingModel', () => {
  it('is true only when API sets is_thinking_model to true', () => {
    expect(
      isThinkingModel({
        ...base,
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        category: 'Language',
        description: 'No magic phrases.',
        is_thinking_model: true,
      })
    ).toBe(true)
    expect(
      isThinkingModel({
        ...base,
        id: 'anthropic/claude-3.7-sonnet',
        name: 'Claude Sonnet 3.7',
        category: 'Language/Reasoning',
        description: 'Would have matched old heuristics.',
        is_thinking_model: false,
      })
    ).toBe(false)
  })

  it('does not infer from id, name, category, or description when flag is absent or undefined', () => {
    expect(
      isThinkingModel({
        ...base,
        id: 'qwen/qwen3-max-thinking',
        name: 'Qwen3 Max Thinking',
      })
    ).toBe(false)
    expect(
      isThinkingModel({
        ...base,
        id: 'openai/o3-mini',
        name: 'OpenAI: o3-mini',
        category: 'Reasoning',
      })
    ).toBe(false)
    expect(
      isThinkingModel({
        ...base,
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        category: 'Language',
        description:
          "Google's fast model with built-in thinking capabilities for reasoning, coding, and math tasks.",
      })
    ).toBe(false)
  })
})
