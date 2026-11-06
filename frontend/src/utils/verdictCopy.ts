/**
 * User-facing Verdict copy. Labels are scoped to this CompareIntel run so
 * cost/latency are not read as global rankings or quality scores.
 */

export const VERDICT_METHODOLOGY_PATH = '/verdict-methodology'

export const VERDICT_COST_HEADER = 'Cost (this run, via OpenRouter)'
export const VERDICT_LATENCY_HEADER = 'Response time (this run)'
export const VERDICT_CHEAPEST_PILL = 'Cheapest here'
export const VERDICT_FASTEST_PILL = 'Fastest here'
export const AGREEMENT_NEEDS_MODELS_TEXT = 'Needs 2+ models'

export const VERDICT_COST_TOOLTIP =
  'USD billed for this CompareIntel run as reported by OpenRouter. Not model quality and not a platform-independent price.'

export const VERDICT_LATENCY_TOOLTIP =
  'Time from request to finished reply on this CompareIntel run, including OpenRouter and the network. Not raw model speed.'

export const VERDICT_METRICS_HELP =
  'Cost is this run via OpenRouter. Response time includes OpenRouter and the network. Neither ranks model quality.'

export const VERDICT_COST_MISSING = 'OpenRouter did not report a cost for this run.'

export const VERDICT_HOW_THIS_WORKS = 'How this works'
