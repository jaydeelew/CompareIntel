import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'

import type { PerModelUsage } from '../../types/comparison'
import type { ModelConversation } from '../../types/conversation'
import {
  AGREEMENT_HEURISTIC_NOTE,
  AGREEMENT_LABEL_TEXT,
  computeAgreement,
} from '../../utils/verdictAgreement'
import { mapPromptToHelpMeChooseCategory } from '../../utils/verdictCategory'
import {
  AGREEMENT_NEEDS_MODELS_TEXT,
  VERDICT_CHEAPEST_PILL,
  VERDICT_COST_HEADER,
  VERDICT_COST_MISSING,
  VERDICT_COST_TOOLTIP,
  VERDICT_FASTEST_PILL,
  VERDICT_HOW_THIS_WORKS,
  VERDICT_LATENCY_HEADER,
  VERDICT_LATENCY_TOOLTIP,
  VERDICT_METHODOLOGY_PATH,
  VERDICT_METRICS_HELP,
} from '../../utils/verdictCopy'
import {
  formatListPricePerMillion,
  listPriceHint,
  lookupListPricePerMillion,
} from '../../utils/verdictListPrice'
import {
  collectLatestPrompt,
  collectVerdictModelRows,
  formatVerdictCost,
  formatVerdictLatency,
  highlightExtremes,
} from '../../utils/verdictMetrics'
import {
  initialVerdictPanelExpanded,
  writeVerdictPanelExpanded,
} from '../../utils/verdictPanelCollapse'

export interface VerdictPanelProps {
  conversations: ModelConversation[]
  allModels: Array<{ id: string; name: string }>
  modelErrorStates?: Record<string, boolean>
  perModelUsage?: Record<string, PerModelUsage>
  onOpenHelpMeChoose?: (options?: { scrollToCategoryId?: string }) => void
}

function costTitle(costUsd: number | null, listPrice: number | null): string | undefined {
  if (costUsd != null) return VERDICT_COST_TOOLTIP
  if (listPrice != null) return `${VERDICT_COST_MISSING} ${listPriceHint(listPrice)}`
  return VERDICT_COST_MISSING
}

export function VerdictPanel({
  conversations,
  allModels,
  modelErrorStates = {},
  perModelUsage,
  onOpenHelpMeChoose,
}: VerdictPanelProps) {
  const [isExpanded, setIsExpanded] = useState(initialVerdictPanelExpanded)

  const toggleExpanded = useCallback(() => {
    setIsExpanded(current => {
      const next = !current
      writeVerdictPanelExpanded(next)
      return next
    })
  }, [])

  const rows = useMemo(
    () => collectVerdictModelRows(conversations, allModels, modelErrorStates, perModelUsage),
    [conversations, allModels, modelErrorStates, perModelUsage]
  )
  const { cheapestIds, fastestIds } = useMemo(() => highlightExtremes(rows), [rows])
  const agreement = useMemo(
    () =>
      computeAgreement(
        rows.filter(row => !row.isError && row.content.trim()).map(row => row.content)
      ),
    [rows]
  )
  const prompt = useMemo(() => collectLatestPrompt(conversations), [conversations])
  const categoryMatch = useMemo(() => mapPromptToHelpMeChooseCategory(prompt), [prompt])

  const agreementText = agreement.label
    ? AGREEMENT_LABEL_TEXT[agreement.label]
    : AGREEMENT_NEEDS_MODELS_TEXT
  const chooseHref = categoryMatch.categoryId
    ? `/#help-me-choose=${encodeURIComponent(categoryMatch.categoryId)}`
    : '/#help-me-choose'
  const chooseLabel = categoryMatch.category?.label ?? 'Help Me Choose'

  const handleChooseClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenHelpMeChoose) return
    event.preventDefault()
    onOpenHelpMeChoose(
      categoryMatch.categoryId ? { scrollToCategoryId: categoryMatch.categoryId } : undefined
    )
  }

  return (
    <aside className="verdict-panel" data-testid="verdict-panel" aria-labelledby="verdict-heading">
      <div className="verdict-panel-header">
        <h3 className="verdict-heading">
          <button
            type="button"
            id="verdict-toggle"
            className="verdict-toggle"
            aria-expanded={isExpanded}
            aria-controls="verdict-panel-content"
            data-testid="verdict-toggle"
            onClick={toggleExpanded}
          >
            <span id="verdict-heading">Verdict</span>
            <svg
              className={`verdict-chevron${isExpanded ? ' expanded' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M7 10l5 5 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </h3>
        <p className="verdict-agreement">
          <span className="verdict-agreement-label">Agreement</span>
          <span
            className={`verdict-badge${agreement.label ? ` verdict-badge--${agreement.label}` : ''}`}
            data-testid="verdict-agreement"
          >
            {agreementText}
          </span>
        </p>
      </div>

      <div id="verdict-panel-content" className="verdict-panel-body" hidden={!isExpanded}>
        <p className="verdict-note">{AGREEMENT_HEURISTIC_NOTE}</p>
        <p className="verdict-metrics-help">{VERDICT_METRICS_HELP}</p>

        <table className="verdict-metrics">
          <caption className="sr-only">
            {VERDICT_COST_HEADER} and {VERDICT_LATENCY_HEADER}
          </caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col" title={VERDICT_COST_TOOLTIP}>
                <span className="verdict-th-main">Cost</span>
                <span className="verdict-th-sub">this run, via OpenRouter</span>
              </th>
              <th scope="col" title={VERDICT_LATENCY_TOOLTIP}>
                <span className="verdict-th-main">Response time</span>
                <span className="verdict-th-sub">this run</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const listPrice = lookupListPricePerMillion(row.modelId)
              return (
                <tr key={row.modelId}>
                  <th scope="row">{row.modelName}</th>
                  <td>
                    <span title={costTitle(row.costUsd, listPrice)}>
                      {formatVerdictCost(row.costUsd)}
                    </span>
                    {cheapestIds.has(row.modelId) && (
                      <span className="verdict-pill">{VERDICT_CHEAPEST_PILL}</span>
                    )}
                    {listPrice != null && (
                      <span className="verdict-list-price">
                        List {formatListPricePerMillion(listPrice)}
                      </span>
                    )}
                  </td>
                  <td>
                    <span title={VERDICT_LATENCY_TOOLTIP}>
                      {formatVerdictLatency(row.latencyMs)}
                    </span>
                    {fastestIds.has(row.modelId) && (
                      <span className="verdict-pill">{VERDICT_FASTEST_PILL}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="verdict-footer">
          <p className="verdict-choose">
            Related:{' '}
            <a href={chooseHref} onClick={handleChooseClick} data-testid="verdict-help-me-choose">
              {chooseLabel}
            </a>
          </p>
          <p className="verdict-docs">
            <Link to={VERDICT_METHODOLOGY_PATH} data-testid="verdict-how-this-works">
              {VERDICT_HOW_THIS_WORKS}
            </Link>
          </p>
        </div>
      </div>
    </aside>
  )
}
