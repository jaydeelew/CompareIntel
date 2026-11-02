import { describe, expect, it } from 'vitest'

import { HELP_ME_CHOOSE_CATEGORIES } from '../../data/helpMeChooseRecommendations'
import { mapPromptToHelpMeChooseCategory } from '../verdictCategory'

describe('mapPromptToHelpMeChooseCategory', () => {
  it('maps coding keywords to the coding category', () => {
    const match = mapPromptToHelpMeChooseCategory('Please debug this Python function')
    expect(match.categoryId).toBe('coding')
    expect(match.category?.label).toBe(
      HELP_ME_CHOOSE_CATEGORIES.find(category => category.id === 'coding')?.label
    )
  })

  it('maps math keywords to the math category', () => {
    expect(mapPromptToHelpMeChooseCategory('Solve this algebra equation').categoryId).toBe('math')
  })

  it('maps legal and medical prompts to those categories', () => {
    expect(mapPromptToHelpMeChooseCategory('Review this contract clause').categoryId).toBe('legal')
    expect(
      mapPromptToHelpMeChooseCategory('What is a typical clinical diagnosis?').categoryId
    ).toBe('medical')
  })

  it('prefers image generation phrases over generic image words', () => {
    expect(mapPromptToHelpMeChooseCategory('Generate an image of a red fox').categoryId).toBe(
      'image-generation'
    )
  })

  it('maps vision-style prompts to the images category', () => {
    expect(mapPromptToHelpMeChooseCategory('Explain this screenshot and diagram').categoryId).toBe(
      'images'
    )
  })

  it('returns a generic fallback when no keywords match', () => {
    expect(mapPromptToHelpMeChooseCategory('hello there')).toEqual({
      categoryId: null,
      category: null,
    })
    expect(mapPromptToHelpMeChooseCategory('   ')).toEqual({ categoryId: null, category: null })
  })

  it('does not treat encode as a coding hit', () => {
    expect(mapPromptToHelpMeChooseCategory('Please encode this message').categoryId).toBeNull()
  })
})
