import { afterEach, describe, expect, it } from 'vitest'

import {
  followUpComposerAdvanceDecision,
  isFollowUpComposerReady,
  isFollowUpComposerUnavailable,
  setFollowUpComposerUnavailable,
} from '../followUpComposerReady'

describe('follow-up composer readiness', () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect

  afterEach(() => {
    document.body.innerHTML = ''
    setFollowUpComposerUnavailable(false)
    HTMLElement.prototype.getBoundingClientRect = originalRect
  })

  function mount(options: { loading?: boolean; disabled?: boolean; width?: number }) {
    const slot = document.createElement('div')
    slot.setAttribute('data-after-results-composer-slot', '')
    const composer = document.createElement('div')
    composer.className = 'composer'
    const textarea = document.createElement('textarea')
    if (options.disabled) textarea.disabled = true
    composer.appendChild(textarea)
    slot.appendChild(composer)
    document.body.appendChild(slot)
    if (options.loading) {
      const loading = document.createElement('section')
      loading.className = 'loading-section'
      loading.textContent = 'Processing responses from 2 AI models...'
      document.body.appendChild(loading)
    }
    const width = options.width ?? 320
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList.contains('loading-section')) return new DOMRect(0, 0, 640, 140)
      if (this.classList.contains('composer')) return new DOMRect(0, 0, width, 80)
      return new DOMRect(0, 0, 0, 0)
    }
  }

  it('is not ready while the processing panel is on screen', () => {
    mount({ loading: true })
    expect(isFollowUpComposerReady()).toBe(false)
    expect(
      followUpComposerAdvanceDecision({
        isLoading: true,
        composerReady: false,
        hasComparisonResults: true,
      })
    ).toBe('wait')
  })

  it('is ready when the portaled composer is visible and its field is enabled', () => {
    mount({})
    expect(isFollowUpComposerReady()).toBe(true)
    expect(
      followUpComposerAdvanceDecision({
        isLoading: false,
        composerReady: true,
        hasComparisonResults: true,
      })
    ).toBe('ready')
  })

  it('keeps waiting for results that have not portaled the composer yet', () => {
    expect(
      followUpComposerAdvanceDecision({
        isLoading: false,
        composerReady: false,
        hasComparisonResults: true,
      })
    ).toBe('wait')
  })

  it('gives up when the stream ended with no comparison to continue', () => {
    expect(
      followUpComposerAdvanceDecision({
        isLoading: false,
        composerReady: false,
        hasComparisonResults: false,
      })
    ).toBe('give-up')
  })

  it('records that the stream ended without a continue-conversation composer', () => {
    expect(isFollowUpComposerUnavailable()).toBe(false)
    setFollowUpComposerUnavailable(true)
    expect(isFollowUpComposerUnavailable()).toBe(true)
    setFollowUpComposerUnavailable(false)
    expect(isFollowUpComposerUnavailable()).toBe(false)
  })

  it('is not ready when the follow-up field is disabled or has no box', () => {
    mount({ disabled: true })
    expect(isFollowUpComposerReady()).toBe(false)
    document.body.innerHTML = ''
    mount({ width: 0 })
    expect(isFollowUpComposerReady()).toBe(false)
  })
})
