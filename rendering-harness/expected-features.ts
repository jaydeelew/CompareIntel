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
  footnotes?: boolean
  taskLists?: boolean
  strikethrough?: boolean
  autolinks?: boolean
  bareUrls?: boolean
  breakHtml?: boolean
  supHtml?: boolean
  detailsHtml?: boolean
  nestedBlockquote?: boolean
  tableAlignment?: boolean
  tablePipes?: boolean
  tableInlineMath?: boolean
  mermaid?: boolean
  chemistry?: boolean
  cases?: boolean
  aligned?: boolean
  boxed?: boolean
  textUnicode?: boolean
  emoji?: boolean
  rtl?: boolean
  cjk?: boolean
  longUnbroken?: boolean
  wideTable?: boolean
  longCodeLine?: boolean
  currencyBesideMath?: boolean
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
  '07-rare-formats': {
    displayMath: true,
    inlineMath: true,
    codeBlocks: true,
    tables: true,
    links: true,
    currency: true,
    footnotes: true,
    taskLists: true,
    strikethrough: true,
    autolinks: true,
    bareUrls: true,
    breakHtml: true,
    supHtml: true,
    detailsHtml: true,
    nestedBlockquote: true,
    tableAlignment: true,
    tablePipes: true,
    tableInlineMath: true,
    mermaid: true,
    chemistry: true,
    cases: true,
    aligned: true,
    boxed: true,
    textUnicode: true,
    emoji: true,
    rtl: true,
    cjk: true,
    longUnbroken: true,
    wideTable: true,
    longCodeLine: true,
    currencyBesideMath: true,
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
  'footnotes',
  'taskLists',
  'strikethrough',
  'autolinks',
  'bareUrls',
  'breakHtml',
  'supHtml',
  'detailsHtml',
  'nestedBlockquote',
  'tableAlignment',
  'tablePipes',
  'tableInlineMath',
  'mermaid',
  'chemistry',
  'cases',
  'aligned',
  'boxed',
  'textUnicode',
  'emoji',
  'rtl',
  'cjk',
  'longUnbroken',
  'wideTable',
  'longCodeLine',
  'currencyBesideMath',
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
    footnotes: src.hasFootnotes || undefined,
    taskLists: src.hasTaskLists || undefined,
    strikethrough: src.hasStrikethrough || undefined,
    autolinks: src.hasAutolinks || undefined,
    bareUrls: src.hasBareUrls || undefined,
    breakHtml: src.hasBreakHtml || undefined,
    supHtml: src.hasSupHtml || undefined,
    detailsHtml: src.hasDetailsHtml || undefined,
    nestedBlockquote: src.hasNestedBlockquote || undefined,
    tableAlignment: src.hasTableAlignment || undefined,
    tablePipes: src.hasTablePipes || undefined,
    tableInlineMath: src.hasTableInlineMath || undefined,
    mermaid: src.hasMermaid || undefined,
    chemistry: src.hasChemistry || undefined,
    cases: src.hasCases || undefined,
    aligned: src.hasAligned || undefined,
    boxed: src.hasBoxed || undefined,
    textUnicode: src.hasTextUnicode || undefined,
    emoji: src.hasEmoji || undefined,
    rtl: src.hasRtl || undefined,
    cjk: src.hasCjk || undefined,
    longUnbroken: src.hasLongUnbroken || undefined,
    wideTable: src.hasWideTable || undefined,
    longCodeLine: src.hasLongCodeLine || undefined,
    currencyBesideMath: src.hasCurrencyBesideMath || undefined,
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
