/**
 * Hook to detect if the current device supports touch input
 * Useful for showing alternative UI patterns on touch devices where hover tooltips don't work
 */

import { useState, useEffect } from 'react'

/**
 * Detects if the current device supports touch input
 * @returns true if device supports touch, false otherwise
 */
export function useTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false

    // Check for touch support
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error - some browsers may have this
      (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0)
    )
  })

  useEffect(() => {
    // Re-check on resize/orientation change (for devices that can switch modes)
    const checkTouch = () => {
      setIsTouchDevice(
        'ontouchstart' in window ||
          navigator.maxTouchPoints > 0 ||
          // @ts-expect-error - some browsers may have this
          (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0)
      )
    }

    window.addEventListener('resize', checkTouch)
    window.addEventListener('orientationchange', checkTouch)

    return () => {
      window.removeEventListener('resize', checkTouch)
      window.removeEventListener('orientationchange', checkTouch)
    }
  }, [])

  return isTouchDevice
}
