/**
 * Tests for Help Me Choose recommendations data
 *
 * Ensures benchmark-based ordering is correct: within each category, models
 * with comparable numeric scores must appear in descending order (best first).
 */

import { describe, it, expect } from 'vitest'

import { HELP_ME_CHOOSE_CATEGORIES } from '../helpMeChooseRecommendations'

/** Extract primary numeric score from evidence for ordering checks. Returns null if no comparable score. */
function extractPrimaryScore(categoryId: string, evidence: string): number | null {
  // Percentage (SWE-Bench, MMLU-Pro, etc.)
  const pctMatch = evidence.match(/(\d+\.?\d*)\s*%/)
  if (pctMatch) return parseFloat(pctMatch[1])

  // Mazur Writing Score (decimal, e.g. 8.561)
  if (categoryId === 'writing') {
    const mazurMatch = evidence.match(/Mazur[^:]*:\s*(\d+\.\d+)/i)
    if (mazurMatch) return parseFloat(mazurMatch[1])
    // Creative Writing Arena Elo (e.g. 1490 Elo or 1455–1461 Elo)
    const eloMatch = evidence.match(/(\d+)(?:\s*[–-]\s*\d+)?\s*Elo/i)
    if (eloMatch) return parseInt(eloMatch[1], 10)
  }

  // MRCR /100 (e.g. 93/100, 93.0/100, 76/100) - capture full number to avoid matching "0" from "93.0/100"
  const fracMatch = evidence.match(/(\d+\.?\d*)\s*\/\s*100\b/)
  if (fracMatch) return parseFloat(fracMatch[1])
  if (categoryId === 'long-context') {
    const mrcrMatch = evidence.match(/(?:llmdb|Michelangelo)[^:]*:\s*(\d+\.?\d*)/i)
    if (mrcrMatch) return parseFloat(mrcrMatch[1])
  }

  // Cost-effective: $X.XX/1M tokens
  if (categoryId === 'cost-effective') {
    const costMatch = evidence.match(/\$\s*(\d+\.?\d*)\s*\/\s*1\s*M/i)
    if (costMatch) return parseFloat(costMatch[1])
  }

  // Fast: XXX t/s (tokens per second)
  if (categoryId === 'fast') {
    const tpsMatch = evidence.match(/(\d+\.?\d*)\s*t\/s/i)
    if (tpsMatch) return parseFloat(tpsMatch[1])
  }

  return null
}

/** Returns true if two scores are on comparable scales (e.g. both Mazur or both Elo for writing). */
function isSameScale(categoryId: string, scoreA: number, scoreB: number): boolean {
  if (categoryId === 'writing') {
    // Mazur: 0–10 scale; Elo: 1000+ scale
    const aMazur = scoreA < 20
    const bMazur = scoreB < 20
    return aMazur === bMazur
  }
  return true
}

/** Categories where lower score is better (e.g. cost-effective: cheaper first). */
const ASCENDING_CATEGORIES = new Set(['cost-effective'])

/** Categories that are capability lists (e.g. supports image input) rather than benchmark-ranked. */
const CAPABILITY_CATEGORIES = new Set(['images'])

/** Returns true if the model has a numeric benchmark score (should be included). */
function hasBenchmarkScore(categoryId: string, evidence: string): boolean {
  return extractPrimaryScore(categoryId, evidence) !== null
}

describe('helpMeChooseRecommendations', () => {
  describe('benchmark ordering', () => {
    for (const cat of HELP_ME_CHOOSE_CATEGORIES) {
      it(`orders ${cat.id} by primary benchmark (best first)`, () => {
        const models = cat.models

        for (let i = 1; i < models.length; i++) {
          const prevScore = extractPrimaryScore(cat.id, models[i - 1].evidence)
          const currScore = extractPrimaryScore(cat.id, models[i].evidence)

          if (
            prevScore !== null &&
            currScore !== null &&
            isSameScale(cat.id, prevScore, currScore)
          ) {
            const ascending = ASCENDING_CATEGORIES.has(cat.id)
            const ok = ascending ? prevScore <= currScore : prevScore >= currScore
            const msg = ascending
              ? `${cat.id}: ${models[i - 1].modelId} (${prevScore}) should be <= ${models[i].modelId} (${currScore})`
              : `${cat.id}: ${models[i - 1].modelId} (${prevScore}) should be >= ${models[i].modelId} (${currScore})`
            expect(ok, msg).toBe(true)
          }
        }
      })
    }
  })

  describe('data integrity', () => {
    it('has at least 2 models per category', () => {
      for (const cat of HELP_ME_CHOOSE_CATEGORIES) {
        expect(cat.models.length).toBeGreaterThanOrEqual(
          2,
          `Category ${cat.id} must have at least 2 models`
        )
      }
    })

    it('has unique model IDs within each category', () => {
      for (const cat of HELP_ME_CHOOSE_CATEGORIES) {
        const ids = cat.models.map(m => m.modelId)
        const unique = new Set(ids)
        expect(unique.size).toBe(ids.length, `Category ${cat.id} has duplicate model IDs`)
      }
    })

    it('has non-empty evidence for each model', () => {
      for (const cat of HELP_ME_CHOOSE_CATEGORIES) {
        for (const m of cat.models) {
          expect(m.evidence.trim().length).toBeGreaterThan(
            0,
            `Category ${cat.id}, model ${m.modelId} has empty evidence`
          )
        }
      }
    })

    it('only includes models with numeric benchmark scores', () => {
      for (const cat of HELP_ME_CHOOSE_CATEGORIES) {
        if (CAPABILITY_CATEGORIES.has(cat.id)) continue
        for (const m of cat.models) {
          expect(
            hasBenchmarkScore(cat.id, m.evidence),
            `Category ${cat.id}, model ${m.modelId} must have a numeric benchmark score in evidence`
          ).toBe(true)
        }
      }
    })
  })
})
