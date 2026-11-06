/**
 * OpenRouter list price per 1M tokens from data the app already loads
 * (Help Me Choose "Best value" evidence). Not this-run billed cost.
 */

import { HELP_ME_CHOOSE_CATEGORIES } from '../data/helpMeChooseRecommendations'
import { createModelId } from '../types'

const LIST_PRICE_RE = /\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*1M/i

export function lookupListPricePerMillion(modelId: string): number | null {
  const category = HELP_ME_CHOOSE_CATEGORIES.find(item => item.id === 'cost-effective')
  if (!category) return null
  const target = createModelId(modelId)
  const entry = category.models.find(item => createModelId(item.modelId) === target)
  if (!entry) return null
  const match = entry.evidence.match(LIST_PRICE_RE)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

export function formatListPricePerMillion(usd: number): string {
  return `$${usd}/1M`
}

export function listPriceHint(usd: number): string {
  return `List price: ${formatListPricePerMillion(usd)} tokens (OpenRouter).`
}
