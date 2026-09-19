import { describe, expect, it } from 'vitest'

import type { ModelInfo } from '@compareintel/core'

import {
  conversationModelIds,
  hydrateConversationResults,
  hydrateSelectedModelIds,
  isModelCatalogReady,
  resolveSelectedModelsForCatalog,
  sameModelIds,
  synthesizeResultsFromHistory,
} from '../resolveSelectedModels'

const catalog: Record<string, ModelInfo[]> = {
  OpenAI: [
    { id: 'openai/gpt-free', name: 'GPT Free', provider: 'OpenAI', tier_access: 'unregistered' },
    { id: 'openai/gpt-paid', name: 'GPT Paid', provider: 'OpenAI', tier_access: 'paid' },
  ],
}

describe('isModelCatalogReady', () => {
  it('is false for an empty catalog', () => {
    expect(isModelCatalogReady({})).toBe(false)
    expect(isModelCatalogReady({ OpenAI: [] })).toBe(false)
  })

  it('is true once any provider has models', () => {
    expect(isModelCatalogReady(catalog)).toBe(true)
  })
})

describe('resolveSelectedModelsForCatalog', () => {
  it('does not wipe a restored selection before the catalog loads', () => {
    expect(
      resolveSelectedModelsForCatalog({
        selectedModels: ['openai/gpt-free'],
        fallbackModelIds: [],
        modelsByProvider: {},
        isAuthenticated: false,
        user: null,
      })
    ).toEqual(['openai/gpt-free'])
  })

  it('recovers model IDs from results when selection is empty', () => {
    expect(
      resolveSelectedModelsForCatalog({
        selectedModels: [],
        fallbackModelIds: ['openai/gpt-free', 'openai/gpt-paid'],
        modelsByProvider: {},
        isAuthenticated: false,
        user: null,
      })
    ).toEqual(['openai/gpt-free', 'openai/gpt-paid'])
  })

  it('prunes restricted models after the catalog loads', () => {
    expect(
      resolveSelectedModelsForCatalog({
        selectedModels: ['openai/gpt-free', 'openai/gpt-paid'],
        fallbackModelIds: [],
        modelsByProvider: catalog,
        isAuthenticated: false,
        user: null,
      })
    ).toEqual(['openai/gpt-free'])
  })

  it('recovers selectable result models after the catalog loads', () => {
    expect(
      resolveSelectedModelsForCatalog({
        selectedModels: [],
        fallbackModelIds: ['openai/gpt-free', 'openai/gpt-paid'],
        modelsByProvider: catalog,
        isAuthenticated: false,
        user: null,
      })
    ).toEqual(['openai/gpt-free'])
  })
})

describe('conversationModelIds', () => {
  it('prefers the saved selection, then results, then history', () => {
    expect(
      conversationModelIds({
        selectedModels: ['openai/gpt-free'],
        results: [{ modelId: 'openai/gpt-paid' }, { modelId: 'openai/gpt-free' }],
        conversationHistory: [
          { role: 'user' },
          { role: 'assistant', model_id: 'google/gemini' },
        ],
      })
    ).toEqual(['openai/gpt-free', 'openai/gpt-paid', 'google/gemini'])
  })

  it('recovers models from a previous chat when selection was wiped', () => {
    expect(
      conversationModelIds({
        selectedModels: [],
        results: [{ modelId: 'openai/gpt-free' }],
        conversationHistory: [{ role: 'assistant', model_id: 'openai/gpt-paid' }],
      })
    ).toEqual(['openai/gpt-free', 'openai/gpt-paid'])
  })
})

describe('hydrateSelectedModelIds', () => {
  it('keeps a closed-model selection instead of bringing result cards back', () => {
    expect(
      hydrateSelectedModelIds({
        selectedModels: ['openai/gpt-free'],
        results: [{ modelId: 'openai/gpt-free' }, { modelId: 'openai/gpt-paid' }],
        conversationHistory: [{ role: 'assistant', model_id: 'openai/gpt-paid' }],
      })
    ).toEqual(['openai/gpt-free'])
  })

  it('recovers from results when the saved selection is empty', () => {
    expect(
      hydrateSelectedModelIds({
        selectedModels: [],
        results: [{ modelId: 'openai/gpt-free' }],
      })
    ).toEqual(['openai/gpt-free'])
  })
})

describe('hydrateConversationResults', () => {
  it('keeps saved result cards when present', () => {
    const results = [
      {
        modelId: 'openai/gpt-free',
        modelName: 'GPT Free',
        content: 'Hello',
        isStreaming: false,
        error: null,
        isComplete: true,
      },
    ]
    expect(hydrateConversationResults(results, [])).toEqual(results)
  })

  it('rebuilds cards from history when results were not saved', () => {
    expect(
      synthesizeResultsFromHistory([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'First', model_id: 'openai/gpt-free' },
        { role: 'assistant', content: 'Latest', model_id: 'openai/gpt-free' },
      ])
    ).toEqual([
      {
        modelId: 'openai/gpt-free',
        modelName: 'gpt-free',
        content: 'Latest',
        isStreaming: false,
        error: null,
        isComplete: true,
      },
    ])
  })
})

describe('sameModelIds', () => {
  it('compares lists in order', () => {
    expect(sameModelIds(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameModelIds(['a', 'b'], ['b', 'a'])).toBe(false)
  })
})
