/**
 * useComposerFloat - Controls when the composer floats at the bottom vs stays in hero.
 *
 * When results are loaded:
 * - Composer floats at bottom when user has scrolled past the hero.
 * - Composer returns to hero with smooth transition when user scrolls up
 *   and the hero section comes into view.
 *
 * Uses hysteresis (different thresholds for float vs return) to prevent oscillation
 * when the hero is near the viewport boundary. Without hysteresis, switching between
 * floating and hero changes layout (placeholder vs real composer), which can retrigger
 * the observer and cause the composer to jump back and forth.
 */

import { useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 100
const ROOT_MARGIN_BOTTOM = '80px' // Require hero to be 80px from bottom before "in view"

/** Below this visibility ratio: switch to floating. Above RETURN_THRESHOLD: switch to hero. */
const FLOAT_THRESHOLD = 0.08
const RETURN_THRESHOLD = 0.22

export function useComposerFloat(showResults: boolean, tutorialIsActive: boolean): boolean {
  const [composerFloating, setComposerFloating] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const floatingRef = useRef(composerFloating)

  floatingRef.current = composerFloating

  useEffect(() => {
    if (!showResults || tutorialIsActive) {
      setComposerFloating(false)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      return
    }

    const heroInputSection = document.querySelector('.hero-input-section') as HTMLElement | null
    if (!heroInputSection) return

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (!entry) return
        const ratio = entry.intersectionRatio
        const currentlyFloating = floatingRef.current

        let nextFloating: boolean
        if (ratio < FLOAT_THRESHOLD) {
          nextFloating = true
        } else if (ratio > RETURN_THRESHOLD) {
          nextFloating = false
        } else {
          nextFloating = currentlyFloating
        }

        if (nextFloating === currentlyFloating) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current)
            debounceRef.current = null
          }
          return
        }

        if (debounceRef.current) {
          clearTimeout(debounceRef.current)
        }

        debounceRef.current = setTimeout(() => {
          debounceRef.current = null
          setComposerFloating(nextFloating)
        }, DEBOUNCE_MS)
      },
      {
        root: null,
        rootMargin: `0px 0px -${ROOT_MARGIN_BOTTOM} 0px`,
        threshold: [0, 0.02, 0.05, 0.08, 0.1, 0.15, 0.2, 0.22, 0.25, 0.3, 0.5, 1],
      }
    )

    observer.observe(heroInputSection)
    return () => {
      observer.disconnect()
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [showResults, tutorialIsActive])

  return composerFloating
}
