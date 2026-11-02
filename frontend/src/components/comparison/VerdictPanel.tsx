import { useMemo, type MouseEvent } from 'react'

import type { PerModelUsage } from '../../types/comparison'
import type { ModelConversation } from '../../types/conversation'
import {
  AGREEMENT_HEURISTIC_NOTE,
  AGREEMENT_LABEL_TEXT,
  computeAgreement,
} from '../../utils/verdictAgreement'
import { mapPromptToHelpMeChooseCategory } from '../../utils/verdictCategory'
import {
  collectLatestPrompt,
  collectVerdictModelRows,
  formatVerdictCost,
  formatVerdictLatency,
  highlightExtremes,
} from '../../utils/verdictMetrics'

export interface VerdictPanelProps {
  conversations: ModelConversation[]
  allModels: Array<{ id: string; name: string }>
  modelErrorStates?: Record<string, boolean>
  perModelUsage?: Record<string, PerModelUsage>
  onOpenHelpMeChoose?: (options?: { scrollToCategoryId?: string }) => void
}

export function VerdictPanel({
  conversations,
  allModels,
  modelErrorStates = {},
  perModelUsage,
  onOpenHelpMeChoose,
}: VerdictPanelProps) {
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

  const agreementText = agreement.label ? AGREEMENT_LABEL_TEXT[agreement.label] : '—'
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
        <h3 id="verdict-heading">Verdict</h3>
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
      <p className="verdict-note">{AGREEMENT_HEURISTIC_NOTE}</p>

      <table className="verdict-metrics">
        <caption className="sr-only">Per-model cost and latency</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Cost</th>
            <th scope="col">Latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.modelId}>
              <th scope="row">{row.modelName}</th>
              <td>
                <span>{formatVerdictCost(row.costUsd)}</span>
                {cheapestIds.has(row.modelId) && <span className="verdict-pill">Cheapest</span>}
              </td>
              <td>
                <span>{formatVerdictLatency(row.latencyMs)}</span>
                {fastestIds.has(row.modelId) && <span className="verdict-pill">Fastest</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="verdict-choose">
        Related:{' '}
        <a href={chooseHref} onClick={handleChooseClick} data-testid="verdict-help-me-choose">
          {chooseLabel}
        </a>
      </p>
    </aside>
  )
}
