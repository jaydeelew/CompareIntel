/** Minimum vertical gap (px) between stacked hero meta lines and the pricing block. */
export const HERO_PRICING_STACK_GAP_PX = 2

export interface HeroPricingLineLayoutInput {
  /** Bottom of credits line and/or selected-model icon row (viewport px). */
  stackTop: number
  /** Bottom of `.hero-section` (viewport px). */
  heroBottom: number
  /** Full height of the pricing line including wrapped lines (px). */
  lineHeight: number
  /** Top of the pricing line's offset parent (viewport px). */
  containerTop: number
}

/**
 * Place the pricing line in the credits→hero-bottom band without overlapping content above.
 * When the band is shorter than the line (common on narrow mobile), anchor from the hero bottom
 * instead of centering through the credits line.
 */
export function computeHeroPricingLineTop({
  stackTop,
  heroBottom,
  lineHeight,
  containerTop,
}: HeroPricingLineLayoutInput): number {
  const gap = heroBottom - stackTop
  const minGap = HERO_PRICING_STACK_GAP_PX

  if (gap <= minGap) {
    return stackTop + minGap - containerTop
  }

  let topInViewport: number
  if (lineHeight + minGap <= gap) {
    topInViewport = stackTop + (gap - lineHeight) / 2
  } else {
    topInViewport = heroBottom - lineHeight - minGap
    topInViewport = Math.max(topInViewport, stackTop + minGap)
  }

  return topInViewport - containerTop
}
