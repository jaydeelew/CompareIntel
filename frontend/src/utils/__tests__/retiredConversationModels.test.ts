import { describe, expect, it } from 'vitest'

import type { ModelsByProvider } from '../../types'
import {
  followUpModelIds,
  humanizeModelId,
  modelDisplayLabel,
  partitionConversationModels,
  retiredFollowUpNotice,
  storedModelDisplayName,
} from '../retiredConversationModels'

const LIVE = 'openai/gpt-4o-mini'
const LIVE_NAME = 'GPT-4o mini'
const OTHER = 'anthropic/claude-haiku-4.5'
const REMOVED = 'mistralai/mistral-medium-3.1'
const REMOVED_TWO = 'retired/other-model'

const catalog = {
  OpenAI: [
    {
      id: LIVE,
      name: LIVE_NAME,
      description: '',
      category: 'Language',
      provider: 'OpenAI',
    },
  ],
  Anthropic: [
    {
      id: OTHER,
      name: 'Claude Haiku 4.5',
      description: '',
      category: 'Language',
      provider: 'Anthropic',
    },
  ],
} as ModelsByProvider

describe('partitionConversationModels', () => {
  it('keeps every id when none were removed', () => {
    const partition = partitionConversationModels([LIVE, OTHER], catalog)
    expect(partition.catalogReady).toBe(true)
    expect(partition.available).toEqual([LIVE, OTHER])
    expect(partition.removed).toEqual([])
    expect(followUpModelIds([LIVE, OTHER], catalog)).toEqual([LIVE, OTHER])
  })

  it('drops removed models and keeps the ones still in the lineup', () => {
    const partition = partitionConversationModels([REMOVED, LIVE, REMOVED], catalog)
    expect(partition.available).toEqual([LIVE])
    expect(partition.removed).toEqual([REMOVED])
    expect(followUpModelIds([REMOVED, LIVE], catalog)).toEqual([LIVE])
  })

  it('reports every model removed when none remain in the lineup', () => {
    const partition = partitionConversationModels([REMOVED, REMOVED_TWO], catalog)
    expect(partition.available).toEqual([])
    expect(partition.removed).toEqual([REMOVED, REMOVED_TWO])
    expect(followUpModelIds([REMOVED], catalog)).toEqual([])
  })

  it('does not treat an empty catalog as a removal', () => {
    const partition = partitionConversationModels([REMOVED, LIVE], {})
    expect(partition.catalogReady).toBe(false)
    expect(partition.available).toEqual([REMOVED, LIVE])
    expect(partition.removed).toEqual([])
  })
})

describe('modelDisplayLabel', () => {
  it('uses the catalog display name when the model is known', () => {
    expect(modelDisplayLabel(LIVE, catalog.OpenAI)).toBe(LIVE_NAME)
  })

  it('humanizes a removed id, keeping the version number', () => {
    expect(humanizeModelId(REMOVED)).toBe('Mistral Medium 3.1')
    expect(modelDisplayLabel(REMOVED, catalog.OpenAI)).toBe('Mistral Medium 3.1')
    expect(modelDisplayLabel('retired/other-model', catalog.OpenAI)).toBe('Other Model')
  })

  it('prefers a display name stored with the conversation or a message', () => {
    expect(modelDisplayLabel(REMOVED, catalog.OpenAI, 'Mistral Medium')).toBe('Mistral Medium')
    expect(
      storedModelDisplayName(REMOVED, {
        model_names: { [REMOVED]: 'Saved Mistral' },
      })
    ).toBe('Saved Mistral')
    expect(
      storedModelDisplayName(REMOVED, {
        messages: [
          { model_id: LIVE, model_name: 'GPT-4o mini' },
          { model_id: REMOVED, model_name: 'From the message' },
        ],
      })
    ).toBe('From the message')
    expect(storedModelDisplayName(REMOVED, { model_names: { [REMOVED]: REMOVED } })).toBeNull()
  })

  it('keeps the raw id until the catalog has loaded', () => {
    expect(modelDisplayLabel(REMOVED, null)).toBe(REMOVED)
    expect(modelDisplayLabel(REMOVED, [])).toBe(REMOVED)
  })
})

describe('retiredFollowUpNotice', () => {
  it('names one removed model and keeps follow-ups on the rest', () => {
    expect(retiredFollowUpNotice(['Mistral Medium 3.1'], 1)).toBe(
      'Mistral Medium 3.1 is no longer available, so follow-ups will go to the remaining models.'
    )
  })

  it('uses the id when that is the only label we have', () => {
    expect(retiredFollowUpNotice([REMOVED], 2)).toBe(
      `${REMOVED} is no longer available, so follow-ups will go to the remaining models.`
    )
  })

  it('tells the user to start a new comparison when nothing remains', () => {
    expect(retiredFollowUpNotice(['Mistral Medium 3.1'], 0)).toBe(
      'Mistral Medium 3.1 is no longer available. Start a new comparison to continue.'
    )
    expect(retiredFollowUpNotice(['Alpha', 'Beta'], 0)).toBe(
      'Alpha and Beta are no longer available. Start a new comparison to continue.'
    )
  })

  it('returns null when nothing was removed', () => {
    expect(retiredFollowUpNotice([], 2)).toBeNull()
  })
})
