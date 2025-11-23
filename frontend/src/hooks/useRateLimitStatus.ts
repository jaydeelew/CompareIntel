/**
 * Custom hook for managing rate limit status
 *
 * Fetches and tracks rate limit status for both authenticated
 * and anonymous users. Includes usage counts and tier limits.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

import { getRateLimitStatus, type RateLimitStatus } from '../services/compareService'

export interface UseRateLimitStatusOptions {
  isAuthenticated: boolean
  browserFingerprint: string
}

export interface UseRateLimitStatusReturn {
  usageCount: number
  setUsageCount: React.Dispatch<React.SetStateAction<number>>
  rateLimitStatus: RateLimitStatus | null
  fetchRateLimitStatus: () => Promise<void>
}

export function useRateLimitStatus({
  isAuthenticated,
  browserFingerprint,
}: UseRateLimitStatusOptions): UseRateLimitStatusReturn {
  const [usageCount, setUsageCount] = useState(0)
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null)

  // Fetch rate limit status
  const fetchRateLimitStatus = useCallback(async () => {
    if (!isAuthenticated && !browserFingerprint) {
      return
    }

    try {
      const status = await getRateLimitStatus(isAuthenticated ? undefined : browserFingerprint)
      setRateLimitStatus(status)

      // Update usage counts from backend response to keep them in sync
      // For anonymous users, backend returns 'fingerprint_usage' or 'ip_usage'
      // For authenticated users, backend returns 'daily_usage'
      if (!isAuthenticated) {
        const latestCount = status.fingerprint_usage || status.ip_usage || status.daily_usage || 0
        setUsageCount(latestCount)

        // Update localStorage to match backend
        const today = new Date().toDateString()
        localStorage.setItem(
          'compareintel_usage',
          JSON.stringify({
            count: latestCount,
            date: today,
          })
        )
      }
      // For authenticated users, usage count comes from user object, not from rate limit status
    } catch (error) {
      // Silently handle cancellation errors (expected when component unmounts)
      if (error instanceof Error && error.name === 'CancellationError') {
        return // Don't log or update state for cancelled requests
      }
      console.error('Failed to fetch rate limit status:', error)
      setRateLimitStatus(null)
    }
  }, [isAuthenticated, browserFingerprint])

  // Load usage counts from localStorage for anonymous users
  // Reset usage counts to 0 when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Clear usage counts for authenticated users - they use user.credits_used_this_period instead
      setUsageCount(0)
    } else {
      // Only load from localStorage for anonymous users
      const savedUsage = localStorage.getItem('compareintel_usage')

      if (savedUsage) {
        try {
          const { count, date } = JSON.parse(savedUsage)
          const today = new Date().toDateString()
          if (date === today) {
            setUsageCount(count)
          } else {
            // Reset count if it's a new day
            setUsageCount(0)
            localStorage.removeItem('compareintel_usage')
          }
        } catch (e) {
          console.error('Failed to parse usage count:', e)
          setUsageCount(0)
        }
      }
    }
  }, [isAuthenticated])

  // Fetch rate limit status on mount and when auth/fingerprint changes
  // Use ref to prevent duplicate calls during React StrictMode double renders
  const hasFetchedRef = useRef(false)
  const lastFingerprintRef = useRef<string | null>(null)
  const lastAuthStateRef = useRef<boolean | null>(null)

  useEffect(() => {
    const fingerprintChanged = lastFingerprintRef.current !== browserFingerprint
    const authChanged = lastAuthStateRef.current !== isAuthenticated

    // Only fetch if:
    // 1. We haven't fetched yet, OR
    // 2. Fingerprint or auth state actually changed (not just a re-render)
    if (
      (browserFingerprint || isAuthenticated) &&
      (!hasFetchedRef.current || fingerprintChanged || authChanged)
    ) {
      hasFetchedRef.current = true
      lastFingerprintRef.current = browserFingerprint
      lastAuthStateRef.current = isAuthenticated
      fetchRateLimitStatus()
    }
  }, [isAuthenticated, browserFingerprint, fetchRateLimitStatus])

  return {
    usageCount,
    setUsageCount,
    rateLimitStatus,
    fetchRateLimitStatus,
  }
}
