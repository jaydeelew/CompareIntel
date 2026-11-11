/**
 * Width-based fitting for the hero selected-model icon row.
 * Values match `selectedModelIcons.css` (gap/padding rem, 480px slot breakpoint).
 */

export const SELECTED_MODEL_ICON_MOBILE_MAX_WIDTH = 480

export const SELECTED_MODEL_ICON_GAP_REM = 0.125
export const SELECTED_MODEL_ICON_TRACK_PADDING_INLINE_REM = 0.25

export const SELECTED_MODEL_ICON_SLOT_DESKTOP_PX = 44
export const SELECTED_MODEL_ICON_SLOT_MOBILE_PX = 40

/** Largest overlap per adjacent pair as a fraction of slot width (tap areas may overlap). */
export const SELECTED_MODEL_ICON_MAX_OVERLAP_RATIO = 0.42

/** Minimum slot scale when overlap alone cannot fit the row. */
export const SELECTED_MODEL_ICON_MIN_SLOT_SCALE = 0.86

/** Minimum inner-disc scale when slots are very tight (e.g. 12 @ 320px). */
export const SELECTED_MODEL_ICON_MIN_DISC_SCALE = 0.9

export interface IconTrackFitParams {
  fitted: boolean
  overlapPx: number
  slotPx: number
  discScale: number
}

export interface IconTrackFitInput {
  availableWidthPx: number
  iconCount: number
  slotPx: number
  gapPx: number
  trackPaddingInlinePx: number
  maxOverlapRatio?: number
  minSlotScale?: number
  minDiscScale?: number
}

export function getDefaultIconSlotPx(viewportWidth: number): number {
  return viewportWidth <= SELECTED_MODEL_ICON_MOBILE_MAX_WIDTH
    ? SELECTED_MODEL_ICON_SLOT_MOBILE_PX
    : SELECTED_MODEL_ICON_SLOT_DESKTOP_PX
}

export function getDefaultTrackMetrics(viewportWidth: number, rootFontSizePx = 16): IconTrackFitInput {
  const slotPx = getDefaultIconSlotPx(viewportWidth)
  return {
    availableWidthPx: 0,
    iconCount: 0,
    slotPx,
    gapPx: SELECTED_MODEL_ICON_GAP_REM * rootFontSizePx,
    trackPaddingInlinePx: SELECTED_MODEL_ICON_TRACK_PADDING_INLINE_REM * rootFontSizePx * 2,
  }
}

function naturalTrackWidthPx(
  iconCount: number,
  slotPx: number,
  gapPx: number,
  trackPaddingInlinePx: number
): number {
  if (iconCount <= 0) return trackPaddingInlinePx
  return trackPaddingInlinePx + iconCount * slotPx + (iconCount - 1) * gapPx
}

export function computeIconTrackFit(input: IconTrackFitInput): IconTrackFitParams {
  const {
    availableWidthPx,
    iconCount,
    slotPx,
    gapPx,
    trackPaddingInlinePx,
    maxOverlapRatio = SELECTED_MODEL_ICON_MAX_OVERLAP_RATIO,
    minSlotScale = SELECTED_MODEL_ICON_MIN_SLOT_SCALE,
    minDiscScale = SELECTED_MODEL_ICON_MIN_DISC_SCALE,
  } = input

  const defaultResult: IconTrackFitParams = {
    fitted: false,
    overlapPx: 0,
    slotPx,
    discScale: 1,
  }

  if (iconCount <= 0) return defaultResult

  const natural = naturalTrackWidthPx(iconCount, slotPx, gapPx, trackPaddingInlinePx)
  if (natural <= availableWidthPx + 0.5) {
    return defaultResult
  }

  if (iconCount === 1) {
    const contentBudget = Math.max(0, availableWidthPx - trackPaddingInlinePx)
    const fittedSlot = Math.min(slotPx, contentBudget)
    return {
      fitted: fittedSlot < slotPx - 0.5,
      overlapPx: 0,
      slotPx: fittedSlot,
      discScale: fittedSlot < slotPx * 0.92 ? Math.max(minDiscScale, fittedSlot / slotPx) : 1,
    }
  }

  const contentBudget = availableWidthPx - trackPaddingInlinePx
  const overlapAtFullSlot = (iconCount * slotPx - contentBudget) / (iconCount - 1)
  const maxOverlap = slotPx * maxOverlapRatio

  if (overlapAtFullSlot <= maxOverlap + 0.5 && overlapAtFullSlot >= 0) {
    return {
      fitted: true,
      overlapPx: Math.max(0, overlapAtFullSlot),
      slotPx,
      discScale: 1,
    }
  }

  const denom = iconCount - (iconCount - 1) * maxOverlapRatio
  let scale = contentBudget / (slotPx * denom)
  scale = Math.min(1, Math.max(minSlotScale, scale))

  const effectiveSlot = slotPx * scale
  const overlap = Math.max(0, (iconCount * effectiveSlot - contentBudget) / (iconCount - 1))

  let discScale = 1
  if (effectiveSlot < SELECTED_MODEL_ICON_SLOT_MOBILE_PX - 2) {
    discScale = Math.max(minDiscScale, effectiveSlot / SELECTED_MODEL_ICON_SLOT_MOBILE_PX)
  }

  return {
    fitted: true,
    overlapPx: overlap,
    slotPx: effectiveSlot,
    discScale,
  }
}

/** Row width when fitted (zero gap, constant overlap between siblings). */
export function fittedTrackWidthPx(
  iconCount: number,
  slotPx: number,
  overlapPx: number,
  trackPaddingInlinePx: number
): number {
  if (iconCount <= 0) return trackPaddingInlinePx
  if (iconCount === 1) return trackPaddingInlinePx + slotPx
  return trackPaddingInlinePx + iconCount * slotPx - (iconCount - 1) * overlapPx
}
