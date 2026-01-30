/**
 * Custom hook for managing animation state
 *
 * This hook consolidates animation-related state management that was previously
 * handled through multiple useEffects. By providing direct methods to control
 * animation state, we avoid cascading state updates and useEffect anti-patterns.
 *
 * Key improvements:
 * 1. Animation clearing happens directly in event handlers, not via useEffect
 * 2. Scroll-based animation clearing is handled via a single effect with cleanup
 * 3. Timeout management is centralized
 */

import { useState, useCallback, useRef, useEffect } from 'react'

export interface UseAnimationStateConfig {
  /** Ref to the element that should trigger animation clearing on scroll into view */
  targetElementRef?: React.RefObject<HTMLElement>
}

export interface UseAnimationStateReturn {
  /** Whether the button is currently animating */
  isAnimatingButton: boolean
  /** Whether the textarea is currently animating */
  isAnimatingTextarea: boolean

  /** Start button animation */
  startButtonAnimation: () => void
  /** Start textarea animation */
  startTextareaAnimation: () => void
  /** Stop all animations (call this when user interacts) */
  stopAllAnimations: () => void
  /** Stop animations and clear any pending timeouts */
  clearAnimations: () => void

  /**
   * Enhanced input change handler that clears animations when user types.
   * Wrap your setInput calls with this to automatically clear animations.
   */
  handleInputWithAnimationClear: <T>(handler: () => T) => T
}

export function useAnimationState(config: UseAnimationStateConfig = {}): UseAnimationStateReturn {
  const { targetElementRef } = config

  const [isAnimatingButton, setIsAnimatingButton] = useState(false)
  const [isAnimatingTextarea, setIsAnimatingTextarea] = useState(false)
  const animationTimeoutRef = useRef<number | null>(null)

  /**
   * Clear any pending animation timeout
   */
  const clearAnimationTimeout = useCallback(() => {
    if (animationTimeoutRef.current !== null) {
      window.clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = null
    }
  }, [])

  /**
   * Stop all animations immediately
   */
  const stopAllAnimations = useCallback(() => {
    clearAnimationTimeout()
    setIsAnimatingButton(false)
    setIsAnimatingTextarea(false)
  }, [clearAnimationTimeout])

  /**
   * Start button animation
   */
  const startButtonAnimation = useCallback(() => {
    setIsAnimatingButton(true)
  }, [])

  /**
   * Start textarea animation
   */
  const startTextareaAnimation = useCallback(() => {
    setIsAnimatingTextarea(true)
  }, [])

  /**
   * Clear animations with full cleanup
   */
  const clearAnimations = useCallback(() => {
    stopAllAnimations()
  }, [stopAllAnimations])

  /**
   * Wrapper for handlers that should clear animations
   * This replaces the useEffect that watched input changes
   */
  const handleInputWithAnimationClear = useCallback(
    <T>(handler: () => T): T => {
      // If animations are active, clear them
      if (isAnimatingButton || isAnimatingTextarea) {
        stopAllAnimations()
      }
      // Execute the actual handler
      return handler()
    },
    [isAnimatingButton, isAnimatingTextarea, stopAllAnimations]
  )

  /**
   * Effect to handle scroll-based animation clearing
   * This is a legitimate use of useEffect for external event subscription
   */
  useEffect(() => {
    const handleScroll = () => {
      // Clear any pending timeout
      clearAnimationTimeout()
      setIsAnimatingButton(false)
      setIsAnimatingTextarea(false)

      // Check if target element is in view
      if (targetElementRef?.current) {
        const rect = targetElementRef.current.getBoundingClientRect()
        const isInView = rect.top < window.innerHeight && rect.bottom > 0

        if (isInView) {
          setIsAnimatingButton(false)
          setIsAnimatingTextarea(false)
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearAnimationTimeout()
    }
  }, [targetElementRef, clearAnimationTimeout])

  return {
    isAnimatingButton,
    isAnimatingTextarea,
    startButtonAnimation,
    startTextareaAnimation,
    stopAllAnimations,
    clearAnimations,
    handleInputWithAnimationClear,
  }
}
