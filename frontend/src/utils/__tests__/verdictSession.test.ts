import { describe, expect, it } from 'vitest'

import { createMockConversationMessage, createMockModelConversation } from '../../__tests__/utils'
import { createModelId } from '../../types'
import type { ModelConversation } from '../../types/conversation'
import { ratingSourceAndDate } from '../verdictPopularRating'
import {
  comparisonFinishedForVerdict,
  isSuccessfulVerdictModel,
  successfulVerdictModelIds,
  toggleFavorite,
  verdictControlsVisible,
  verdictTurnKey,
} from '../verdictSession'

function conversation(
  modelId: string,
  assistant: string,
  user = 'Write a Python function'
): ModelConversation {
  const id = createModelId(modelId)
  return createMockModelConversation({
    modelId: id,
    messages: [
      createMockConversationMessage({
        id: createModelId(`${modelId}-user`) as ModelConversation['messages'][number]['id'],
        type: 'user',
        content: user,
      }),
      createMockConversationMessage({ type: 'assistant', content: assistant }),
    ],
  })
}

describe('verdictSession', () => {
  it('toggles a single favorite and clears it on a second click', () => {
    expect(toggleFavorite(null, 'a')).toBe('a')
    expect(toggleFavorite('a', 'b')).toBe('b')
    expect(toggleFavorite('b', 'b')).toBeNull()
  })

  it('counts only successful replies and requires two before the controls show', () => {
    const okA = conversation('openai/a', 'Answer A')
    const okB = conversation('openai/b', 'Answer B')
    const failed = conversation('openai/c', 'Error: Model not available')
    const empty = conversation('openai/d', '   ')
    const errorState = { [failed.modelId]: true }

    expect(isSuccessfulVerdictModel(okA)).toBe(true)
    expect(isSuccessfulVerdictModel(failed, errorState)).toBe(false)
    expect(isSuccessfulVerdictModel(empty)).toBe(false)
    expect(successfulVerdictModelIds([okA, failed, empty], errorState)).toEqual([okA.modelId])
    expect(
      verdictControlsVisible({
        enabled: true,
        tutorialActive: false,
        finished: true,
        successCount: 1,
      })
    ).toBe(false)
    expect(
      verdictControlsVisible({
        enabled: true,
        tutorialActive: false,
        finished: true,
        successCount: 2,
      })
    ).toBe(true)
    expect(
      verdictControlsVisible({
        enabled: true,
        tutorialActive: true,
        finished: true,
        successCount: 2,
      })
    ).toBe(false)
    expect(
      verdictControlsVisible({
        enabled: false,
        tutorialActive: false,
        finished: true,
        successCount: 2,
      })
    ).toBe(false)
    expect(comparisonFinishedForVerdict([okA, okB], { [okA.modelId]: true }, false)).toBe(false)
    expect(comparisonFinishedForVerdict([okA, okB], {}, true)).toBe(false)
    expect(comparisonFinishedForVerdict([okA, okB], {}, false)).toBe(true)
  })

  it('changes the turn key when a follow-up user message arrives', () => {
    const first = conversation('openai/a', 'Answer')
    const followUp: ModelConversation = {
      ...first,
      messages: [
        ...first.messages,
        createMockConversationMessage({ type: 'user', content: 'And now?' }),
      ],
    }
    expect(verdictTurnKey([first])).not.toBe(verdictTurnKey([followUp]))
  })
})

describe('ratingSourceAndDate', () => {
  it('keeps the source and fetched date and drops vote counts', () => {
    const { source, asOf } = ratingSourceAndDate(
      'Code Arena (LMArena webdev overall, arena.ai): Arena Score 1822 (published 2026-11-23, 2159 votes). Fetched 2026-11-27.'
    )
    expect(asOf).toBe('2026-11-27')
    expect(source).toMatch(/Code Arena/)
    expect(source).not.toMatch(/votes/i)
    expect(source).not.toMatch(/Fetched/)
  })
})
