/**
 * Top Help Me Choose model for the prompt's category.
 * Source text and the catalog "Fetched" date come from the static evidence
 * strings. External vote totals are stripped so the panel does not surface
 * pool sizes.
 */

import type { HelpMeChooseCategory } from '../data/helpMeChooseRecommendations'

import { modelDisplayLabel } from './retiredConversationModels'
import { mapPromptToHelpMeChooseCategory } from './verdictCategory'

export interface PopularRating {
  categoryId: string
  categoryLabel: string
  modelId: string
  modelName: string
  source: string
  asOf: string | null
}

const FETCHED_RE = /Fetched\s+(\d{4}-\d{2}-\d{2})\.?/i
const VOTE_COUNT_RE = /,?\s*\d[\d,]*\s+votes\b/gi

export function ratingSourceAndDate(evidence: string): { source: string; asOf: string | null } {
  const fetched = evidence.match(FETCHED_RE)
  const asOf = fetched?.[1] ?? null
  const source = evidence
    .replace(FETCHED_RE, '')
    .replace(VOTE_COUNT_RE, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,)])/g, '$1')
    .trim()
    .replace(/[.\s]+$/, '')
  return { source, asOf }
}

export function popularRatingForPrompt(
  prompt: string,
  allModels: Array<{ id: string; name: string }>
): PopularRating | null {
  const match = mapPromptToHelpMeChooseCategory(prompt)
  return popularRatingForCategory(match.category, allModels)
}

export function popularRatingForCategory(
  category: HelpMeChooseCategory | null,
  allModels: Array<{ id: string; name: string }>
): PopularRating | null {
  const top = category?.models[0]
  if (!category || !top) return null
  const { source, asOf } = ratingSourceAndDate(top.evidence)
  return {
    categoryId: category.id,
    categoryLabel: category.label,
    modelId: top.modelId,
    modelName: modelDisplayLabel(top.modelId, allModels),
    source,
    asOf,
  }
}
