import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  defaultVerdictPanelExpanded,
  initialVerdictPanelExpanded,
  readVerdictPanelExpanded,
  VERDICT_PANEL_EXPANDED_KEY,
  writeVerdictPanelExpanded,
} from '../verdictPanelCollapse'

describe('verdictPanelCollapse', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults expanded on desktop and collapsed on mobile', () => {
    expect(defaultVerdictPanelExpanded(1280)).toBe(true)
    expect(defaultVerdictPanelExpanded(768)).toBe(false)
    expect(defaultVerdictPanelExpanded(375)).toBe(false)
  })

  it('persists the expanded flag and prefers it over the viewport default', () => {
    expect(readVerdictPanelExpanded()).toBeNull()
    writeVerdictPanelExpanded(false)
    expect(localStorage.getItem(VERDICT_PANEL_EXPANDED_KEY)).toBe('false')
    expect(readVerdictPanelExpanded()).toBe(false)
    expect(initialVerdictPanelExpanded()).toBe(false)

    writeVerdictPanelExpanded(true)
    expect(readVerdictPanelExpanded()).toBe(true)
  })
})
