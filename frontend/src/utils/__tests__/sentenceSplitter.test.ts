import { describe, expect, it } from 'vitest'

import { nextSpeakableSentences, splitCompleteSentences } from '../sentenceSplitter'

describe('splitCompleteSentences', () => {
  it('keeps an incomplete sentence in rest', () => {
    const { complete, rest } = splitCompleteSentences('Hello there. And then')
    expect(complete).toEqual(['Hello there.'])
    expect(rest).toBe('And then')
  })

  it('returns multiple completed sentences', () => {
    const { complete, rest } = splitCompleteSentences('One. Two! Three? leftover')
    expect(complete).toEqual(['One.', 'Two!', 'Three?'])
    expect(rest).toBe('leftover')
  })
})

describe('nextSpeakableSentences', () => {
  it('only emits new sentences after the spoken prefix', () => {
    const first = nextSpeakableSentences('Hello there. More', '', false)
    expect(first.sentences).toEqual(['Hello there.'])
    const second = nextSpeakableSentences('Hello there. More text now.', first.spokenPrefix, false)
    expect(second.sentences).toEqual(['More text now.'])
  })

  it('flushes the remainder when the model is done', () => {
    const result = nextSpeakableSentences('No terminator yet', '', true)
    expect(result.sentences).toEqual(['No terminator yet'])
    expect(result.spokenPrefix).toBe('No terminator yet')
  })
})
