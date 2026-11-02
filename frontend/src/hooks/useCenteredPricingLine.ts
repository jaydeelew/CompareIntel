import { useLayoutEffect, type RefObject } from 'react'

/**
 * Vertically centers the hero pricing line between the bottom of the
 * "credits remaining" line and the bottom of `.hero-section`.
 *
 * CSS alone can't do this: the line's containing block is the transformed
 * `.hero-input-section`, which ends well above the hero's bottom, and the space
 * below it depends on the hero's viewport-driven min-height. The line is
 * absolutely positioned, so this adds no layout height.
 */
export function useCenteredPricingLine(lineRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const line = lineRef.current
    if (!enabled || !line) return
    const hero = line.closest<HTMLElement>('.hero-section')
    const container = line.offsetParent as HTMLElement | null
    if (!hero || !container) return

    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const credits = container.querySelector<HTMLElement>('.credits-remaining-wrapper')
        if (!credits) return
        const above = credits.getBoundingClientRect().bottom
        const below = hero.getBoundingClientRect().bottom
        const lineHeight = line.getBoundingClientRect().height
        const top = above + (below - above - lineHeight) / 2
        line.style.top = `${top - container.getBoundingClientRect().top}px`
        line.style.bottom = 'auto'
      })
    }

    update()
    const ro = new ResizeObserver(update)
    ;[hero, container, line, hero.querySelector('.hero-content')].forEach(el => el && ro.observe(el))
    window.addEventListener('resize', update)
    hero.addEventListener('animationend', update)
    hero.addEventListener('transitionend', update)
    document.fonts?.ready.then(update)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', update)
      hero.removeEventListener('animationend', update)
      hero.removeEventListener('transitionend', update)
    }
  }, [lineRef, enabled])
}
