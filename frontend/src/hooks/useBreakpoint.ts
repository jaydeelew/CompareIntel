import { useState, useEffect, useMemo } from 'react'

import { BREAKPOINT_SMALL, BREAKPOINT_MOBILE, BREAKPOINT_WIDE } from '../config/constants'

export interface BreakpointState {
  isSmallLayout: boolean // <= 640px
  isMobileLayout: boolean // <= 768px
  isWideLayout: boolean // > 1000px
  viewportWidth: number
}

// Responsive breakpoint detection - use for layout switching
export function useBreakpoint(): BreakpointState {
  const [viewportWidth, setViewportWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return window.innerWidth
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => setViewportWidth(window.innerWidth)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
