/**
 * Integration tests for TutorialOverlay component
 *
 * Verifies the refactored overlay renders correctly and maintains behavior.
 * Step 1 (expand-provider) hides the overlay until centering + effects complete; those phases are
 * covered in e2e. These tests use enter-prompt so backdrop/tooltip can mount with a minimal DOM.
 * More comprehensive E2E coverage exists in e2e/02-registration-onboarding.spec.ts
 * and other e2e specs that use dismissTutorialOverlay.
 */

import { render, screen } from '@testing-library/react'
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

/** jsdom often does not advance scrollY on scrollTo; keep scroll position in sync for tutorial code. */
function stubScrollToForTutorialTests() {
  let y = 0
  const spy = vi.spyOn(window, 'scrollTo').mockImplementation((...args: unknown[]) => {
    const a0 = args[0]
    if (typeof a0 === 'number') {
      y = (args[1] as number) ?? 0
    } else if (a0 && typeof a0 === 'object' && 'top' in (a0 as object)) {
      y = Math.max(0, Number((a0 as { top?: number }).top ?? 0))
    }
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    Object.defineProperty(window, 'pageYOffset', { value: y, configurable: true })
    window.dispatchEvent(new Event('scroll'))
  })
  return () => {
    spy.mockRestore()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    Object.defineProperty(window, 'pageYOffset', { value: 0, configurable: true })
  }
}

describe('TutorialOverlay', () => {
  const defaultProps = {
    step: null as 'enter-prompt' | null,
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
