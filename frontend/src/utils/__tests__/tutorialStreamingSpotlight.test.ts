import { afterEach, describe, expect, it } from 'vitest'

import { TUTORIAL_STEPS_CONFIG } from '../../data/tutorialSteps'
import {
  advanceFollowUpStreamingRound,
  applyStreamingComparisonHighlight,
  computeTooltipPosition,
  desktopResultsTooltipMinTop,
  readStreamingComparisonSpotlight,
  scrollTutorialRectToCenter,
  streamingResultsTopInViewport,
} from '../tutorialPositioning'

function box(top: number, height: number, width = 640): DOMRect {
  return new DOMRect(40, top, width, height)
}

describe('streaming comparison spotlight', () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect

  afterEach(() => {
    document.body.innerHTML = ''
    HTMLElement.prototype.getBoundingClientRect = originalRect
  })

  function mount(rects: { loading?: DOMRect; results?: DOMRect }) {
    const loading = document.createElement('section')
    loading.className = 'loading-section'
    const results = document.createElement('section')
    results.className = 'results-section'
    document.body.append(loading, results)
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement
    ) {
      if (this === loading && rects.loading) return rects.loading
      if (this === results && rects.results) return rects.results
      return new DOMRect(0, 0, 0, 0)
    }
    return { loading, results }
  }

  it('starts a follow-up round only after step 7 has been idle, and keeps it through the first token', () => {
    const idle = advanceFollowUpStreamingRound({
      step: 'follow-up',
      loading: false,
      followUpSubmitStarted: false,
      streamAnswerStarted: true,
      sawIdle: false,
      round: false,
    })
    expect(idle).toEqual({ sawIdle: true, round: false, startedRound: false })

    const tail = advanceFollowUpStreamingRound({
      step: 'follow-up',
      loading: true,
      followUpSubmitStarted: false,
      streamAnswerStarted: true,
      sawIdle: false,
      round: false,
    })
    expect(tail.round).toBe(false)

    const processing = advanceFollowUpStreamingRound({
      step: 'follow-up',
      loading: true,
      followUpSubmitStarted: false,
      streamAnswerStarted: false,
      sawIdle: idle.sawIdle,
      round: false,
    })
    expect(processing).toEqual({ sawIdle: true, round: true, startedRound: true })

    const streaming = advanceFollowUpStreamingRound({
      step: 'follow-up',
      loading: true,
      followUpSubmitStarted: true,
      streamAnswerStarted: true,
      sawIdle: processing.sawIdle,
      round: processing.round,
    })
    expect(streaming.round).toBe(true)
    expect(streaming.startedRound).toBe(false)

    const cancelled = advanceFollowUpStreamingRound({
      step: 'follow-up',
      loading: false,
      followUpSubmitStarted: true,
      streamAnswerStarted: false,
      sawIdle: true,
      round: true,
    })
    expect(cancelled.round).toBe(false)
  })

  it('keeps the processing panel until the first streamed token, then the results card', () => {
    const { loading, results } = mount({
      loading: box(120, 140),
      results: box(280, 400),
    })

    expect(readStreamingComparisonSpotlight(false)?.kind).toBe('loading')
    expect(applyStreamingComparisonHighlight(false)).toBe('loading')
    expect(loading.classList.contains('tutorial-highlight')).toBe(true)
    expect(results.classList.contains('tutorial-highlight')).toBe(false)

    expect(readStreamingComparisonSpotlight(true)?.kind).toBe('results')
    expect(applyStreamingComparisonHighlight(true)).toBe('results')
    expect(loading.classList.contains('tutorial-highlight')).toBe(false)
    expect(results.classList.contains('tutorial-highlight')).toBe(true)
  })

  it('ignores an empty results card that has no box yet', () => {
    const { loading } = mount({ loading: box(120, 140), results: box(0, 0) })
    expect(readStreamingComparisonSpotlight(false)?.element).toBe(loading)
  })

  it('pulls a tooltip that would sit above a tall results card back into the viewport', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    const placed = computeTooltipPosition(
      box(16, 2400),
      'view-follow-up-results',
      TUTORIAL_STEPS_CONFIG['view-follow-up-results']
    )
    const visualTop = placed.top - 210
    expect(placed.effectivePosition).toBe('top')
    expect(visualTop).toBeGreaterThanOrEqual(12)
    expect(placed.top).toBeLessThanOrEqual(900 - 12)
  })

  it('does not move a tooltip that already meets a frame parked below the reserve', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    const minTop = desktopResultsTooltipMinTop()
    const placed = computeTooltipPosition(
      box(minTop, 2400),
      'view-follow-up-results',
      TUTORIAL_STEPS_CONFIG['view-follow-up-results']
    )
    const frameTop = minTop - 8
    expect(placed.top).toBe(frameTop - 8)
    expect(placed.top - 210).toBeGreaterThanOrEqual(12)
  })

  it('puts streaming results under the header when the mobile card is hidden', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const header = document.createElement('div')
    header.className = 'app-header-shell'
    const tip = document.createElement('div')
    tip.className = 'mobile-tutorial-tooltip'
    tip.style.opacity = '0'
    document.body.append(header, tip)
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement
    ) {
      if (this === header) return new DOMRect(0, 0, 390, 64)
      if (this === tip) return new DOMRect(12, 400, 300, 160)
      return new DOMRect(0, 0, 0, 0)
    }
    expect(streamingResultsTopInViewport()).toBe(76)
  })

  it('keeps a visible mobile card from covering the streaming results', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const header = document.createElement('div')
    header.className = 'app-header-shell'
    const tip = document.createElement('div')
    tip.className = 'mobile-tutorial-tooltip'
    document.body.append(header, tip)
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement
    ) {
      if (this === header) return new DOMRect(0, 0, 390, 64)
      if (this === tip) return new DOMRect(12, 76, 300, 140)
      return new DOMRect(0, 0, 0, 0)
    }
    expect(streamingResultsTopInViewport()).toBe(76 + 140 + 12)
  })

  it('scrolls a tall results card down far enough for the tooltip above it', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    const app = document.createElement('div')
    app.className = 'app'
    Object.defineProperty(app, 'scrollHeight', { configurable: true, value: 4000 })
    Object.defineProperty(app, 'clientHeight', { configurable: true, value: 900 })
    app.scrollTop = 800
    app.scrollTo = (options?: ScrollToOptions | number) => {
      if (typeof options === 'number') {
        app.scrollTop = options
        return
      }
      app.scrollTop = options?.top ?? app.scrollTop
    }
    document.body.appendChild(app)

    const minTop = desktopResultsTooltipMinTop()
    scrollTutorialRectToCenter({ top: 16, height: 2400 }, minTop)
    expect(app.scrollTop).toBe(800 + 16 - minTop)
  })
})
