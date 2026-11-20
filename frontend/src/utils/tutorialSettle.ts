/**
 * One-shot settle for tutorial step changes.
 * Scroll and visualViewport (mobile keyboard) must stop before the tooltip
 * and highlight are measured and faded in. Position is not animated.
 */

export const TUTORIAL_REVEAL_MS = 200
export const TUTORIAL_SPOTLIGHT_SETTLED_EVENT = 'tutorial-spotlight-settled'
const SETTLING_CLASS = 'tutorial-spotlight-settling'

export interface TutorialBox {
  top: number
  left: number
  width: number
  height: number
}

export function prefersReducedTutorialMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function setTutorialSpotlightSettling(settling: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(SETTLING_CLASS, settling)
}

export function tutorialBoxesNearlyEqual(
  a: TutorialBox | null | undefined,
  b: TutorialBox | null | undefined,
  epsilon = 2
): boolean {
  if (a == null || b == null) return a == null && b == null
  return (
    Math.abs(a.top - b.top) < epsilon &&
    Math.abs(a.left - b.left) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  )
}

interface ViewportSnapshot {
  height: number
  offsetTop: number
  width: number
}

function readViewportSnapshot(): ViewportSnapshot | null {
  const vv = window.visualViewport
  if (!vv) return null
  return { height: vv.height, offsetTop: vv.offsetTop, width: vv.width }
}

function viewportMoved(previous: ViewportSnapshot | null, next: ViewportSnapshot | null): boolean {
  if (previous == null || next == null) return previous !== next
  // iOS reports 1px visualViewport jitter while the page is still. That used to
  // reset the quiet period until the hard timeout, so the fade started as the
  // sample window ended.
  return (
    Math.abs(next.height - previous.height) >= 8 ||
    Math.abs(next.offsetTop - previous.offsetTop) >= 8 ||
    Math.abs(next.width - previous.width) >= 8
  )
}

function tutorialScrollTarget(): EventTarget {
  const app = document.querySelector('.app') as HTMLElement | null
  if (app && app.scrollHeight > app.clientHeight + 1) return app
  return window
}

function readScrollTop(target: EventTarget): number {
  if (target === window) {
    return window.scrollY || document.documentElement.scrollTop || 0
  }
  return (target as HTMLElement).scrollTop
}

/**
 * Resolves when scrolling, visualViewport, and font loading have been quiet.
 * `scrollend` arms the same quiet period; a timeout resolves if the event never fires.
 * Call this after starting the single programmatic scroll.
 */
export function waitForTutorialLayoutSettle(options?: {
  timeoutMs?: number
  quietMs?: number
}): Promise<void> {
  const reduced = prefersReducedTutorialMotion()
  const timeoutMs = options?.timeoutMs ?? (reduced ? 120 : 1200)
  const quietMs = options?.quietMs ?? (reduced ? 16 : 80)

  return new Promise(resolve => {
    const scrollTarget = tutorialScrollTarget()
    let finished = false
    let quietTimer: ReturnType<typeof setTimeout> | null = null
    let hardTimer: ReturnType<typeof setTimeout> | null = null
    let lastScroll = readScrollTop(scrollTarget)
    let lastViewport = readViewportSnapshot()

    const cleanup = () => {
      if (quietTimer) clearTimeout(quietTimer)
      if (hardTimer) clearTimeout(hardTimer)
      scrollTarget.removeEventListener('scroll', onActivity)
      scrollTarget.removeEventListener('scrollend', onActivity)
      window.removeEventListener('scroll', onActivity)
      window.visualViewport?.removeEventListener('resize', onActivity)
      window.visualViewport?.removeEventListener('scroll', onActivity)
    }

    const finish = () => {
      if (finished) return
      finished = true
      cleanup()
      resolve()
    }

    const armQuiet = () => {
      if (finished) return
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => {
        const scrollNow = readScrollTop(scrollTarget)
        const viewportNow = readViewportSnapshot()
        const scrollQuiet = Math.abs(scrollNow - lastScroll) < 4
        const viewportQuiet = !viewportMoved(lastViewport, viewportNow)
        if (scrollQuiet && viewportQuiet) {
          finish()
          return
        }
        lastScroll = scrollNow
        lastViewport = viewportNow
        armQuiet()
      }, quietMs)
    }

    const onActivity = () => {
      const scrollNow = readScrollTop(scrollTarget)
      const viewportNow = readViewportSnapshot()
      const scrollChanged = Math.abs(scrollNow - lastScroll) >= 4
      const viewportChanged = viewportMoved(lastViewport, viewportNow)
      lastScroll = scrollNow
      lastViewport = viewportNow
      // Safari emits visualViewport and scroll events that do not move the page.
      // Resetting the quiet period on those events holds the tooltip hidden until timeout.
      if (!scrollChanged && !viewportChanged) return
      armQuiet()
    }

    scrollTarget.addEventListener('scroll', onActivity, { passive: true })
    scrollTarget.addEventListener('scrollend', onActivity)
    if (scrollTarget !== window) {
      window.addEventListener('scroll', onActivity, { passive: true })
    }
    window.visualViewport?.addEventListener('resize', onActivity)
    window.visualViewport?.addEventListener('scroll', onActivity)

    hardTimer = setTimeout(finish, timeoutMs)
    const fontsReady = document.fonts?.ready
    if (fontsReady) {
      void fontsReady.then(() => {
        if (!finished) armQuiet()
      })
    }
    armQuiet()
  })
}

/**
 * Resolves once `read` stays still. Font swaps and the hero lock move targets
 * without a scroll event, which left the frozen tooltip short of the frame.
 */
export function waitForRectStable(
  read: () => { top: number; height: number } | null,
  options?: { timeoutMs?: number; quietMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 500
  const quietMs = options?.quietMs ?? 100
  return new Promise(resolve => {
    const start = performance.now()
    let last = read()
    let stableSince = performance.now()
    const tick = () => {
      const next = read()
      const moved =
        last == null ||
        next == null ||
        Math.abs(next.top - last.top) > 1 ||
        Math.abs(next.height - last.height) > 1
      last = next
      if (moved) stableSince = performance.now()
      if (next && performance.now() - stableSince >= quietMs) {
        resolve()
        return
      }
      if (performance.now() - start >= timeoutMs) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** Focus the prompt field on touch devices so the keyboard resize is part of the settle wait. */
export function focusTutorialPromptTextarea(): void {
  if (typeof document === 'undefined' || typeof window.matchMedia !== 'function') return
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  if (!coarse && !noHover) return

  const textarea = document.querySelector(
    '[data-testid="comparison-input-textarea"]'
  ) as HTMLTextAreaElement | null
  if (!textarea || textarea.disabled) return
  try {
    textarea.focus({ preventScroll: true })
  } catch {
    textarea.focus()
  }
}
