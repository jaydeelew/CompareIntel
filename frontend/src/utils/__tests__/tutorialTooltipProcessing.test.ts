import { afterEach, describe, expect, it } from 'vitest'

import { TUTORIAL_STEPS_CONFIG } from '../../data/tutorialSteps'
import {
  clearTutorialFooterBackdrop,
  computeTooltipPosition,
  desktopTooltipClearOfProcessingPanel,
  readTooltipAnchorAvoidingProcessingPanel,
  syncTutorialFooterWithHero,
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
    const composer = box(700, 80, 80, 480)
    mount({ loading: panel, results, composer })
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
    expect(decision?.hideArrow).toBe(false)
    expect(decision?.anchor.top).toBe(700)
    expect(decision?.anchor.height).toBe(80)
  })
})

describe('footer veil continues the hero under the overlay', () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect

  afterEach(() => {
    document.body.innerHTML = ''
    HTMLElement.prototype.getBoundingClientRect = originalRect
  })

  it('copies the hero gradient onto the footer only while a clipped dim is up', () => {
    const hero = document.createElement('section')
    hero.className = 'hero-section'
    hero.style.backgroundImage = 'linear-gradient(135deg, #132044 0%, #1e3a8a 50%, #132044 100%)'
    const footer = document.createElement('footer')
    const nav = document.createElement('nav')
    nav.setAttribute('aria-label', 'Footer navigation')
    footer.append(nav)
    const cutout = document.createElement('div')
    cutout.className = 'tutorial-backdrop-cutout'
    document.body.append(hero, footer, cutout)
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement
    ) {
      if (this === hero) return new DOMRect(0, 0, 800, 600)
      if (this === footer) return new DOMRect(0, 600, 800, 120)
      return new DOMRect(0, 0, 0, 0)
    }
    syncTutorialFooterWithHero()
    expect(footer.style.backgroundImage).toContain('linear-gradient')
    expect(footer.style.backgroundSize).toBe('800px 600px')
    expect(footer.style.backgroundPosition).toBe('0px -600px')
    expect(footer.style.backgroundColor).toBe('rgb(19, 32, 68)')
    cutout.remove()
    syncTutorialFooterWithHero()
    expect(footer.style.backgroundImage).toBe('')
    clearTutorialFooterBackdrop()
  })
})
