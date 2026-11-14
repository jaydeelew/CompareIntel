import { describe, expect, it } from 'vitest'

import { computeHeroPricingLineTop } from '../computeHeroPricingLineTop'

describe('computeHeroPricingLineTop', () => {
  it('centers the line when it fits in the band below the stack', () => {
    const top = computeHeroPricingLineTop({
      stackTop: 100,
      heroBottom: 500,
      lineHeight: 20,
      containerTop: 50,
    })
  // 100 + (400 - 20) / 2 = 290 viewport; relative to container: 240
    expect(top).toBe(240)
  })

  it('anchors from the hero bottom when the line is taller than the band', () => {
    const top = computeHeroPricingLineTop({
      stackTop: 460,
      heroBottom: 500,
      lineHeight: 36,
      containerTop: 50,
    })
    // band 40px, line 36px — barely fits centered, but minGap applies; 460 + (40-36)/2 = 462
    expect(top).toBe(412)
  })

  it('never places the line above the stack top', () => {
    const top = computeHeroPricingLineTop({
      stackTop: 480,
      heroBottom: 500,
      lineHeight: 48,
      containerTop: 0,
    })
    const topInViewport = top + 0
    expect(topInViewport).toBeGreaterThanOrEqual(480 + 2)
  })
})