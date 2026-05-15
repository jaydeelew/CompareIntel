import { useState, useEffect, useMemo } from 'react'

import {
  BREAKPOINT_CAPABILITY_ICON_ROW,
  BREAKPOINT_SMALL,
  BREAKPOINT_MOBILE,
  BREAKPOINT_WIDE,
  BREAKPOINT_TABLET,
  BREAKPOINT_LARGE_TOUCH_TOOLTIP_MODAL_MAX,
} from '../config/constants'

/** Primary pointing device is mouse-like (hover + precise cursor). Used for desktop-style hover tooltips on narrow viewports. */
const FINE_POINTER_HOVER_MQ = '(hover: hover) and (pointer: fine)'

export interface ResponsiveState {
  // Breakpoints
  isSmallLayout: boolean // <= 640px
  isMobileLayout: boolean // <= 768px
  isTabletLayout: boolean // 769px–1024px
  /** Compact hero capability row (icon-only tiles + flipped text demo). Matches hero.css max-width 900px. */
  isCapabilityIconRowLayout: boolean
  isWideLayout: boolean // > 1000px
  viewportWidth: number
  /**
   * Use tap-to-open info modals instead of hover tooltips (phones, tablet band, wide touch slates).
   */
  useModalForTooltips: boolean
  // Touch detection
  isTouchDevice: boolean
  /** True when the environment supports hover with a fine pointer (e.g. mouse). */
  prefersFinePointerHover: boolean
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

  const [prefersFinePointerHover, setPrefersFinePointerHover] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(FINE_POINTER_HOVER_MQ).matches
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(FINE_POINTER_HOVER_MQ)
    const sync = () => setPrefersFinePointerHover(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return useMemo<ResponsiveState>(
    () => ({
      isSmallLayout: viewportWidth <= BREAKPOINT_SMALL,
      isMobileLayout: viewportWidth <= BREAKPOINT_MOBILE,
      isTabletLayout: viewportWidth > BREAKPOINT_MOBILE && viewportWidth <= BREAKPOINT_TABLET,
      isCapabilityIconRowLayout: viewportWidth <= BREAKPOINT_CAPABILITY_ICON_ROW,
      isWideLayout: viewportWidth > BREAKPOINT_WIDE,
      viewportWidth,
      useModalForTooltips:
        viewportWidth <= BREAKPOINT_TABLET ||
        (isTouchDevice &&
          viewportWidth > BREAKPOINT_TABLET &&
          viewportWidth <= BREAKPOINT_LARGE_TOUCH_TOOLTIP_MODAL_MAX),
      isTouchDevice,
      prefersFinePointerHover,
    }),
    [viewportWidth, isTouchDevice, prefersFinePointerHover]
  )
}
