import { useState, useEffect, useMemo } from 'react'

import { BREAKPOINT_SMALL, BREAKPOINT_MOBILE, BREAKPOINT_WIDE } from '../config/constants'

export interface ResponsiveState {
  // Breakpoints
  isSmallLayout: boolean // <= 640px
  isMobileLayout: boolean // <= 768px
  isWideLayout: boolean // > 1000px
  viewportWidth: number
  // Touch detection
  isTouchDevice: boolean
}

// Combined responsive detection hook - breakpoints + touch capability
export function useResponsive(): ResponsiveState {
  const [viewportWidth, setViewportWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return window.innerWidth
  })

  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleResize = () => {
      setViewportWidth(window.innerWidth)
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  return useMemo<ResponsiveState>(
    () => ({
      isSmallLayout: viewportWidth <= BREAKPOINT_SMALL,
      isMobileLayout: viewportWidth <= BREAKPOINT_MOBILE,
      isWideLayout: viewportWidth > BREAKPOINT_WIDE,
      viewportWidth,
      isTouchDevice,
    }),
    [viewportWidth, isTouchDevice]
  )
}
