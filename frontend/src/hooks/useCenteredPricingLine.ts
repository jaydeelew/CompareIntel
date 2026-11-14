import { useLayoutEffect, type RefObject } from 'react'

import { computeHeroPricingLineTop } from './computeHeroPricingLineTop'

/**
 * Vertically places the hero pricing line in the band between the credits/icon stack
 * and the bottom of `.hero-section` without overlapping either.
 *
 * CSS alone can't reserve this band: the line's containing block is the transformed
 * `.hero-input-section`, and the hero's viewport-driven min-height sets the band size.
 * The line stays absolutely positioned so hero height is unchanged.
 */
export function useCenteredPricingLine(
  lineRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** Bumps when hero meta content changes (models, follow-up, tutorial, credits). */
  layoutRevision: string | number = 0
) {
  useLayoutEffect(() => {
    const line = lineRef.current
    if (!enabled || !line) return
    const hero = line.closest<HTMLElement>('.hero-section')
    const container = line.offsetParent as HTMLElement | null
    if (!hero || !container) return

    let frame = 0
    let mutationFrame = 0

    const measureStackTop = () => {
      const credits = container.querySelector<HTMLElement>('.credits-remaining-wrapper')
      if (!credits) return null
      const creditsBottom = credits.getBoundingClientRect().bottom
      const icons = container.querySelector<HTMLElement>('[data-testid="selected-model-icons"]')
      const iconsBottom = icons?.getBoundingClientRect().bottom
      return Math.max(creditsBottom, iconsBottom ?? creditsBottom)
    }

    const applyPosition = () => {
      const stackTop = measureStackTop()
      if (stackTop == null) return

      const heroBottom = hero.getBoundingClientRect().bottom
      const lineHeight = line.getBoundingClientRect().height
      const containerTop = container.getBoundingClientRect().top
      const topPx = computeHeroPricingLineTop({
        stackTop,
        heroBottom,
        lineHeight,
        containerTop,
      })
      line.style.top = `${topPx}px`
      line.style.bottom = 'auto'
    }

    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(applyPosition)
    }

    update()
    const ro = new ResizeObserver(update)
    const heroContent = hero.querySelector('.hero-content')
    const credits = container.querySelector<HTMLElement>('.credits-remaining-wrapper')
    const icons = container.querySelector<HTMLElement>('[data-testid="selected-model-icons"]')
    ;[hero, container, line, heroContent, credits, icons].forEach(el => el && ro.observe(el))

    const mo = new MutationObserver(() => {
      cancelAnimationFrame(mutationFrame)
      mutationFrame = requestAnimationFrame(update)
    })
    mo.observe(container, { childList: true, subtree: true, characterData: true })

    window.addEventListener('resize', update)
    hero.addEventListener('animationend', update)
    hero.addEventListener('transitionend', update)
    container.addEventListener('transitionend', update)
    document.fonts?.ready.then(update)

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(mutationFrame)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', update)
      hero.removeEventListener('animationend', update)
      hero.removeEventListener('transitionend', update)
      container.removeEventListener('transitionend', update)
    }
  }, [lineRef, enabled, layoutRevision])
}
