/**
 * Custom hook for managing active tab index with bounds checking
 *
 * This hook replaces the useEffect pattern that was adjusting activeTabIndex
 * when it went out of bounds. Instead of a cascading state update via useEffect,
 * this hook computes the valid index during render.
 *
 * Key improvements:
 * 1. No cascading state updates
 * 2. The index is always valid - no intermediate invalid states
 * 3. Better performance (no extra render cycles)
 *
 * React Best Practice (2025):
 * Derived state should be computed during render, not synchronized via useEffect.
 */

import { useState, useCallback, useMemo } from 'react'

export interface UseActiveTabIndexConfig {
  /** The total number of available tabs */
  tabCount: number
  /** Optional initial index (defaults to 0) */
  initialIndex?: number
}

export interface UseActiveTabIndexReturn {
  /**
   * The current active tab index, guaranteed to be valid.
   * Will be clamped to valid range if tabCount changes.
   */
  activeTabIndex: number

  /**
   * Set the active tab index. Will be clamped to valid range.
   */
  setActiveTabIndex: (index: number) => void

  /**
   * Go to next tab (wraps around)
   */
  nextTab: () => void

  /**
   * Go to previous tab (wraps around)
   */
  prevTab: () => void

  /**
   * The raw internal index (before clamping)
   * Useful for debugging or when you need the user's intended selection
   */
  rawIndex: number
}

export function useActiveTabIndex(config: UseActiveTabIndexConfig): UseActiveTabIndexReturn {
  const { tabCount, initialIndex = 0 } = config

  // Store the raw index that the user set
  const [rawIndex, setRawIndex] = useState(initialIndex)

  /**
   * Compute the valid index during render
   * This replaces the useEffect that was doing:
   *   if (activeTabIndex >= visibleConversations.length) setActiveTabIndex(0)
   *
   * By computing during render:
   * 1. The value is always valid
   * 2. No extra render cycle needed
   * 3. No cascading state updates
   */
  const activeTabIndex = useMemo(() => {
    // If no tabs, return 0
    if (tabCount <= 0) return 0

    // If rawIndex is within bounds, use it
    if (rawIndex >= 0 && rawIndex < tabCount) return rawIndex

    // Otherwise, clamp to 0 (this is what the original useEffect did)
    return 0
  }, [rawIndex, tabCount])

  /**
   * Set active tab index with validation
   */
  const setActiveTabIndex = useCallback((index: number) => {
    // Store the raw value - the useMemo will handle clamping
    setRawIndex(index)
  }, [])

  /**
   * Go to next tab with wrapping
   */
  const nextTab = useCallback(() => {
    if (tabCount <= 0) return
    setRawIndex(prev => (prev + 1) % tabCount)
  }, [tabCount])

  /**
   * Go to previous tab with wrapping
   */
  const prevTab = useCallback(() => {
    if (tabCount <= 0) return
    setRawIndex(prev => (prev - 1 + tabCount) % tabCount)
  }, [tabCount])

  return {
    activeTabIndex,
    setActiveTabIndex,
    nextTab,
    prevTab,
    rawIndex,
  }
}

/**
 * Simple utility to clamp an index to valid range
 * Use this when you just need the computation without the hook
 */
export function clampTabIndex(index: number, tabCount: number): number {
  if (tabCount <= 0) return 0
  if (index >= 0 && index < tabCount) return index
  return 0
}
