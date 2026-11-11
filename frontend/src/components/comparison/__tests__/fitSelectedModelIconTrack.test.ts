import { describe, expect, it } from 'vitest'

import {
  computeIconTrackFit,
  fittedTrackWidthPx,
  getDefaultTrackMetrics,
  SELECTED_MODEL_ICON_SLOT_MOBILE_PX,
} from '../fitSelectedModelIconTrack'

const ROOT = 16

function metricsForViewport(viewportWidth: number) {
  return getDefaultTrackMetrics(viewportWidth, ROOT)
}

describe('computeIconTrackFit', () => {
  it('keeps default layout when the row fits at normal spacing', () => {
    const m = metricsForViewport(412)
    const fit = computeIconTrackFit({ ...m, availableWidthPx: 412, iconCount: 9 })
    expect(fit.fitted).toBe(false)
    expect(fit.overlapPx).toBe(0)
    expect(fit.slotPx).toBe(SELECTED_MODEL_ICON_SLOT_MOBILE_PX)
  })

  it('fits 12 icons at 360px with overlap only (discs unchanged)', () => {
    const m = metricsForViewport(360)
    const fit = computeIconTrackFit({ ...m, availableWidthPx: 360, iconCount: 12 })
    expect(fit.fitted).toBe(true)
    expect(fit.discScale).toBe(1)
    const width = fittedTrackWidthPx(12, fit.slotPx, fit.overlapPx, m.trackPaddingInlinePx)
    expect(width).toBeLessThanOrEqual(360 + 0.5)
  })

  it('fits 12 icons at 320px within the row budget', () => {
    const m = metricsForViewport(320)
    const fit = computeIconTrackFit({ ...m, availableWidthPx: 320, iconCount: 12 })
    expect(fit.fitted).toBe(true)
    const width = fittedTrackWidthPx(12, fit.slotPx, fit.overlapPx, m.trackPaddingInlinePx)
    expect(width).toBeLessThanOrEqual(320 + 0.5)
  })

  const mobileWidths = [320, 360, 390, 412] as const
  const counts = [6, 8, 9, 12] as const

  for (const availableWidthPx of mobileWidths) {
    for (const iconCount of counts) {
      it(`fits ${iconCount} icons at ${availableWidthPx}px without exceeding width`, () => {
        const m = metricsForViewport(availableWidthPx)
        const fit = computeIconTrackFit({ ...m, availableWidthPx, iconCount })
        if (!fit.fitted) {
          const natural =
            m.trackPaddingInlinePx +
            iconCount * m.slotPx +
            (iconCount - 1) * m.gapPx
          expect(natural).toBeLessThanOrEqual(availableWidthPx + 0.5)
          return
        }
        const width = fittedTrackWidthPx(
          iconCount,
          fit.slotPx,
          fit.overlapPx,
          m.trackPaddingInlinePx
        )
        expect(width).toBeLessThanOrEqual(availableWidthPx + 0.5)
        expect(fit.overlapPx).toBeGreaterThanOrEqual(0)
      })
    }
  }

  it('does not compact 6 icons on desktop widths when they fit', () => {
    const m = metricsForViewport(1280)
    const fit = computeIconTrackFit({ ...m, availableWidthPx: 600, iconCount: 6 })
    expect(fit.fitted).toBe(false)
  })
})
