/**
 * Scoring for ModelSearch: token-aware matching + optional fuzzy (Levenshtein) fallback.
 * Avoids single-letter noise from substrings inside words like "black" or "bytedance".
 */

import type { Model } from '../types'

export const MODEL_SEARCH_NO_MATCH = 999

export function normalizeSearchString(s: string): string {
  return s.trim().toLowerCase()
}

function tokenize(s: string): string[] {
  return normalizeSearchString(s)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 0)
}

export function lastIdSegment(id: string): string {
  const s = normalizeSearchString(String(id))
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf(':'))
  return i >= 0 ? s.slice(i + 1) : s
}

/** Returns distance if <= max, otherwise null. Standard Levenshtein with early exit. */
export function levenshteinWithin(s: string, t: string, max: number): number | null {
  const m = s.length
  const n = t.length
  if (m === 0) return n <= max ? n : null
  if (n === 0) return m <= max ? m : null

  let prev = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1)
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return null
    prev = cur
  }
  const d = prev[n]
  return d <= max ? d : null
}

/**
 * Lower is better. MODEL_SEARCH_NO_MATCH means exclude from results.
 */
export function modelSearchScore(model: Model, rawQuery: string): number {
  const q = normalizeSearchString(rawQuery)
  if (!q) return MODEL_SEARCH_NO_MATCH

  const name = normalizeSearchString(model.name)
  const idFull = normalizeSearchString(String(model.id))
  const idTail = lastIdSegment(model.id)
  const provider = normalizeSearchString(model.provider)

  const nameWords = tokenize(model.name)
  const idTailWords = tokenize(idTail)
  const provWords = tokenize(model.provider)

  if (name === q || idFull === q || idTail === q) return 0
  if (name.startsWith(q) || idTail.startsWith(q) || idFull.startsWith(q)) return 1
  if (nameWords.some(w => w.startsWith(q))) return 2
  if (idTailWords.some(w => w.startsWith(q))) return 2

  if (q.length >= 2) {
    if (name.includes(q) || idTail.includes(q) || idFull.includes(q)) return 3
    if (provWords.some(w => w.startsWith(q))) return 4
    if (provider.includes(q)) return 5
  } else {
    if (provWords.some(w => w.startsWith(q))) return 4
  }

  if (q.length >= 3) {
    const maxD = q.length <= 6 ? 1 : 2
    const candidates = new Set<string>()
    candidates.add(name)
    candidates.add(idTail)
    for (const w of nameWords) candidates.add(w)
    for (const w of idTailWords) candidates.add(w)
    for (const w of provWords) candidates.add(w)

    let bestFuzzy = MODEL_SEARCH_NO_MATCH
    for (const cand of candidates) {
      if (!cand || cand.length < 2) continue
      if (Math.abs(cand.length - q.length) > maxD + 2) continue
      const d = levenshteinWithin(q, cand, maxD)
      if (d !== null) bestFuzzy = Math.min(bestFuzzy, 60 + d)
    }
    if (bestFuzzy !== MODEL_SEARCH_NO_MATCH) return bestFuzzy
  }

  return MODEL_SEARCH_NO_MATCH
}
