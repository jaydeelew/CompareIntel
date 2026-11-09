/**
 * Expected DOM features for a harness prompt.
 *
 * Name-based defaults describe the *current* prompt files. Saved Nov 4 replies
 * keep their original `promptText`, which can differ (e.g. 01 did not ask for
 * links). When promptText is present, require only features that prompt
 * actually demonstrates so old provenance is not scored against a later file.
 */

import { detectSourceFeatures } from './source-features.js'

export interface ExpectedFeatures {
  displayMath?: boolean
  inlineMath?: boolean
  codeBlocks?: boolean
  tables?: boolean
  links?: boolean
  nestedLists?: boolean
  currency?: boolean
  noKatexErrors?: boolean
  safeLinksOnly?: boolean
}

const ALWAYS: ExpectedFeatures = {
  noKatexErrors: true,
  safeLinksOnly: true,
}

/** Current prompt-file profiles (used when promptText is missing). */
export const EXPECTED_BY_PROMPT_NAME: Record<string, ExpectedFeatures> = {
  '01-math-basics': {
    displayMath: true,
    inlineMath: true,
    links: true,
    currency: true,
  },
  '02-markdown-formatting': {
    tables: true,
    nestedLists: true,
  },
  '03-code-blocks': {
    codeBlocks: true,
  },
  '04-mixed-markdown-latex': {
    displayMath: true,
    inlineMath: true,
    codeBlocks: true,
    tables: true,
  },
  '05-complex-scenarios': {
    displayMath: true,
    inlineMath: true,
    codeBlocks: true,
    tables: true,
    nestedLists: true,
  },
  '06-edge-cases-boundaries': {
    displayMath: true,
    currency: true,
    codeBlocks: true,
  },
}

const FEATURE_KEYS = [
  'displayMath',
  'inlineMath',
  'codeBlocks',
  'tables',
  'links',
  'nestedLists',
  'currency',
] as const

type FeatureKey = (typeof FEATURE_KEYS)[number]

export function inferAskedFeatures(promptText: string): ExpectedFeatures {
  const src = detectSourceFeatures(promptText)
  return {
    displayMath: src.hasDisplayMath || undefined,
    inlineMath: src.hasInlineMath || undefined,
    codeBlocks: src.hasCodeBlocks || undefined,
    tables: src.hasTables || undefined,
    links: src.hasLinks || undefined,
    nestedLists: src.hasNestedLists || undefined,
    currency: src.hasCurrency || undefined,
  }
}

export function getExpectedFeatures(
  promptName: string,
  promptText?: string
): ExpectedFeatures {
  const byName = EXPECTED_BY_PROMPT_NAME[promptName] || {}
  if (!promptText) {
    return { ...byName, ...ALWAYS }
  }

  const asked = inferAskedFeatures(promptText)
  const expected: ExpectedFeatures = { ...ALWAYS }
  for (const key of FEATURE_KEYS) {
    if (byName[key] && asked[key]) {
      expected[key] = true
    }
  }
  return expected
}

export function droppedNameExpectations(
  promptName: string,
  promptText?: string
): FeatureKey[] {
  if (!promptText) return []
  const byName = EXPECTED_BY_PROMPT_NAME[promptName] || {}
  const asked = inferAskedFeatures(promptText)
  return FEATURE_KEYS.filter(key => Boolean(byName[key]) && !asked[key])
}
