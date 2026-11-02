import { describe, expect, it } from 'vitest'

import {
  AGREEMENT_LABEL,
  computeAgreement,
  extractFinalAnswer,
  jaccardSimilarity,
  normalizeVerdictText,
  tokenizeVerdictText,
} from '../verdictAgreement'

describe('verdictAgreement heuristic', () => {
  it('normalizes markdown and punctuation before tokenizing', () => {
    expect(normalizeVerdictText('**Hello,** `World`!')).toBe('hello world')
    expect(tokenizeVerdictText('The cat sat.')).toEqual(['the', 'cat', 'sat'])
  })

  it('computes jaccard overlap on token sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1)
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0)
    expect(jaccardSimilarity(['paris', 'france'], ['paris', 'france', 'city'])).toBe(2 / 3)
  })

  it('extracts labeled and short numeric final answers', () => {
    expect(extractFinalAnswer('Working...\nFinal answer: 42')).toBe('42')
    expect(extractFinalAnswer('The answer is: yes')).toBe('yes')
    expect(extractFinalAnswer('42')).toBe('42')
    expect(extractFinalAnswer('This is a long essay without a boxed result.')).toBeNull()
  })

  it('labels Agree when extracted short answers match', () => {
    const result = computeAgreement([
      'I think it is 42.\nFinal answer: 42',
      'After checking, the answer is 42',
    ])
    expect(result.label).toBe(AGREEMENT_LABEL.AGREE)
    expect(result.answersMatch).toBe(true)
  })

  it('labels Conflict when extracted short answers differ', () => {
    const result = computeAgreement(['Final answer: 41', 'Final answer: 42'])
    expect(result.label).toBe(AGREEMENT_LABEL.CONFLICT)
    expect(result.answersMatch).toBe(false)
  })

  it('labels Agree for highly overlapping prose', () => {
    const result = computeAgreement([
      'Paris is the capital of France and a major European city.',
      'Paris is the capital of France and a major European city on the Seine.',
    ])
    expect(result.label).toBe(AGREEMENT_LABEL.AGREE)
    expect(result.answersMatch).toBeNull()
  })

  it('labels Partly agree for moderate overlap', () => {
    const result = computeAgreement([
      'Use binary search on the sorted array to find the target quickly.',
      'Search the sorted array from the middle to find the target value.',
    ])
    expect(result.label).toBe(AGREEMENT_LABEL.PARTLY)
  })

  it('labels Conflict for dissimilar replies without extractable answers', () => {
    const result = computeAgreement([
      'Use a hash map to count frequencies in linear time.',
      'Bake the cake at 350 degrees until the center is set.',
    ])
    expect(result.label).toBe(AGREEMENT_LABEL.CONFLICT)
  })

  it('returns a null label when fewer than two replies exist', () => {
    expect(computeAgreement(['only one'])).toEqual({
      label: null,
      similarity: null,
      answersMatch: null,
    })
    expect(computeAgreement(['', '   ']).label).toBeNull()
  })
})
