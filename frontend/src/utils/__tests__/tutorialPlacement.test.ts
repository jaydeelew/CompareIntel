import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  chooseReviewTooltipSide,
  clampTooltipTop,
  deferScroll,
  followUpScrollDelta,
  historyPairScrollDelta,
  placeReviewTooltip,
  placeTooltipBoxAgainstFrame,
  readTutorialContentOrigin,
  resetReviewTooltipSide,
  REVIEW_TOOLTIP_HYSTERESIS_PX,
  scrollContentOffset,
  scrollDeltaToFitTooltip,
  visibleViewportHeight,
  withScrollAnchor,
} from '../tutorialPositioning'
import { tutorialBoxesNearlyEqual } from '../tutorialSettle'

describe('clampTooltipTop', () => {
  it('pulls a card that sits above the visual viewport back into view', () => {
    expect(
      clampTooltipTop({
        top: -240,
        height: 180,
        viewportTop: 40,
        viewportHeight: 700,
        padding: 12,
      })
    ).toBe(52)
  })

  it('pulls a card that sits under the browser chrome back up', () => {
    expect(
      clampTooltipTop({
        top: 640,
        height: 180,
        viewportTop: 0,
        viewportHeight: 700,
        padding: 12,
      })
    ).toBe(508)
  })

  it('leaves a card that already fits', () => {
    expect(
      clampTooltipTop({
        top: 120,
        height: 180,
        viewportTop: 0,
        viewportHeight: 800,
        padding: 12,
      })
    ).toBe(120)
  })
})

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

  it('stops the below-composer tooltip at the page footer', () => {
    const delta = followUpScrollDelta({
      composerTop: 420,
      composerBottom: 500,
      viewportHeight: 844,
      tooltipHeight: 180,
      arrowSize: 10,
      preferred: 'below',
      footerTop: 620,
    })
    const needBelow = 180 + 10 + 8 + 12
    expect(delta).toBe(needBelow - (620 - 500))
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

  it('keeps a scroll-layer box on the same content point after the viewport moves', () => {
    const app = document.createElement('div')
    app.className = 'app'
    Object.defineProperty(app, 'scrollHeight', { value: 2000 })
    Object.defineProperty(app, 'clientHeight', { value: 400 })
    Object.defineProperty(app, 'clientTop', { value: 0 })
    Object.defineProperty(app, 'clientLeft', { value: 0 })
    app.scrollTop = 0
    app.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400)
    document.body.appendChild(app)

    const before = withScrollAnchor({ top: 500, left: 40 })
    app.scrollTop = 280
    const after = withScrollAnchor({ top: 220, left: 40 })
    expect(scrollContentOffset(before)).toEqual({ top: 500, left: 40 })
    expect(scrollContentOffset(after)).toEqual({ top: 500, left: 40 })
    expect(readTutorialContentOrigin().y).toBe(-280)
    expect(
      tutorialBoxesNearlyEqual(
        { ...before, width: 80, height: 40 },
        { ...after, width: 80, height: 40 }
      )
    ).toBe(true)
    app.remove()
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

describe('step 8 review card follows the visible edge', () => {
  const view = { viewportTop: 0, viewportHeight: 844 }
  const card = { tooltipHeight: 180, arrowSize: 10, padding: 12 }

  afterEach(() => {
    resetReviewTooltipSide()
  })

  it('points down from above while the panel top is on screen', () => {
    const placed = placeReviewTooltip({
      frameTop: 280,
      frameBottom: 900,
      ...card,
      ...view,
      stickySide: 'above',
    })
    expect(placed.arrowDirection).toBe('down')
    expect(placed.top + card.tooltipHeight + card.arrowSize).toBe(280)
  })

  it('points up from just under the panel once the top edge has left', () => {
    const placed = placeReviewTooltip({
      frameTop: -80,
      frameBottom: 640,
      ...card,
      ...view,
      stickySide: 'above',
    })
    expect(placed.arrowDirection).toBe('up')
    expect(placed.top - card.arrowSize).toBe(640)
  })

  it('does not flip while the top edge is still inside the hysteresis band', () => {
    const barelyGone = placeReviewTooltip({
      frameTop: -(REVIEW_TOOLTIP_HYSTERESIS_PX - 4),
      frameBottom: 700,
      ...card,
      ...view,
      stickySide: 'above',
    })
    expect(barelyGone.arrowDirection).toBe('down')
    const clearlyGone = chooseReviewTooltipSide({
      frameTop: -(REVIEW_TOOLTIP_HYSTERESIS_PX + 4),
      viewportTop: 0,
      viewportBottom: 844,
      previous: 'above',
    })
    expect(clearlyGone).toBe('below')
    const barelyBack = chooseReviewTooltipSide({
      frameTop: REVIEW_TOOLTIP_HYSTERESIS_PX - 4,
      viewportTop: 0,
      viewportBottom: 844,
      previous: 'below',
    })
    expect(barelyBack).toBe('below')
    const clearlyBack = chooseReviewTooltipSide({
      frameTop: REVIEW_TOOLTIP_HYSTERESIS_PX + 4,
      viewportTop: 0,
      viewportBottom: 844,
      previous: 'below',
    })
    expect(clearlyBack).toBe('above')
  })

  it('sits on the panel bottom even when the composer fills the space below', () => {
    const frameBottom = 490
    const placed = placeReviewTooltip({
      frameTop: -120,
      frameBottom,
      ...card,
      ...view,
      stickySide: 'above',
    })
    expect(placed.arrowDirection).toBe('up')
    expect(placed.top).toBe(frameBottom + card.arrowSize)
  })
})
