import { getConversationLimit } from '../../config/constants'
import { truncatePrompt, formatDate } from '../../utils'

import type { HistoryProps } from './ComparisonFormTypes'

export interface HistoryDropdownProps {
  historyProps: HistoryProps
  isAuthenticated: boolean
  userSubscriptionTier?: string
  isSmallLayout: boolean
}

export function HistoryDropdown({
  historyProps,
  isAuthenticated,
  userSubscriptionTier = 'free',
  isSmallLayout,
}: HistoryDropdownProps) {
  const {
    showHistoryDropdown,
    conversationHistory,
    isLoadingHistory,
    historyLimit,
    currentVisibleComparisonId,
    onLoadConversation,
    onDeleteConversation,
  } = historyProps

  if (!showHistoryDropdown) return null

  const userTier = isAuthenticated ? userSubscriptionTier : 'unregistered'
  const tierLimit = getConversationLimit(userTier)
  const shouldShowNotification =
    (userTier === 'unregistered' || userTier === 'free') && conversationHistory.length >= tierLimit
  const maxVisibleEntries = userTier === 'unregistered' ? 2 : 3
  const isPaidTier = userTier !== 'unregistered' && userTier !== 'free'
  const shouldHideScrollbar = conversationHistory.length <= 3 && !shouldShowNotification

  let maxHeight: string | undefined
  if (conversationHistory.length > 0) {
    const notificationHeight = shouldShowNotification ? (isSmallLayout ? 95 : 70) : 0
    const actualEntriesToShow = isPaidTier
      ? Math.min(conversationHistory.length, historyLimit)
      : Math.min(conversationHistory.length, maxVisibleEntries)
    const entriesForHeight = Math.min(actualEntriesToShow, 3)
    const baseHeight = entriesForHeight === 1 ? 83 : entriesForHeight === 2 ? 165 : 250
    maxHeight = `${baseHeight + notificationHeight}px`
  }

  const containerStyle = maxHeight
    ? isPaidTier
      ? { maxHeight, height: maxHeight }
      : { maxHeight }
    : undefined

  return (
    <div
      className={`history-inline-list ${shouldHideScrollbar ? 'no-scrollbar' : 'scrollable'}`}
      style={containerStyle}
    >
      <div className="history-inline-list-content">
        {isLoadingHistory ? (
          <div className="history-loading">Loading...</div>
        ) : conversationHistory.length === 0 ? (
          <div className="history-empty">No conversation history</div>
        ) : (
          <>
            {conversationHistory
              .slice(0, isPaidTier ? historyLimit : maxVisibleEntries)
              .map(summary => {
                const isActive =
                  currentVisibleComparisonId && String(summary.id) === currentVisibleComparisonId
                return (
                  <div
                    key={summary.id}
                    className={`history-item ${isActive ? 'history-item-active' : ''}`}
                    onClick={() => onLoadConversation(summary)}
                  >
                    <div className="history-item-content">
                      <div className="history-item-prompt">
                        {truncatePrompt(summary.input_data)}
                        {summary.conversation_type === 'breakout' && (
                          <span
                            className="history-item-breakout-badge"
                            title="Breakout conversation"
                          >
                            ↗
                          </span>
                        )}
                      </div>
                      <div className="history-item-meta">
                        <span className="history-item-models">
                          {summary.models_used.length === 1
                            ? summary.models_used[0].split('/').pop() || summary.models_used[0]
                            : `${summary.models_used.length} models`}
                        </span>
                        <span className="history-item-date">{formatDate(summary.created_at)}</span>
                      </div>
                    </div>
                    <button
                      className="history-item-delete"
                      onClick={e => onDeleteConversation(summary, e)}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            {(userTier === 'unregistered' || userTier === 'free') &&
              conversationHistory.length >= tierLimit && (
                <div className="history-signup-prompt">
                  <div className="history-signup-message">
                    <span className="history-signup-line">
                      {userTier === 'unregistered'
                        ? 'You can only save the last 2 comparisons.'
                        : 'You only have 3 saves for your tier.'}
                    </span>
                    <span className="history-signup-line">
                      {' '}
                      {userTier === 'unregistered'
                        ? 'Sign up for a free account to save more!'
                        : 'Upgrade to save more comparisons!'}
                    </span>
                  </div>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}
