/**
 * CreditBalance Component
 *
 * Reusable component for displaying credit balance with progress bar and reset date.
 * Can be used in UserMenu, banners, and other places where credit information is needed.
 */

import React from 'react'

import type { CreditBalance as CreditBalanceType } from '../../services/creditService'
import './CreditBalance.css'

export interface CreditBalanceProps {
  /** Credit balance data */
  balance: CreditBalanceType | null
  /** Whether credits are loading */
  isLoading?: boolean
  /** Display variant: 'compact' for small spaces, 'full' for detailed view */
  variant?: 'compact' | 'full'
  /** Show reset date information */
  showResetDate?: boolean
  /** Custom className */
  className?: string
  /** Callback when user clicks to upgrade (optional) */
  onUpgradeClick?: () => void
}

/**
 * CreditBalance component for displaying credit balance
 *
 * @example
 * ```tsx
 * <CreditBalance
 *   balance={creditBalance}
 *   isLoading={false}
 *   variant="full"
 *   showResetDate={true}
 * />
 * ```
 */
export const CreditBalance: React.FC<CreditBalanceProps> = ({
  balance,
  isLoading = false,
  variant = 'full',
  showResetDate = true,
  className = '',
  onUpgradeClick,
}) => {
  if (isLoading) {
    return (
      <div className={`credit-balance credit-balance-loading ${className}`}>
        <div className="credit-balance-label">Credits</div>
        <div className="credit-balance-value" style={{ opacity: 0.6 }}>
          Loading...
        </div>
      </div>
    )
  }

  if (!balance) {
    return (
      <div className={`credit-balance credit-balance-empty ${className}`}>
        <div className="credit-balance-label">Credits</div>
        <div className="credit-balance-value">N/A</div>
      </div>
    )
  }

  const creditsRemaining = balance.credits_remaining
  const creditsAllocated = balance.credits_allocated
  const creditsUsed = balance.credits_used_this_period ?? balance.credits_used_today ?? 0
  const usagePercent = creditsAllocated > 0 ? (creditsUsed / creditsAllocated) * 100 : 0
  const remainingPercent = creditsAllocated > 0 ? (creditsRemaining / creditsAllocated) * 100 : 0

  // Determine color based on remaining credits
  const getProgressColor = () => {
    if (remainingPercent >= 50) return 'var(--credit-progress-high, #10b981)' // Green
    if (remainingPercent >= 20) return 'var(--credit-progress-medium, #f59e0b)' // Yellow/Orange
    if (remainingPercent >= 10) return 'var(--credit-progress-low, #ef4444)' // Red
    return 'var(--credit-progress-critical, #dc2626)' // Dark Red
  }

  const formatResetDate = (dateString?: string) => {
    if (!dateString) return null
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays === 0) return 'Today'
      if (diffDays === 1) return 'Tomorrow'
      if (diffDays < 7) return `In ${diffDays} days`
      return date.toLocaleDateString()
    } catch {
      return dateString
    }
  }

  const resetDateText =
    showResetDate && balance.credits_reset_at ? formatResetDate(balance.credits_reset_at) : null

  const periodLabel = balance.period_type === 'monthly' ? 'This Month' : 'Today'

  return (
    <div className={`credit-balance credit-balance-${variant} ${className}`}>
      <div className="credit-balance-header">
        <div className="credit-balance-label">
          Credits {variant === 'full' && `(${periodLabel})`}
        </div>
        {variant === 'full' && onUpgradeClick && remainingPercent < 20 && (
          <button
            className="credit-balance-upgrade-btn"
            onClick={onUpgradeClick}
            title="Upgrade for more credits"
          >
            Upgrade
          </button>
        )}
      </div>

      <div className="credit-balance-value-container">
        <div className="credit-balance-value">
          <span className="credit-balance-current">{Math.round(creditsRemaining)}</span>
          <span className="credit-balance-separator">/</span>
          <span className="credit-balance-allocated">{creditsAllocated}</span>
        </div>
        {variant === 'full' && (
          <div className="credit-balance-used">{creditsUsed.toLocaleString()} used</div>
        )}
      </div>

      <div className="credit-balance-progress">
        <div
          className="credit-balance-progress-bar"
          style={{
            width: `${Math.min(100, usagePercent)}%`,
            backgroundColor: getProgressColor(),
          }}
          role="progressbar"
          aria-valuenow={usagePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${usagePercent.toFixed(1)}% credits used`}
        />
      </div>

      {variant === 'full' && resetDateText && (
        <div className="credit-balance-reset">Resets {resetDateText}</div>
      )}

      {variant === 'compact' && resetDateText && (
        <div className="credit-balance-reset-compact">Resets {resetDateText}</div>
      )}
    </div>
  )
}

CreditBalance.displayName = 'CreditBalance'
