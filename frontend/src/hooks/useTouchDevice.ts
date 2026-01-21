import { useState, useEffect } from 'react'

// Detects touch capability - used to disable hover tooltips on mobile
export function useTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  })

  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
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
