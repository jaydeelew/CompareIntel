import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  focusFollowUpComposerTextarea,
  landOnFollowUpComposerAfterTutorial,
} from '../tutorialPositioning'

describe('tutorialPositioning post-tutorial landing', () => {
  let app: HTMLElement

  beforeEach(() => {
    app = document.createElement('div')
    app.className = 'app'
    Object.defineProperty(app, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(app, 'clientHeight', { value: 800, configurable: true })
    app.scrollTo = vi.fn()
    document.body.appendChild(app)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('focusFollowUpComposerTextarea prefers the below-results composer textarea', () => {
    const heroTextarea = document.createElement('textarea')
    heroTextarea.setAttribute('data-testid', 'comparison-input-textarea')
    document.body.appendChild(heroTextarea)

    const slot = document.createElement('div')
    slot.setAttribute('data-after-results-composer-slot', '')
    const belowTextarea = document.createElement('textarea')
    belowTextarea.setAttribute('data-testid', 'comparison-input-textarea')
    Object.defineProperty(belowTextarea, 'getBoundingClientRect', {
      value: () => ({ width: 300, height: 40, top: 0, left: 0, right: 300, bottom: 40 }),
    })
    slot.appendChild(belowTextarea)
    document.body.appendChild(slot)

    belowTextarea.focus = vi.fn()

    expect(focusFollowUpComposerTextarea()).toBe(true)
    expect(belowTextarea.focus).toHaveBeenCalled()
  })

  it('landOnFollowUpComposerAfterTutorial scrolls the app root to the bottom', () => {
    vi.useFakeTimers()

    const slot = document.createElement('div')
    slot.setAttribute('data-after-results-composer-slot', '')
    const belowTextarea = document.createElement('textarea')
    belowTextarea.setAttribute('data-testid', 'comparison-input-textarea')
    Object.defineProperty(belowTextarea, 'getBoundingClientRect', {
      value: () => ({ width: 300, height: 40, top: 0, left: 0, right: 300, bottom: 40 }),
    })
    belowTextarea.focus = vi.fn()
    slot.appendChild(belowTextarea)
    document.body.appendChild(slot)

    landOnFollowUpComposerAfterTutorial()

    expect(app.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 1200, behavior: 'auto' })
    )

    vi.runAllTimers()
    vi.useRealTimers()
  })
})
