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

  it('scrolls a below-fold follow-up composer up just enough for the tooltip', () => {
    const delta = followUpScrollDelta({
      composerTop: 900,
      composerBottom: 1000,
      viewportHeight: 844,
      tooltipHeight: 200,
      arrowSize: 10,
      preferred: 'below',
    })
    const needBelow = 200 + 10 + 8 + 12
    expect(delta).toBe(needBelow - (844 - 1000))
    expect(1000 - delta).toBe(844 - needBelow)
  })

  it('leaves a follow-up composer that already has room below it', () => {
    expect(
      followUpScrollDelta({
        composerTop: 400,
        composerBottom: 500,
        viewportHeight: 844,
        tooltipHeight: 180,
        arrowSize: 10,
        preferred: 'below',
      })
    ).toBe(0)
  })

  it('parks the desktop follow-up composer just under the tooltip', () => {
    const delta = followUpScrollDelta({
      composerTop: 700,
      composerBottom: 800,
      viewportHeight: 900,
      tooltipHeight: 210,
      arrowSize: 8,
      preferred: 'above',
    })
    expect(700 - delta).toBe(306)
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
