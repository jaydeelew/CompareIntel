import { describe, expect, it } from 'vitest'

import {
  RESULT_GRID_GAP_PX,
  RESULT_GRID_LAYOUT_SLACK_PX,
  RESULT_GRID_MIN_TRACK_PX,
  minViewportWidthForResultsSingleRow,
} from '../../config/constants'

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
