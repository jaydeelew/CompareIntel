import { useMemo, useEffect } from 'react'

import { getCreditAllocation, getDailyCreditLimit } from '../config/constants'
import type { CreditBalance } from '../services/creditService'
import type { User } from '../types'

interface UseCreditsRemainingProps {
  isAuthenticated: boolean
  user: User | null
  creditBalance: CreditBalance | null
  anonymousCreditsRemaining: number | null
  isFollowUpMode: boolean
  setIsFollowUpMode: (value: boolean) => void
}

interface UseCreditsRemainingReturn {
  creditsRemaining: number
}

/**
 * Hook to calculate and manage credits remaining state.
 *
 * Handles:
 * - Calculating credits remaining based on user type and credit balance
 * - Exiting follow-up mode when credits run out
 */
export function useCreditsRemaining(props: UseCreditsRemainingProps): UseCreditsRemainingReturn {
  const {
    isAuthenticated,
    user,
    creditBalance,
    anonymousCreditsRemaining,
    isFollowUpMode,
    setIsFollowUpMode,
  } = props

  // Calculate credits remaining (reusable across components)
  // This is used to disable submit button and exit follow-up mode when credits run out
  const creditsRemaining = useMemo(() => {
    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'

    const balanceMatchesUser =
      Boolean(isAuthenticated && creditBalance && creditBalance.subscription_tier === userTier) ||
      (!isAuthenticated && creditBalance && creditBalance.subscription_tier === 'unregistered')

    // Get credit information (if available)
    // Prefer creditBalance only when its tier matches the current user (avoids stale free-tier payload after upgrade)
    const creditsAllocated = balanceMatchesUser
      ? (creditBalance!.credits_allocated ??
        (isAuthenticated && user
          ? user.monthly_credits_allocated || getCreditAllocation(userTier)
          : getDailyCreditLimit(userTier) || getCreditAllocation(userTier)))
      : isAuthenticated && user
        ? user.monthly_credits_allocated || getCreditAllocation(userTier)
        : getDailyCreditLimit(userTier) || getCreditAllocation(userTier)

    // For unregistered users, prefer anonymousCreditsRemaining if available, then creditBalance
    if (!isAuthenticated) {
      if (anonymousCreditsRemaining !== null) {
        // Use anonymousCreditsRemaining state if available (most up-to-date for unregistered users)
        return anonymousCreditsRemaining
      } else if (
        balanceMatchesUser &&
        creditBalance?.credits_remaining !== undefined &&
        creditBalance?.subscription_tier === 'unregistered'
      ) {
        // Only use creditBalance if it's for unregistered users (prevent using authenticated user's balance)
        return creditBalance.credits_remaining
      } else {
        const creditsUsed = balanceMatchesUser ? (creditBalance?.credits_used_today ?? 0) : 0
        return Math.max(0, creditsAllocated - creditsUsed)
      }
    } else {
      if (balanceMatchesUser && creditBalance?.credits_remaining !== undefined) {
        return creditBalance.credits_remaining
      }
      const creditsUsed = balanceMatchesUser
        ? (creditBalance?.credits_used_this_period ?? (user?.credits_used_this_period || 0))
        : user?.credits_used_this_period || 0
      return Math.max(0, creditsAllocated - creditsUsed)
    }
  }, [isAuthenticated, user, creditBalance, anonymousCreditsRemaining])

  // Exit follow-up mode when credits run out
  useEffect(() => {
    if (isFollowUpMode && creditsRemaining <= 0) {
      setIsFollowUpMode(false)
    }
  }, [creditsRemaining, isFollowUpMode, setIsFollowUpMode])

  return {
    creditsRemaining,
  }
}
