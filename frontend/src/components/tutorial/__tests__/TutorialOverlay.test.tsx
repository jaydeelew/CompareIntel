/**
 * Integration tests for TutorialOverlay component
 *
 * Verifies the refactored overlay renders correctly and maintains behavior.
 * Step 1 (expand-provider) hides the overlay until centering + effects complete; those phases are
 * covered in e2e. These tests use enter-prompt so backdrop/tooltip can mount with a minimal DOM.
 * More comprehensive E2E coverage exists in e2e/02-registration-onboarding.spec.ts
 * and other e2e specs that use dismissTutorialOverlay.
 */

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { TutorialOverlay } from '../TutorialOverlay'

/** useTutorialOverlay uses rAF for scroll idle and enter-prompt uses rAF for smooth scroll. */
function stubRafForTutorialTests() {
  const origRaf = globalThis.requestAnimationFrame
  const origCancel = globalThis.cancelAnimationFrame
  const timeouts = new Map<number, ReturnType<typeof setTimeout>>()
  let id = 0
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const handle = ++id
    const t = setTimeout(() => {
      timeouts.delete(handle)
      cb(performance.now())
    }, 0)
    timeouts.set(handle, t)
    return handle
  }
  globalThis.cancelAnimationFrame = (handle: number): void => {
    const t = timeouts.get(handle)
    if (t) clearTimeout(t)
    timeouts.delete(handle)
  }
  return () => {
    timeouts.forEach(t => clearTimeout(t))
    timeouts.clear()
    globalThis.requestAnimationFrame = origRaf
    globalThis.cancelAnimationFrame = origCancel
  }
}

/** jsdom logs "Not implemented: window.scrollTo" and does not advance scroll offsets. */
function stubScrollToForTutorialTests() {
  let y = 0
  const applyWindow = (top: number) => {
    y = Math.max(0, top)
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    Object.defineProperty(window, 'pageYOffset', { value: y, configurable: true })
  }
  const windowSpy = vi.spyOn(window, 'scrollTo').mockImplementation((...args: unknown[]) => {
    const a0 = args[0]
    if (typeof a0 === 'number') {
      applyWindow((args[1] as number) ?? 0)
    } else if (a0 && typeof a0 === 'object' && 'top' in (a0 as object)) {
      applyWindow(Number((a0 as { top?: number }).top ?? 0))
    }
  })
  const originalElementScroll = HTMLElement.prototype.scrollTo
  HTMLElement.prototype.scrollTo = function scrollToStub(this: HTMLElement, ...args: unknown[]) {
    const a0 = args[0]
    if (typeof a0 === 'number') {
      this.scrollTop = (args[1] as number) ?? 0
    } else if (a0 && typeof a0 === 'object' && 'top' in (a0 as object)) {
      this.scrollTop = Number((a0 as { top?: number }).top ?? this.scrollTop)
    }
  } as typeof HTMLElement.prototype.scrollTo
  return () => {
    windowSpy.mockRestore()
    HTMLElement.prototype.scrollTo = originalElementScroll
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    Object.defineProperty(window, 'pageYOffset', { value: 0, configurable: true })
  }
}

describe('TutorialOverlay', () => {
  const defaultProps = {
    step: null as 'enter-prompt' | null,
    tutorialProviderNames: ['Google', 'DeepSeek'] as const,
    tutorialVisibleStepOrder: [
      'expand-provider',
      'select-starter-model-1',
      'select-starter-model-2',
      'enter-prompt',
      'submit-comparison',
      'follow-up',
      'view-follow-up-results',
      'history-dropdown',
      'save-selection',
    ] as const,
    tutorialStarterEntries: [
      { modelId: 'google/gemini-2.5-flash', provider: 'Google', displayName: 'Gemini 2.5 Flash' },
      {
        modelId: 'deepseek/deepseek-v4.1-flash-1017',
        provider: 'DeepSeek',
        displayName: 'DeepSeek V4.1 Flash',
      },
    ],
    tutorialSplitModelSteps: true,
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    isStepCompleted: false,
    isLoading: false,
  }

  function mountComposerStub() {
    const wrap = document.createElement('div')
    wrap.setAttribute('data-tutorial-test-stub', '1')
    wrap.innerHTML = `
      <div class="composer" style="width:320px;min-height:100px">
        <div class="composer-input-wrapper" style="height:40px"></div>
        <div class="hero-input-textarea" style="height:40px"></div>
        <div class="composer-toolbar" style="height:24px"></div>
      </div>`
    document.body.appendChild(wrap)
    return wrap
  }

  let restoreRaf: () => void
  let restoreScrollTo: () => void

  beforeEach(() => {
    restoreRaf = stubRafForTutorialTests()
    restoreScrollTo = stubScrollToForTutorialTests()
    const existing = document.getElementById('tutorial-portal-root')
    if (existing) existing.remove()
  })

  afterEach(() => {
    cleanup()
    document.querySelectorAll('[data-tutorial-test-stub]').forEach(n => n.remove())
    restoreScrollTo?.()
    restoreRaf?.()
  })

  it('should return null when step is null', () => {
    const { container } = render(<TutorialOverlay {...defaultProps} step={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render overlay when step is provided', async () => {
    mountComposerStub()

    render(<TutorialOverlay {...defaultProps} step="enter-prompt" />)

    await vi.waitFor(
      () => {
        expect(
          document.body.querySelector(
            '.tutorial-backdrop, .tutorial-tooltip, .tutorial-backdrop-cutout'
          )
        ).toBeTruthy()
      },
      { timeout: 8000 }
    )
  })

  it('should call onSkip when skip button is clicked', async () => {
    mountComposerStub()

    const user = userEvent.setup()
    const onSkip = vi.fn()
    render(<TutorialOverlay {...defaultProps} step="enter-prompt" onSkip={onSkip} />)

    await vi.waitFor(
      () => {
        const skipButton = document.querySelector('.tutorial-close-button')
        expect(skipButton).toBeInTheDocument()
      },
      { timeout: 8000 }
    )

    const skipButton = document.querySelector('.tutorial-close-button')
    if (skipButton) {
      await user.click(skipButton as HTMLElement)
      expect(onSkip).toHaveBeenCalledTimes(1)
    }
  })

  it('should render step content for enter-prompt', async () => {
    mountComposerStub()

    render(<TutorialOverlay {...defaultProps} step="enter-prompt" />)

    await vi.waitFor(
      () => {
        expect(screen.getByText('Enter Your Prompt')).toBeInTheDocument()
      },
      { timeout: 8000 }
    )
  })
})

describe('TutorialOverlay comparison spotlight', () => {
  const props = {
    tutorialProviderNames: ['Google', 'DeepSeek'] as const,
    tutorialVisibleStepOrder: [
      'expand-provider',
      'select-starter-model-1',
      'select-starter-model-2',
      'enter-prompt',
      'submit-comparison',
      'follow-up',
      'view-follow-up-results',
      'history-dropdown',
      'save-selection',
    ] as const,
    tutorialStarterEntries: [
      { modelId: 'google/gemini-2.5-flash', provider: 'Google', displayName: 'Gemini 2.5 Flash' },
      {
        modelId: 'deepseek/deepseek-v4.1-flash-1017',
        provider: 'DeepSeek',
        displayName: 'DeepSeek V4.1 Flash',
      },
    ],
    tutorialSplitModelSteps: true,
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    isStepCompleted: false,
  }

  const originalRect = HTMLElement.prototype.getBoundingClientRect
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight'
  )
  const originalOffsetParent = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetParent'
  )
  let resultsRect = new DOMRect(40, 280, 640, 400)
  let restoreRaf: () => void
  let restoreScrollTo: () => void

  function mountComparison() {
    const wrap = document.createElement('div')
    wrap.setAttribute('data-tutorial-test-stub', '1')
    wrap.innerHTML = `
      <div class="composer" style="width:320px;min-height:100px">
        <div class="composer-input-wrapper" style="height:40px"></div>
        <div class="hero-input-textarea" style="height:40px"></div>
        <div class="composer-toolbar" style="height:24px"></div>
        <button data-testid="comparison-submit-button" type="button">Submit</button>
      </div>
      <section class="loading-section">Processing responses from 2 AI models...</section>
      <section class="results-section">Comparison Results</section>
      <div data-after-results-composer-slot>
        <div class="composer" style="width:320px;min-height:80px"></div>
      </div>`
    document.body.appendChild(wrap)
  }

  beforeEach(() => {
    restoreRaf = stubRafForTutorialTests()
    restoreScrollTo = stubScrollToForTutorialTests()
    resultsRect = new DOMRect(40, 280, 640, 400)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return 320
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return 80
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return document.body
      },
    })
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement
    ) {
      if (this.classList.contains('loading-section')) return new DOMRect(40, 120, 640, 140)
      if (this.classList.contains('results-section')) return resultsRect
      if (this.closest('[data-after-results-composer-slot]')) return new DOMRect(40, 700, 320, 80)
      if (this.getAttribute('data-testid') === 'comparison-submit-button') {
        return new DOMRect(200, 480, 120, 40)
      }
      return new DOMRect(40, 40, 320, 80)
    }
    const existing = document.getElementById('tutorial-portal-root')
    if (existing) existing.remove()
    mountComparison()
  })

  afterEach(() => {
    cleanup()
    document.querySelectorAll('[data-tutorial-test-stub]').forEach(n => n.remove())
    HTMLElement.prototype.getBoundingClientRect = originalRect
    if (originalOffsetWidth)
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    if (originalOffsetHeight)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    if (originalOffsetParent)
      Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent)
    restoreScrollTo?.()
    restoreRaf?.()
  })

  function viewportStyleTop(el: HTMLElement): number {
    const cssTop = Number.parseFloat(el.style.top)
    const anchor = Number.parseFloat(el.dataset.scrollAnchorY ?? '0')
    return cssTop + (Number.isFinite(anchor) ? anchor : 0)
  }

  function tooltipVisualTop(tip: HTMLElement): number {
    const cssTop = viewportStyleTop(tip)
    const estimated = window.innerHeight < 700 ? 160 : 210
    return tip.classList.contains('tutorial-tooltip-top') ? cssTop - estimated : cssTop
  }

  it('highlights the processing panel and hides the tooltip until streaming finishes', async () => {
    const view = render(
      <TutorialOverlay {...props} step="submit-comparison" isLoading streamAnswerStarted={false} />
    )

    await vi.waitFor(
      () => {
        const loading = document.querySelector('.loading-section')
        const results = document.querySelector('.results-section')
        expect(loading?.classList.contains('tutorial-highlight')).toBe(true)
        expect(results?.classList.contains('tutorial-highlight')).toBe(false)
        expect(document.querySelector('.tutorial-tooltip')).toBeNull()
      },
      { timeout: 8000 }
    )

    resultsRect = new DOMRect(40, 280, 640, 480)
    view.rerender(
      <TutorialOverlay {...props} step="submit-comparison" isLoading streamAnswerStarted />
    )

    await vi.waitFor(
      () => {
        const loading = document.querySelector('.loading-section')
        const results = document.querySelector('.results-section')
        expect(results?.classList.contains('tutorial-highlight')).toBe(true)
        expect(loading?.classList.contains('tutorial-highlight')).toBe(false)
        expect(document.querySelector('.tutorial-tooltip')).toBeNull()
      },
      { timeout: 8000 }
    )
  })

  it('frames follow-up processing, then hands the same cutout to the results card', async () => {
    const view = render(
      <TutorialOverlay
        {...props}
        step="follow-up"
        isLoading
        streamAnswerStarted={false}
        followUpSubmitStarted
      />
    )

    await vi.waitFor(
      () => {
        const loading = document.querySelector('.loading-section') as HTMLElement | null
        const results = document.querySelector('.results-section')
        expect(loading?.classList.contains('tutorial-highlight')).toBe(true)
        expect(results?.classList.contains('tutorial-highlight')).toBe(false)
        const cutout = document.querySelector(
          '.tutorial-backdrop-cutout:not(.tutorial-backdrop-follow-up-results-ring)'
        ) as HTMLElement | null
        expect(cutout).toBeTruthy()
        expect(Math.abs(viewportStyleTop(cutout as HTMLElement) - (120 - 8))).toBeLessThan(28)
        expect(document.querySelector('.tutorial-backdrop-follow-up-results-ring')).toBeNull()
      },
      { timeout: 8000 }
    )

    view.rerender(
      <TutorialOverlay
        {...props}
        step="follow-up"
        isLoading
        streamAnswerStarted
        followUpSubmitStarted
      />
    )

    await vi.waitFor(
      () => {
        const loading = document.querySelector('.loading-section')
        const results = document.querySelector('.results-section') as HTMLElement | null
        expect(results?.classList.contains('tutorial-highlight')).toBe(true)
        expect(loading?.classList.contains('tutorial-highlight')).toBe(false)
        const cutout = document.querySelector(
          '.tutorial-backdrop-cutout:not(.tutorial-backdrop-follow-up-results-ring)'
        ) as HTMLElement | null
        expect(cutout).toBeTruthy()
        expect(Math.abs(viewportStyleTop(cutout as HTMLElement) - (280 - 8))).toBeLessThan(28)
        expect(document.querySelector('.tutorial-backdrop-follow-up-results-ring')).toBeNull()
        const tips = Array.from(document.querySelectorAll('.tutorial-tooltip'))
        const visibleContinue = tips.filter(tip => {
          const style = getComputedStyle(tip)
          return (
            style.visibility !== 'hidden' &&
            Number(style.opacity) !== 0 &&
            (tip.textContent ?? '').includes('Continue the Conversation')
          )
        })
        expect(visibleContinue).toHaveLength(0)
      },
      { timeout: 8000 }
    )
  })

  it('does not show the continue-conversation tooltip while the processing panel is up', async () => {
    render(<TutorialOverlay {...props} step="follow-up" isLoading streamAnswerStarted />)

    await vi.waitFor(
      () => {
        expect(
          document.querySelector('.loading-section')?.classList.contains('tutorial-highlight')
        ).toBe(false)
        expect(
          document.querySelector('.results-section')?.classList.contains('tutorial-highlight')
        ).toBe(true)
      },
      { timeout: 8000 }
    )

    const tips = Array.from(document.querySelectorAll('.tutorial-tooltip'))
    const visibleContinue = tips.filter(tip => {
      const style = getComputedStyle(tip)
      return (
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        (tip.textContent ?? '').includes('Continue the Conversation')
      )
    })
    expect(visibleContinue).toHaveLength(0)
  })

  it('renders the review tooltip beside the results panel, not on top of it', async () => {
    resultsRect = new DOMRect(40, 500, 640, 180)
    render(
      <TutorialOverlay
        {...props}
        step="view-follow-up-results"
        isLoading={false}
        streamAnswerStarted
      />
    )

    await vi.waitFor(
      () => {
        const tip = document.querySelector('.tutorial-tooltip') as HTMLElement | null
        expect(tip?.textContent).toContain('Review the New Responses')
        expect(tip?.classList.contains('tutorial-tooltip--settling')).toBe(false)
        expect(tip?.classList.contains('tutorial-tooltip--unanchored')).toBe(false)
        expect(
          document.querySelector('.results-section')?.classList.contains('tutorial-highlight')
        ).toBe(true)
        const composer = document.querySelector(
          '[data-after-results-composer-slot] .composer'
        ) as HTMLElement | null
        expect(composer?.classList.contains('tutorial-highlight')).toBe(true)
        expect(document.querySelector('.tutorial-backdrop-follow-up-composer-ring')).toBeTruthy()
        const visualTop = tooltipVisualTop(tip as HTMLElement)
        expect(visualTop).toBeGreaterThanOrEqual(12)
        const facing = viewportStyleTop(tip as HTMLElement)
        expect(facing).toBeLessThanOrEqual(window.innerHeight - 12)
        const above = tip?.classList.contains('tutorial-tooltip-top')
        if (above) {
          expect(facing).toBeLessThanOrEqual(resultsRect.top)
        } else {
          expect(visualTop).toBeGreaterThanOrEqual(resultsRect.bottom)
        }
        const left = Number.parseFloat(tip?.style.left ?? '')
        const composerCenter = 40 + 320 / 2
        const resultsCenter = resultsRect.left + resultsRect.width / 2
        expect(Math.abs(left - resultsCenter)).toBeLessThan(Math.abs(left - composerCenter))
      },
      { timeout: 8000 }
    )
  }, 12000)
})
