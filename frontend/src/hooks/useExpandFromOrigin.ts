import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Stacking window for the hero capability tile and the verdict logo.
 * Slightly longer than the 0.7s transform so z-index stays elevated until
 * the CSS transition finishes. The CSS custom property is the shared source
 * when styles are loaded; 750 matches the previous hero timer.
 */
export const EXPAND_FROM_ORIGIN_STACK_MS = 750

export function expandFromOriginStackMs(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return EXPAND_FROM_ORIGIN_STACK_MS
  }
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--expand-from-origin-stack-ms')
    .trim()
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : EXPAND_FROM_ORIGIN_STACK_MS
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useLayoutEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return reduced
}

/**
 * Same stacking pattern as the hero capability tile: when `active` flips,
 * elevate before paint, then drop after the shared stack timer.
 * Reduced motion does not change this flag — callers add an instant class
 * so the transform itself is skipped without changing the hero tile.
 */
export function useExpandFromOrigin(active: boolean): { stackElevated: boolean } {
  const [stackElevated, setStackElevated] = useState(false)
  const prevRef = useRef(active)

  useLayoutEffect(() => {
    if (prevRef.current === active) return
    prevRef.current = active
    setStackElevated(true)
    const id = window.setTimeout(() => setStackElevated(false), expandFromOriginStackMs())
    return () => window.clearTimeout(id)
  }, [active])

  return { stackElevated }
}
