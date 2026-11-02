/**
 * Client-side agreement heuristic for the Verdict panel.
 *
 * Compares completed model replies with normalized token overlap plus an
 * exact-match check on extracted short/numeric final answers. This is not a
 * judgment of correctness and never picks a winning answer.
 */

export const AGREEMENT_LABEL = {
  AGREE: 'agree',
  PARTLY: 'partly',
  CONFLICT: 'conflict',
} as const

export type AgreementLabel = (typeof AGREEMENT_LABEL)[keyof typeof AGREEMENT_LABEL]

export const AGREEMENT_LABEL_TEXT: Record<AgreementLabel, string> = {
  agree: 'Agree',
  partly: 'Partly agree',
  conflict: 'Conflict',
}

export const AGREEMENT_HEURISTIC_NOTE = 'Automatic heuristic, not a judgment of correctness.'

const AGREE_SIMILARITY = 0.55
const PARTLY_SIMILARITY = 0.28

export function normalizeVerdictText(text: string): string {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`>#[\]()]/g, ' ')
    .replace(/[^a-z0-9.\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenizeVerdictText(text: string): string[] {
  return normalizeVerdictText(text)
    .split(' ')
    .map(token => (/^\d+\.\d+$/.test(token) ? token : token.replace(/\.+$/g, '')))
    .filter(token => token.length > 1)
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  const left = new Set(a)
  const right = new Set(b)
  if (left.size === 0 && right.size === 0) return 1
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const token of left) {
    if (right.has(token)) intersection += 1
  }
  return intersection / (left.size + right.size - intersection)
}

export function normalizeExtractedAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[,$%]/g, '')
    .replace(/["'`]+/g, '')
    .replace(/[.:;!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pull a short/numeric final answer when the reply is structured enough.
 * Returns null when no confident extract exists (caller then uses similarity).
 */
export function extractFinalAnswer(text: string): string | null {
  const stripped = text.replace(/```[\s\S]*?```/g, ' ').trim()
  if (!stripped) return null

  const labeled = stripped.match(
    /(?:final answer|the answer is|answer(?: is)?)\s*[:\-=]?\s*([^\n]+)\s*$/i
  )
  if (labeled?.[1]) {
    const labeledAnswer = normalizeExtractedAnswer(labeled[1])
    if (labeledAnswer) return labeledAnswer
  }

  const lines = stripped
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const lastLine = (lines[lines.length - 1] ?? '').replace(/^[#>*\-\s]+/, '').trim()
  const lastAnswer = normalizeExtractedAnswer(lastLine)
  if (
    lastAnswer &&
    lastAnswer.length <= 48 &&
    (/^-?\d+(\.\d+)?$/.test(lastAnswer) || /^(yes|no|true|false)$/.test(lastAnswer))
  ) {
    return lastAnswer
  }

  const whole = normalizeExtractedAnswer(stripped)
  if (whole && whole.length <= 32 && !whole.includes(' ')) {
    return whole
  }
  return null
}

export interface AgreementResult {
  label: AgreementLabel | null
  similarity: number | null
  answersMatch: boolean | null
}

function pairwiseMeanSimilarity(texts: string[]): number {
  if (texts.length < 2) return 1
  let total = 0
  let pairs = 0
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      total += jaccardSimilarity(tokenizeVerdictText(texts[i]), tokenizeVerdictText(texts[j]))
      pairs += 1
    }
  }
  return pairs === 0 ? 0 : total / pairs
}

/**
 * Label agreement among successful replies. Failed/empty replies are ignored.
 * One or zero replies → null label (UI shows a dash).
 */
export function computeAgreement(responses: string[]): AgreementResult {
  const usable = responses.map(text => text.trim()).filter(text => text.length > 0)
  if (usable.length < 2) {
    return { label: null, similarity: null, answersMatch: null }
  }

  const answers = usable.map(extractFinalAnswer)
  const allExtracted = answers.every((answer): answer is string => Boolean(answer))
  if (allExtracted) {
    const answersMatch = answers.every(answer => answer === answers[0])
    return {
      label: answersMatch ? AGREEMENT_LABEL.AGREE : AGREEMENT_LABEL.CONFLICT,
      similarity: pairwiseMeanSimilarity(usable),
      answersMatch,
    }
  }

  const similarity = pairwiseMeanSimilarity(usable)
  let label: AgreementLabel = AGREEMENT_LABEL.CONFLICT
  if (similarity >= AGREE_SIMILARITY) label = AGREEMENT_LABEL.AGREE
  else if (similarity >= PARTLY_SIMILARITY) label = AGREEMENT_LABEL.PARTLY

  return { label, similarity, answersMatch: null }
}
