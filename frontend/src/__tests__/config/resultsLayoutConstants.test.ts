import { describe, expect, it } from 'vitest'

import {
  RESULT_GRID_GAP_PX,
  RESULT_GRID_LAYOUT_SLACK_PX,
  RESULT_GRID_MIN_TRACK_PX,
  minResultsHostWidthForGridColumns,
  minViewportWidthForResultsSingleRow,
} from '../../config/constants'

describe('minResultsHostWidthForGridColumns', () => {
  it('returns 0 for non-positive column counts', () => {
    expect(minResultsHostWidthForGridColumns(0)).toBe(0)
    expect(minResultsHostWidthForGridColumns(-1)).toBe(0)
  })

  it('matches tracks plus gaps only (no viewport slack)', () => {
    const n = 3
    expect(minResultsHostWidthForGridColumns(n)).toBe(
      n * RESULT_GRID_MIN_TRACK_PX + (n - 1) * RESULT_GRID_GAP_PX
    )
  })
})

describe('minViewportWidthForResultsSingleRow', () => {
  it('returns 0 for 0 or 1 models', () => {
    expect(minViewportWidthForResultsSingleRow(0)).toBe(0)
    expect(minViewportWidthForResultsSingleRow(1)).toBe(0)
  })

  it('matches grid track count plus slack', () => {
    const n = 3
    expect(minViewportWidthForResultsSingleRow(n)).toBe(
      n * RESULT_GRID_MIN_TRACK_PX + (n - 1) * RESULT_GRID_GAP_PX + RESULT_GRID_LAYOUT_SLACK_PX
    )
  })
})
