import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  deferScroll,
  followUpScrollDelta,
  historyPairScrollDelta,
  placeTooltipBoxAgainstFrame,
  scrollDeltaToFitTooltip,
  visibleViewportHeight,
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

describe('historyPairScrollDelta', () => {
  const view = { viewportTop: 0, viewportHeight: 800, tooltipHeight: 180, arrowSize: 10 }

  it('returns zero when the tooltip and composer already share the visual middle', () => {
    const above = view.tooltipHeight + view.arrowSize
    const composerHeight = 160
    const composerTop = view.viewportHeight / 2 - (composerHeight - above) / 2
    expect(
      historyPairScrollDelta({
        ...view,
        composerTop,
        composerHeight,
      })
    ).toBe(0)
  })

  it('moves a bottom-pinned composer up until the pair is centered', () => {
    const delta = historyPairScrollDelta({
      ...view,
      composerTop: 640,
      composerHeight: 160,
    })
    expect(delta).toBe(225)
    const composerTop = 640 - delta
    const pairTop = composerTop - (view.tooltipHeight + view.arrowSize)
    const pairBottom = composerTop + 160
    expect((pairTop + pairBottom) / 2).toBe(view.viewportHeight / 2)
  })

  it('uses the visual viewport offset when browser chrome shifts the visible area', () => {
    const delta = historyPairScrollDelta({
      ...view,
      viewportTop: 120,
      viewportHeight: 640,
      composerTop: 620,
      composerHeight: 140,
    })
    const above = view.tooltipHeight + view.arrowSize
    const desired = 120 + 640 / 2 - (140 - above) / 2
    expect(delta).toBe(620 - desired)
  })

  it('moves a composer that sits too high down by the same rule', () => {
    const delta = historyPairScrollDelta({
      ...view,
      composerTop: 80,
      composerHeight: 160,
    })
    expect(delta).toBe(80 - 415)
  })
})

describe('visibleViewportHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the shorter visual viewport on a phone', () => {
    vi.stubGlobal('innerHeight', 844)
    vi.stubGlobal('visualViewport', { height: 664 })
    expect(visibleViewportHeight()).toBe(664)
  })

  it('uses the layout viewport when the visual viewport is missing', () => {
    vi.stubGlobal('innerHeight', 900)
    vi.stubGlobal('visualViewport', undefined)
    expect(visibleViewportHeight()).toBe(900)
  })
})

describe('deferScroll', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('scrolls after the frame and the delay', () => {
    vi.useFakeTimers()
    const scroll = vi.fn()
    deferScroll(scroll, 100)
    vi.runAllTimers()
    expect(scroll).toHaveBeenCalledOnce()
  })

  it('does not scroll after cancel, including a frame that was already queued', () => {
    vi.useFakeTimers()
    const scroll = vi.fn()
    const cancel = deferScroll(scroll, 100)
    cancel()
    vi.runAllTimers()
    expect(scroll).not.toHaveBeenCalled()
  })

  it('does not scroll when cancelled after the frame but before the delay', () => {
    vi.useFakeTimers()
    const scroll = vi.fn()
    const cancel = deferScroll(scroll, 100)
    vi.advanceTimersToNextFrame()
    cancel()
    vi.advanceTimersByTime(100)
    expect(scroll).not.toHaveBeenCalled()
  })
})
