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

function readViewportSignature(): string {
  const vv = window.visualViewport
  if (!vv) return 'none'
  return `${Math.round(vv.height)}:${Math.round(vv.offsetTop)}:${Math.round(vv.width)}`
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
    let lastViewport = readViewportSignature()

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
        const viewportNow = readViewportSignature()
        const scrollQuiet = Math.abs(scrollNow - lastScroll) < 1
        const viewportQuiet = viewportNow === lastViewport
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
      const viewportNow = readViewportSignature()
      const scrollChanged = Math.abs(scrollNow - lastScroll) >= 1
      const viewportChanged = viewportNow !== lastViewport
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
        if (!finished) onActivity()
      })
    }
    armQuiet()
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
