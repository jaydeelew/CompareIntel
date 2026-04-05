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
  it('uses API is_thinking_model when present (overrides heuristics)', () => {
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
        description: 'Would match heuristic.',
        is_thinking_model: false,
      })
    ).toBe(false)
  })

  it('matches OpenRouter-style thinking slugs and :thinking suffix', () => {
    expect(
      isThinkingModel({
        ...base,
        id: 'qwen/qwen3-max-thinking',
        name: 'Qwen3 Max Thinking',
      })
    ).toBe(true)
    expect(
      isThinkingModel({
        ...base,
        id: 'qwen/qwen-plus-2025-07-28:thinking',
        name: 'Qwen Plus (thinking)',
      })
    ).toBe(true)
  })

  it('matches the word thinking in display name', () => {
    expect(
      isThinkingModel({
        ...base,
        id: 'x/y',
        name: 'Some Thinking Variant',
      })
    ).toBe(true)
    expect(
      isThinkingModel({
        ...base,
        id: 'x/y',
        name: 'Something',
      })
    ).toBe(false)
  })

  it('matches registry Reasoning category segment', () => {
    expect(
      isThinkingModel({
        ...base,
        id: 'anthropic/claude-3.7-sonnet',
        name: 'Claude Sonnet 3.7',
        category: 'Language/Reasoning',
        description: 'Hybrid capabilities.',
      })
    ).toBe(true)
  })

  it('matches OpenAI o-series ids', () => {
    expect(
      isThinkingModel({
        ...base,
        id: 'openai/o3-mini',
        name: 'OpenAI: o3-mini',
        category: 'Reasoning',
      })
    ).toBe(true)
  })

  it('matches selected description phrases for models without Reasoning category', () => {
    expect(
      isThinkingModel({
        ...base,
        id: 'google/gemini-3-flash-preview',
        name: 'Gemini 3 Flash Preview',
        category: 'Language',
        description:
          'Gemini 3 Flash Preview is a high speed, high value thinking model designed for agentic workflows.',
      })
    ).toBe(true)
    expect(
      isThinkingModel({
        ...base,
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        category: 'Language',
        description:
          "Google's fast, cost-efficient model with built-in thinking capabilities for reasoning, coding, and math tasks.",
      })
    ).toBe(true)
  })
})
