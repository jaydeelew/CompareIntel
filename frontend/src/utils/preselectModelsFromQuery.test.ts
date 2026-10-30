import { describe, expect, it } from 'vitest'

import type { ModelsByProvider } from '../types'

import { filterKnownModelIds, parseModelsQueryParam } from './preselectModelsFromQuery'

const modelsByProvider = {
  Anthropic: [{ id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' }],
  OpenAI: [{ id: 'openai/gpt-5.5', name: 'GPT-5.5' }],
} as unknown as ModelsByProvider

describe('parseModelsQueryParam', () => {
  it('parses a single model id', () => {
    expect(parseModelsQueryParam('?models=anthropic%2Fclaude-opus-5')).toEqual([
      'anthropic/claude-opus-5',
    ])
  })

  it('parses a comma-separated list and ignores blanks', () => {
    expect(parseModelsQueryParam('models=openai/gpt-5.5, anthropic/claude-opus-5,')).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-5',
    ])
  })

  it('returns an empty list when the param is missing', () => {
    expect(parseModelsQueryParam('')).toEqual([])
    expect(parseModelsQueryParam('?foo=1')).toEqual([])
  })
})

describe('filterKnownModelIds', () => {
  it('keeps only ids present in the loaded catalog', () => {
    expect(
      filterKnownModelIds(
        ['anthropic/claude-opus-5', 'openai/missing', 'openai/gpt-5.5'],
        modelsByProvider
      )
    ).toEqual(['anthropic/claude-opus-5', 'openai/gpt-5.5'])
  })
})
