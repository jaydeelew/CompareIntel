/**
 * Hook to detect responsive breakpoints for layout decisions.
 *
 * This hook provides a centralized way to detect screen size breakpoints,
 * eliminating duplicated resize listener logic across components.
 *
 * For interaction-based detection (touch vs mouse), use useTouchDevice instead.
 *
 * @example
 * ```tsx
 * const { isMobileLayout, isSmallLayout, isWideLayout } = useBreakpoint()
 *
 * // Use for layout decisions
 * if (isMobileLayout) {
 *   return <TabbedView />
 * }
 * return <GridView />
 * ```
 */

import { useState, useEffect, useMemo } from 'react'

import { BREAKPOINT_SMALL, BREAKPOINT_MOBILE, BREAKPOINT_WIDE } from '../config/constants'

export interface BreakpointState {
  /**
   * True when viewport width <= 640px
   * Use for: character count display wrapping, very compact layouts
   */
  isSmallLayout: boolean

  /**
   * True when viewport width <= 768px
   * Use for: tabbed views, mobile navigation, compact UI elements
   */
  isMobileLayout: boolean

  /**
   * True when viewport width > 1000px
   * Use for: header controls alignment, side-by-side layouts
   */
  isWideLayout: boolean

  /**
   * Current viewport width in pixels
   * Use sparingly - prefer the boolean flags for most cases
   */
  viewportWidth: number
}

/**
 * Detects responsive breakpoints based on viewport width.
 *
 * Features:
 * - Single shared resize listener (via React state batching)
 * - SSR-safe with sensible defaults
 * - Memoized return object to prevent unnecessary re-renders
 *
 * @returns Object with boolean flags for each breakpoint and current viewport width
 */
export function useBreakpoint(): BreakpointState {
  const [viewportWidth, setViewportWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return window.innerWidth
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleResize = () => {
      setViewportWidth(window.innerWidth)
    }

    // Set initial value
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Memoize the return object to prevent unnecessary re-renders in consumers
  const breakpointState = useMemo<BreakpointState>(
    () => ({
      isSmallLayout: viewportWidth <= BREAKPOINT_SMALL,
      isMobileLayout: viewportWidth <= BREAKPOINT_MOBILE,
      isWideLayout: viewportWidth > BREAKPOINT_WIDE,
      viewportWidth,
    }),
    [viewportWidth]
  )

  return breakpointState
}
