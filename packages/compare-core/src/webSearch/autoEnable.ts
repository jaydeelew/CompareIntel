import type { ModelInfo } from '../api/services'

const TIME_SENSITIVE_KEYWORDS = [
  'today',
  'now',
  'current',
  'latest',
  'recent',
  'live',
  'right now',
  'yesterday',
  'this week',
  'this month',
  'this year',
  'weather',
  'temperature',
  'forecast',
  'news',
  'headline',
  'breaking',
  'score',
  'stock',
  'price',
  'market',
  'happening',
  'going on',
  'update',
  'status',
  'condition',
]

const TIME_SENSITIVE_PATTERNS = [
  /\bweather\b.*\btoday\b/i,
  /\bcurrent\b.*\bweather\b/i,
  /\bwhat.*\bweather\b/i,
  /\bhow.*\bweather\b/i,
  /\bweather.*\blike\b/i,
  /\bnews\b.*\btoday\b/i,
  /\bcurrent\b.*\bnews\b/i,
  /\blatest\b.*\bnews\b/i,
  /\bstock\b.*\bprice\b/i,
  /\bcurrent\b.*\bprice\b/i,
  /\bscore\b.*\btoday\b/i,
  /\blive\b.*\bscore\b/i,
]

const MONTH_NAMES =
  'january|february|march|april|may|june|july|august|september|october|november|december'

const MONTH_YEAR_PATTERN = new RegExp(`\\b(${MONTH_NAMES})\\s+(20\\d{2})\\b`, 'gi')
const ISO_DATE_PATTERN = /\b(20\d{2})-(\d{2})-(\d{2})\b/g

export function parseKnowledgeCutoff(cutoff: string | null | undefined): Date | null {
  if (!cutoff) return null
  const trimmed = cutoff.trim()
  if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'date pending') {
    return null
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
  }

  const monthYearMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (monthYearMatch) {
    const monthIndex = new Date(`${monthYearMatch[1]} 1, ${monthYearMatch[2]}`).getMonth()
    if (!Number.isNaN(monthIndex)) {
      return new Date(Number(monthYearMatch[2]), monthIndex + 1, 0)
    }
  }

  return null
}

export function isTimeSensitiveQuery(prompt: string): boolean {
  const promptLower = prompt.toLowerCase()
  if (TIME_SENSITIVE_KEYWORDS.some((keyword) => promptLower.includes(keyword))) {
    return true
  }
  return TIME_SENSITIVE_PATTERNS.some((pattern) => pattern.test(prompt))
}

function getSelectedModels(
  selectedModelIds: string[],
  modelsByProvider: Record<string, ModelInfo[]>
): ModelInfo[] {
  const selected = new Set(selectedModelIds)
  const models: ModelInfo[] = []
  for (const providerModels of Object.values(modelsByProvider)) {
    for (const model of providerModels) {
      if (selected.has(model.id)) {
        models.push(model)
      }
    }
  }
  return models
}

function getLatestKnowledgeCutoff(models: ModelInfo[]): Date | null {
  let latest: Date | null = null
  for (const model of models) {
    const cutoff = parseKnowledgeCutoff(model.knowledge_cutoff)
    if (!cutoff) continue
    if (!latest || cutoff > latest) {
      latest = cutoff
    }
  }
  return latest
}

function promptReferencesDateAfterCutoff(prompt: string, cutoff: Date | null): boolean {
  const now = new Date()

  for (const match of prompt.matchAll(MONTH_YEAR_PATTERN)) {
    const monthIndex = new Date(`${match[1]} 1, ${match[2]}`).getMonth()
    if (Number.isNaN(monthIndex)) continue
    const referenced = new Date(Number(match[2]), monthIndex + 1, 0)
    if (cutoff ? referenced > cutoff : referenced > now) {
      return true
    }
  }

  for (const match of prompt.matchAll(ISO_DATE_PATTERN)) {
    const referenced = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    if (cutoff ? referenced > cutoff : referenced > now) {
      return true
    }
  }

  for (const match of prompt.matchAll(/\b(20\d{2})\b/g)) {
    const year = Number(match[1])
    if (cutoff) {
      if (year > cutoff.getFullYear()) return true
      continue
    }
    if (year >= now.getFullYear()) return true
  }

  return false
}

export function shouldAutoEnableWebSearch(
  prompt: string,
  selectedModelIds: string[],
  modelsByProvider: Record<string, ModelInfo[]>
): boolean {
  const selectedModels = getSelectedModels(selectedModelIds, modelsByProvider)
  const webSearchModels = selectedModels.filter((model) => model.supports_web_search)
  if (webSearchModels.length === 0) {
    return false
  }

  if (isTimeSensitiveQuery(prompt)) {
    return true
  }

  const latestCutoff = getLatestKnowledgeCutoff(webSearchModels)
  return promptReferencesDateAfterCutoff(prompt, latestCutoff)
}
