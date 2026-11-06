import { describe, expect, it } from 'vitest'

import { createModelId } from '../../types'
import {
  formatListPricePerMillion,
  listPriceHint,
  lookupListPricePerMillion,
} from '../verdictListPrice'

describe('verdictListPrice', () => {
  it('reads OpenRouter list price from Help Me Choose Best value evidence', () => {
    expect(lookupListPricePerMillion(createModelId('openai/gpt-4o-mini'))).toBe(0.38)
    expect(formatListPricePerMillion(0.38)).toBe('$0.38/1M')
    expect(listPriceHint(0.38)).toMatch(/List price: \$0\.38\/1M tokens/)
  })

  it('returns null when the model has no loaded list price', () => {
    expect(lookupListPricePerMillion(createModelId('openai/gpt-5'))).toBeNull()
    expect(lookupListPricePerMillion('not-a-real-model')).toBeNull()
  })
})
