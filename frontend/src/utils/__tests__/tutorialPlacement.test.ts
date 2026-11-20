import { describe, expect, it } from 'vitest'

import { placeTooltipBoxAgainstFrame, scrollDeltaToFitTooltip } from '../tutorialPositioning'

describe('placeTooltipBoxAgainstFrame', () => {
  const frame = {
    frameTop: 400,
    frameBottom: 480,
    tooltipHeight: 160,
    arrowSize: 10,
    viewportHeight: 844,
  }

  it('seats the downward arrow on the top edge of the frame', () => {
    const placed = placeTooltipBoxAgainstFrame({ ...frame, preferred: 'above' })
    expect(placed.arrowDirection).toBe('down')
    expect(placed.top + frame.tooltipHeight + frame.arrowSize).toBe(frame.frameTop)
  })

  it('seats the upward arrow on the bottom edge of the frame', () => {
    const placed = placeTooltipBoxAgainstFrame({
      ...frame,
      frameTop: 40,
      frameBottom: 120,
      preferred: 'below',
    })
    expect(placed.arrowDirection).toBe('up')
    expect(placed.top - frame.arrowSize).toBe(120)
  })

  it('uses the side that fits when the preferred side does not', () => {
    const placed = placeTooltipBoxAgainstFrame({
      ...frame,
      frameTop: 80,
      frameBottom: 200,
      preferred: 'above',
    })
    expect(placed.arrowDirection).toBe('up')
    expect(placed.top - frame.arrowSize).toBe(200)
  })

  it('does not scroll when either side already fits', () => {
    expect(
      scrollDeltaToFitTooltip({
        frameTop: 300,
        frameBottom: 400,
        tooltipHeight: 160,
        arrowSize: 10,
        viewportHeight: 844,
        preferred: 'above',
      })
    ).toBe(0)
  })
})
