import { describe, expect, it } from 'vitest'

import type { Model } from '../../../types'
import { modelForSelectedRail } from '../selectedModelLookup'

function model(id: string, name: string): Model {
  return {
    id,
    name,
    description: '',
    category: 'test',
    provider: 'Test',
    available: true,
    tier_access: 'unregistered',
  }
}

describe('modelForSelectedRail', () => {
  const earlier = model('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5')
  const current = model('openai/gpt-5.2', 'GPT-5.2')

  it('names a selection the tutorial hid from the visible provider list', () => {
    expect(modelForSelectedRail(earlier.id, [current], [earlier, current])?.name).toBe(
      'Claude Sonnet 5.5'
    )
  })

  it('uses the visible list when no catalog is passed', () => {
    expect(modelForSelectedRail(current.id, [current])?.name).toBe('GPT-5.2')
  })

  it('returns nothing when the id is in neither list', () => {
    expect(modelForSelectedRail('missing', [current], [earlier, current])).toBeUndefined()
  })
})
