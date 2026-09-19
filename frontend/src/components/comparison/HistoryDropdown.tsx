import { getHistoryEntryLimit } from '../../config/constants'
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
    currentVisibleComparisonId,
    onLoadConversation,
    onDeleteConversation,
    onToggleSaved,
  } = historyProps

  if (!showHistoryDropdown) return null

  const userTier = isAuthenticated ? userSubscriptionTier : 'unregistered'
  const tierLimit = getHistoryEntryLimit(userTier)
  const atCap = conversationHistory.length >= tierLimit
  const shouldShowNotification = userTier === 'unregistered' || (userTier === 'free' && atCap)
  const isPaidTier = userTier !== 'unregistered' && userTier !== 'free'
  const shouldHideScrollbar = conversationHistory.length <= 3 && !shouldShowNotification

  let maxHeight: string | undefined
  if (conversationHistory.length > 0) {
    const notificationHeight = shouldShowNotification ? (isSmallLayout ? 95 : 70) : 0
    const entriesForHeight = Math.min(conversationHistory.length, 3)
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
            {conversationHistory.map(summary => {
                const isActive =
                  currentVisibleComparisonId && String(summary.id) === currentVisibleComparisonId
                return (
                  <div
                    key={summary.id}
                    className={`history-item ${isActive ? 'history-item-active' : ''}${
                      summary.saved ? ' history-item-saved' : ''
                    }`}
                    onClick={() => onLoadConversation(summary)}
                  >
                    <label
                      className="history-item-save"
                      onClick={e => e.stopPropagation()}
                      title="Keep this comparison"
                    >
                      <input
                        type="checkbox"
                        checked={summary.saved === true}
                        aria-label="Save this comparison"
                        onChange={e => onToggleSaved?.(summary, e.target.checked)}
                      />
                      <span>Save</span>
                    </label>
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
                        {summary.client_source && (
                          <span
                            className={`history-item-source history-item-source-${summary.client_source}`}
                          >
                            {summary.client_source === 'extension' ? 'Extension' : 'Web'}
                          </span>
                        )}
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
            {userTier === 'unregistered' && (
                <div className="history-signup-prompt">
                  <div className="history-signup-message">
                    <span className="history-signup-line">
                      {atCap
                        ? 'Older unsaved comparisons are removed first. Sign in to keep them.'
                        : 'Sign in to keep this history on every device.'}
                    </span>
                  </div>
                </div>
              )}
            {userTier === 'free' && atCap && (
                <div className="history-signup-prompt">
                  <div className="history-signup-message">
                    <span className="history-signup-line">
                      Free accounts keep {tierLimit} comparisons. Save the ones you need, or
                      upgrade for more.
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
