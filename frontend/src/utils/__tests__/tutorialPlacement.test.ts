import { describe, expect, it } from 'vitest'

import {
  followUpScrollDelta,
  placeTooltipBoxAgainstFrame,
  scrollDeltaToFitTooltip,
} from '../tutorialPositioning'

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

  it('keeps a tall follow-up composer against the tooltip below it', () => {
    const delta = followUpScrollDelta({
      blockTop: 0,
      composerTop: 900,
      composerBottom: 1000,
      viewportHeight: 844,
      tooltipHeight: 200,
      arrowSize: 10,
      preferred: 'below',
    })
    expect(1000 - delta).toBe(844 - (200 + 10 + 12))
  })

  it('keeps a tall follow-up composer under the tooltip above it', () => {
    const delta = followUpScrollDelta({
      blockTop: 0,
      composerTop: 900,
      composerBottom: 1000,
      viewportHeight: 900,
      tooltipHeight: 210,
      arrowSize: 8,
      preferred: 'above',
    })
    expect(900 - delta).toBe(210 + 8 + 12)
  })

  it('centers a short follow-up block in the space beside the tooltip', () => {
    const delta = followUpScrollDelta({
      blockTop: 40,
      composerTop: 360,
      composerBottom: 440,
      viewportHeight: 844,
      tooltipHeight: 180,
      arrowSize: 10,
      preferred: 'below',
    })
    const need = 180 + 10 + 12
    const blockHeight = 400
    const desiredTop = Math.max(12, (844 - need - blockHeight) / 2)
    expect(delta).toBeCloseTo(40 - desiredTop)
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
