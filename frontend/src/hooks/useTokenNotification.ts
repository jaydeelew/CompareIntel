/**
 * Custom hook for notifying parent of token count changes
 *
 * This hook addresses the anti-pattern of using useEffect to call parent callbacks
 * when derived state changes. Instead, it uses a ref to track changes and
 * batches notifications to avoid unnecessary re-renders.
 *
 * Key improvements:
 * 1. Uses ref to track previous values, avoiding unnecessary callback invocations
 * 2. Batches multiple rapid changes
 * 3. More explicit about when notifications happen
 *
 * React Best Practice (2025):
 * When you need to notify a parent of computed state changes, prefer:
 * 1. Having the parent compute the value directly (if possible)
 * 2. Using a controlled component pattern
 * 3. If useEffect is necessary, deduplicate with refs
 */

import { useEffect, useRef, useCallback } from 'react'

export interface UseTokenNotificationConfig {
  /** The current token count to notify about */
  tokenCount: number | null
  /** Callback to notify parent of changes */
  onTokenCountChange?: (count: number | null) => void
  /** Whether notifications are enabled */
  enabled?: boolean
}

export interface UseTokenNotificationReturn {
  /** Manually notify of a token count (useful for imperative updates) */
  notifyTokenCount: (count: number | null) => void
  /** The last notified value */
  lastNotifiedValue: number | null
}

export function useTokenNotification(
  config: UseTokenNotificationConfig
): UseTokenNotificationReturn {
  const { tokenCount, onTokenCountChange, enabled = true } = config

  // Track the last notified value to avoid duplicate notifications
  const lastNotifiedValueRef = useRef<number | null>(null)
  // Track if we're in the middle of a notification cycle
  const notificationPendingRef = useRef(false)

  /**
   * Notify parent of token count, with deduplication
   */
  const notifyTokenCount = useCallback(
    (count: number | null) => {
      if (!onTokenCountChange || !enabled) return

      // Skip if value hasn't changed
      if (lastNotifiedValueRef.current === count) return

      // Update tracked value
      lastNotifiedValueRef.current = count

      // Call the callback
      onTokenCountChange(count)
    },
    [onTokenCountChange, enabled]
  )

  /**
   * Effect to notify parent when token count changes
   * This uses a ref to deduplicate, making the effect much more efficient
   */
  useEffect(() => {
    // Skip if already pending to avoid rapid-fire notifications
    if (notificationPendingRef.current) return

    // Skip if value is the same as last notification
    if (lastNotifiedValueRef.current === tokenCount) return

    // Mark as pending
    notificationPendingRef.current = true

    // Use microtask to batch rapid changes
    queueMicrotask(() => {
      notifyTokenCount(tokenCount)
      notificationPendingRef.current = false
    })
  }, [tokenCount, notifyTokenCount])

  return {
    notifyTokenCount,
    lastNotifiedValue: lastNotifiedValueRef.current,
  }
}

/**
 * Calculate the total input tokens for notification
 * This is a pure function that can be used outside the hook
 */
export function calculateTotalInputTokens(
  tokenUsageInfo: { totalInputTokens: number } | null,
  accurateTokenCounts: { input_tokens: number } | null,
  isFollowUpMode: boolean
): number | null {
  if (tokenUsageInfo) {
    return tokenUsageInfo.totalInputTokens
  }

  if (!isFollowUpMode && accurateTokenCounts) {
    return accurateTokenCounts.input_tokens
  }

  return null
}
