/**
 * useComposerFloat - Controls when the composer floats at the bottom vs stays in hero.
 *
 * When results are loaded:
 * - Composer floats at bottom when user has scrolled past the hero.
 * - Composer returns to hero with smooth transition when user scrolls up
 *   and the hero section comes into view.
 *
 * Uses debouncing and hysteresis to prevent shaking when the hero is near the viewport boundary.
 */

import { useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 120
const ROOT_MARGIN_BOTTOM = '80px' // Require hero to be 80px from bottom before "in view"

export function useComposerFloat(showResults: boolean, tutorialIsActive: boolean): boolean {
  const [composerFloating, setComposerFloating] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        const shouldBeInHero = entry.isIntersecting

        if (debounceRef.current) {
          clearTimeout(debounceRef.current)
        }

        debounceRef.current = setTimeout(() => {
          debounceRef.current = null
          setComposerFloating(!shouldBeInHero)
        }, DEBOUNCE_MS)
      },
      {
        root: null,
        rootMargin: `0px 0px -${ROOT_MARGIN_BOTTOM} 0px`,
        threshold: 0.15,
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
