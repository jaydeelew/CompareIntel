import { describe, expect, it } from 'vitest'

import type { ModelInfo } from '../../api/services'
import {
  isTimeSensitiveQuery,
  parseKnowledgeCutoff,
  shouldAutoEnableWebSearch,
} from '../autoEnable'

const gpt4: ModelInfo = {
  id: 'openai/gpt-4o',
  name: 'GPT-4o',
  provider: 'OpenAI',
  supports_web_search: true,
  knowledge_cutoff: 'October 2023',
}

const claude: ModelInfo = {
  id: 'anthropic/claude-3.5-sonnet',
  name: 'Claude 3.5 Sonnet',
  provider: 'Anthropic',
  supports_web_search: false,
  knowledge_cutoff: 'April 2024',
}

const modelsByProvider = {
  OpenAI: [gpt4],
  Anthropic: [claude],
}

describe('parseKnowledgeCutoff', () => {
  it('parses month-year cutoffs', () => {
    expect(parseKnowledgeCutoff('October 2023')?.getFullYear()).toBe(2023)
  })

  it('parses ISO cutoffs', () => {
    expect(parseKnowledgeCutoff('2025-01-31')?.toISOString().slice(0, 10)).toBe('2025-01-31')
  })
})

describe('shouldAutoEnableWebSearch', () => {
  it('returns false when no selected model supports web search', () => {
    expect(
      shouldAutoEnableWebSearch(
        'What is the weather today?',
        [claude.id],
        modelsByProvider
      )
    ).toBe(false)
  })

  it('returns false for general knowledge questions', () => {
    expect(
      shouldAutoEnableWebSearch('Explain photosynthesis.', [gpt4.id], modelsByProvider)
    ).toBe(false)
  })

  it('returns true for time-sensitive questions when web search is available', () => {
    expect(
      shouldAutoEnableWebSearch(
        'What is the weather today in Austin?',
        [gpt4.id],
        modelsByProvider
      )
    ).toBe(true)
    expect(isTimeSensitiveQuery('What is the weather today in Austin?')).toBe(true)
  })

  it('returns true when prompt references a date after the model cutoff', () => {
    expect(
      shouldAutoEnableWebSearch(
        'Summarize the March 2026 product launch.',
        [gpt4.id],
        modelsByProvider
      )
    ).toBe(true)
  })

  it('returns false when prompt references a date before the model cutoff', () => {
    expect(
      shouldAutoEnableWebSearch(
        'What happened in March 2022?',
        [gpt4.id],
        modelsByProvider
      )
    ).toBe(false)
  })
})
