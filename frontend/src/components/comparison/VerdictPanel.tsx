import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'

import { usePrefersReducedMotion } from '../../hooks/useExpandFromOrigin'
import type { PerModelUsage } from '../../types/comparison'
import type { ModelConversation } from '../../types/conversation'
import {
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
  VERDICT_PICK_FAVORITE,
  VERDICT_POPULAR_RATING,
  VERDICT_YOUR_VERDICT,
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
import { popularRatingForPrompt } from '../../utils/verdictPopularRating'

export interface VerdictPanelProps {
  open: boolean
  onClose: () => void
  conversations: ModelConversation[]
  allModels: Array<{ id: string; name: string }>
  modelErrorStates?: Record<string, boolean>
  perModelUsage?: Record<string, PerModelUsage>
  favoriteModelName: string | null
  onPickFavorite: () => void
  /** Desktop popover anchored to the results section, or a mobile bottom sheet. */
  variant?: 'popover' | 'sheet'
  onOpenHelpMeChoose?: (options?: { scrollToCategoryId?: string }) => void
}

function costTitle(costUsd: number | null, listPrice: number | null): string | undefined {
  if (costUsd != null) return VERDICT_COST_TOOLTIP
  if (listPrice != null) return `${VERDICT_COST_MISSING} ${listPriceHint(listPrice)}`
  return VERDICT_COST_MISSING
}

export function VerdictPanel({
  open,
  onClose,
  conversations,
  allModels,
  modelErrorStates = {},
  perModelUsage,
  favoriteModelName,
  onPickFavorite,
  variant = 'popover',
  onOpenHelpMeChoose,
}: VerdictPanelProps) {
  const reducedMotion = usePrefersReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(
    () => collectVerdictModelRows(conversations, allModels, modelErrorStates, perModelUsage),
    [conversations, allModels, modelErrorStates, perModelUsage]
  )
  const { cheapestIds, fastestIds } = useMemo(() => highlightExtremes(rows), [rows])
  const prompt = useMemo(() => collectLatestPrompt(conversations), [conversations])
  const popular = useMemo(() => popularRatingForPrompt(prompt, allModels), [prompt, allModels])

  const chooseHref = popular
    ? `/#help-me-choose=${encodeURIComponent(popular.categoryId)}`
    : '/#help-me-choose'

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: globalThis.MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (panelRef.current?.contains(target)) return
      if (target.closest('[data-testid="verdict-button"]')) return
      if (target.closest('[data-testid="verdict-sheet-scrim"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose])

  const handleChooseClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenHelpMeChoose || !popular) return
    event.preventDefault()
    onOpenHelpMeChoose({ scrollToCategoryId: popular.categoryId })
  }

  const className = [
    'verdict-panel',
    variant === 'sheet' ? 'verdict-panel--sheet' : 'verdict-panel--popover',
    open ? 'verdict-panel--open' : '',
    reducedMotion ? 'verdict-panel--instant' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      {variant === 'sheet' && open ? (
        <button
          type="button"
          className="verdict-sheet-scrim"
          data-testid="verdict-sheet-scrim"
          aria-label="Close verdict"
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        id="verdict-panel"
        className={className}
        role={open ? 'dialog' : undefined}
        aria-modal={open && variant === 'sheet' ? true : undefined}
        aria-labelledby="verdict-heading"
        aria-hidden={!open}
        data-testid="verdict-panel"
      >
        <div className="verdict-panel-toolbar">
          <h2 id="verdict-heading" className="verdict-heading">
            Verdict
          </h2>
          <button
            type="button"
            className="verdict-close"
            data-testid="verdict-close"
            onClick={onClose}
            aria-label="Close verdict"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <section className="verdict-section" data-testid="verdict-your-verdict">
          <h3>{VERDICT_YOUR_VERDICT}</h3>
          {favoriteModelName ? (
            <p className="verdict-pick" data-testid="verdict-current-pick">
              {favoriteModelName}
            </p>
          ) : (
            <button
              type="button"
              className="verdict-pick-prompt"
              data-testid="verdict-pick-favorite"
              onClick={onPickFavorite}
            >
              {VERDICT_PICK_FAVORITE}
            </button>
          )}
        </section>

        <section className="verdict-section" data-testid="verdict-popular-rating">
          <h3>{VERDICT_POPULAR_RATING}</h3>
          {popular ? (
            <>
              <p className="verdict-popular-model" data-testid="verdict-popular-model">
                {popular.modelName}
              </p>
              <p className="verdict-popular-meta" data-testid="verdict-popular-source">
                Source: {popular.source}
              </p>
              {popular.asOf ? (
                <p className="verdict-popular-meta" data-testid="verdict-popular-asof">
                  As of {popular.asOf}
                </p>
              ) : null}
              <p className="verdict-choose">
                Help Me Choose ·{' '}
                <a
                  href={chooseHref}
                  onClick={handleChooseClick}
                  data-testid="verdict-help-me-choose"
                >
                  {popular.categoryLabel}
                </a>
              </p>
            </>
          ) : (
            <p className="verdict-popular-meta">
              This prompt does not match a Help Me Choose category.{' '}
              <a href="/#help-me-choose" data-testid="verdict-help-me-choose">
                Help Me Choose
              </a>
            </p>
          )}
        </section>

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

        <p className="verdict-docs">
          <Link to={VERDICT_METHODOLOGY_PATH} data-testid="verdict-how-this-works">
            {VERDICT_HOW_THIS_WORKS}
          </Link>
        </p>
      </div>
    </>
  )
}
