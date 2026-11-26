import { afterEach, describe, expect, it } from 'vitest'

import { TUTORIAL_STEPS_CONFIG } from '../../data/tutorialSteps'
import {
  computeTooltipPosition,
  desktopTooltipClearOfProcessingPanel,
  readTooltipAnchorAvoidingProcessingPanel,
} from '../tutorialPositioning'

function box(top: number, height: number, left = 40, width = 640): DOMRect {
  return new DOMRect(left, top, width, height)
}

describe('tooltip stays off the processing panel', () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect

  afterEach(() => {
    document.body.innerHTML = ''
    HTMLElement.prototype.getBoundingClientRect = originalRect
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
  })

  function mount(rects: { loading?: DOMRect; composer?: DOMRect; results?: DOMRect }) {
    const loading = document.createElement('section')
    loading.className = 'loading-section'
    const composer = document.createElement('div')
    composer.className = 'composer'
    const results = document.createElement('section')
    results.className = 'results-section'
    document.body.append(loading, composer, results)
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement
    ) {
      if (this === loading && rects.loading) return rects.loading
      if (this === composer && rects.composer) return rects.composer
      if (this === results && rects.results) return rects.results
      return new DOMRect(0, 0, 0, 0)
    }
    return { loading, composer, results }
  }

  it('keeps the arrow on the composer when that card does not cover the panel', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    const composer = box(620, 80, 80, 480)
    mount({ loading: box(120, 140), composer, results: box(280, 200) })
    const placed = desktopTooltipClearOfProcessingPanel(
      box(120, 140),
      'submit-comparison',
      TUTORIAL_STEPS_CONFIG['submit-comparison']
    )
    const aimed = computeTooltipPosition(
      composer,
      'submit-comparison',
      TUTORIAL_STEPS_CONFIG['submit-comparison']
    )
    expect(placed.hideArrow).toBe(false)
    expect(placed.top).toBe(aimed.top)
    expect(placed.left).toBe(aimed.left)
    expect(placed.effectivePosition).toBe(aimed.effectivePosition)
  })

  it('floats without an arrow when the only seats would cover the processing panel', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    const panel = box(120, 160)
    mount({
      loading: panel,
      composer: box(40, 80, 40, 320),
      results: box(300, 400),
    })
    const placed = desktopTooltipClearOfProcessingPanel(
      panel,
      'submit-comparison',
      TUTORIAL_STEPS_CONFIG['submit-comparison']
    )
    expect(placed.hideArrow).toBe(true)
    expect(placed.top).toBeGreaterThanOrEqual(panel.bottom)
    expect(placed.top + 210).toBeLessThanOrEqual(900)
  })

  it('does not choose the processing panel as the review anchor', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    const panel = box(80, 180)
    const results = box(280, 500)
    mount({ loading: panel, results, composer: box(40, 40, 40, 200) })
    const decision = readTooltipAnchorAvoidingProcessingPanel({
      requested: panel,
      step: 'view-follow-up-results',
      providerNames: [],
      tooltipHeight: 210,
      arrowSize: 8,
      viewportTop: 0,
      viewportHeight: 900,
      preferred: 'above',
    })
    expect(decision).not.toBeNull()
    expect(decision?.anchor.top).not.toBe(panel.top)
    expect(decision?.anchor.height).not.toBe(panel.height)
  })
})
