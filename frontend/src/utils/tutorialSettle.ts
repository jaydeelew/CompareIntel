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

const MOTION_SEED_SELECTOR = [
  '.app',
  '.composer',
  '.tutorial-highlight',
  '.mobile-tutorial-highlight',
  '.results-section',
  '.provider-dropdown',
  '.history-inline-list',
  '.saved-selections-dropdown',
].join(',')

function elementCanScroll(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) return false
  const style = getComputedStyle(el)
  const overflow = `${style.overflow}${style.overflowY}${style.overflowX}`
  return /auto|scroll|overlay/.test(overflow)
}

/**
 * Viewport signature of the page and the highlighted targets. The tooltip and
 * cutout are omitted so writing their position does not keep the loop alive.
 */
function readTutorialMotionSignature(): string {
  const vv = window.visualViewport
  const parts = [
    window.scrollY || 0,
    document.documentElement.scrollTop || 0,
    vv?.offsetTop ?? 0,
    vv?.offsetLeft ?? 0,
    vv?.height ?? 0,
    vv?.width ?? 0,
  ]
  document.querySelectorAll(MOTION_SEED_SELECTOR).forEach(el => {
    if (el instanceof HTMLElement) parts.push(el.scrollTop, el.scrollLeft)
    const rect = el.getBoundingClientRect()
    parts.push(
      Math.round(rect.top),
      Math.round(rect.left),
      Math.round(rect.width),
      Math.round(rect.height)
    )
  })
  return parts.join(',')
}

/**
 * Keep fixed tutorial chrome on the target while the page moves.
 * Scroll on the document (capture) misses some WebKit overflow scrollers, so
 * every scrollable ancestor of a highlight is bound too. A touch or pointer
 * drag samples layout every frame: iOS often paints the scroll on the
 * compositor and delivers the scroll event only when the finger lifts.
 * After the finger lifts, sampling continues until momentum stops.
 * A 48ms timer still runs when WebKit drops animation frames during a test wait.
 */
export function trackTutorialMotion(onFrame: () => void): () => void {
  let raf = 0
  let timer: number | null = null
  let resizeFollowUp: number | null = null
  let contacts = 0
  let stableFrames = 0
  let trailingFrames = 0
  let lastSignature = readTutorialMotionSignature()
  const bound = new Set<EventTarget>()
  let disposed = false

  const scheduleTimer = () => {
    if (timer != null) return
    timer = window.setTimeout(() => {
      timer = null
      if (disposed) return
      onFrame()
    }, 48)
  }

  const stopLoop = () => {
    if (raf !== 0) cancelAnimationFrame(raf)
    raf = 0
  }

  const loop = () => {
    raf = requestAnimationFrame(() => {
      raf = 0
      if (disposed) return
      const next = readTutorialMotionSignature()
      if (next !== lastSignature) {
        lastSignature = next
        stableFrames = 0
        onFrame()
        // WebKit drops animation frames while a test is sampling. The timer
        // still lands, so a touch that never emits scroll still moves the card.
        scheduleTimer()
      } else if (contacts > 0) {
        stableFrames = 0
      } else {
        stableFrames += 1
      }
      if (contacts > 0) trailingFrames = 0
      else trailingFrames += 1
      // Keep sampling through the gesture and the momentum after it. The cap
      // stops a 1px layout jitter from sampling forever once the finger is up.
      if (contacts > 0 || (stableFrames < 8 && trailingFrames < 180)) loop()
    })
  }

  const ensureLoop = () => {
    if (raf === 0) loop()
  }

  const bindTarget = (target: EventTarget | null) => {
    if (!target || bound.has(target)) return
    bound.add(target)
    target.addEventListener('scroll', onScroll, { capture: true, passive: true })
  }

  const bindScrollAncestors = () => {
    bindTarget(document)
    bindTarget(window)
    bindTarget(document.scrollingElement)
    document.querySelectorAll(MOTION_SEED_SELECTOR).forEach(el => {
      let node: HTMLElement | null = el instanceof HTMLElement ? el : null
      while (node) {
        if (elementCanScroll(node)) bindTarget(node)
        node = node.parentElement
      }
    })
  }

  const onScroll = () => {
    if (disposed) return
    bindScrollAncestors()
    lastSignature = ''
    stableFrames = 0
    scheduleTimer()
    ensureLoop()
  }

  const onResize = () => {
    onScroll()
    if (resizeFollowUp != null) window.clearTimeout(resizeFollowUp)
    resizeFollowUp = window.setTimeout(() => {
      resizeFollowUp = null
      onScroll()
    }, 200)
  }

  const noteContacts = (next: number) => {
    contacts = Math.max(0, next)
    stableFrames = 0
    bindScrollAncestors()
    scheduleTimer()
    ensureLoop()
  }
  const onTouchStart = (event: TouchEvent) => {
    noteContacts(event.touches?.length || contacts + 1)
  }
  const onTouchEnd = (event: TouchEvent) => {
    noteContacts(event.touches?.length ?? Math.max(0, contacts - 1))
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    noteContacts(contacts + 1)
  }
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    noteContacts(contacts - 1)
  }

  bindScrollAncestors()
  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true })
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
  document.addEventListener('pointerup', onPointerUp, { capture: true, passive: true })
  document.addEventListener('pointercancel', onPointerUp, { capture: true, passive: true })
  window.addEventListener('resize', onResize)
  window.visualViewport?.addEventListener('scroll', onScroll)
  window.visualViewport?.addEventListener('resize', onResize)

  return () => {
    disposed = true
    stopLoop()
    if (timer != null) window.clearTimeout(timer)
    if (resizeFollowUp != null) window.clearTimeout(resizeFollowUp)
    bound.forEach(target => {
      target.removeEventListener('scroll', onScroll, { capture: true })
    })
    document.removeEventListener('touchstart', onTouchStart, { capture: true })
    document.removeEventListener('touchend', onTouchEnd, { capture: true })
    document.removeEventListener('touchcancel', onTouchEnd, { capture: true })
    document.removeEventListener('pointerdown', onPointerDown, { capture: true })
    document.removeEventListener('pointerup', onPointerUp, { capture: true })
    document.removeEventListener('pointercancel', onPointerUp, { capture: true })
    window.removeEventListener('resize', onResize)
    window.visualViewport?.removeEventListener('scroll', onScroll)
    window.visualViewport?.removeEventListener('resize', onResize)
  }
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
 * Resolves once `frames` consecutive layout reads match. The success condition
 * is the box itself. `timeoutMs` only fires when the box never settles. An
 * interval is used because WebKit does not run requestAnimationFrame while a
 * test is blocked on the next sample.
 */
export function waitForRectFrames(
  read: () => { top: number; left?: number; height: number } | null,
  options?: { timeoutMs?: number; frames?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 800
  const frames = options?.frames ?? 2
  return new Promise(resolve => {
    const start = performance.now()
    let previous: { top: number; left: number; height: number } | null = null
    let matched = 0
    const timer = window.setInterval(() => {
      const timedOut = performance.now() - start >= timeoutMs
      const next = read()
      if (!next) {
        matched = 0
        previous = null
      } else {
        const box = { top: next.top, left: next.left ?? 0, height: next.height }
        const same =
          previous != null &&
          Math.abs(box.top - previous.top) <= 0.5 &&
          Math.abs(box.left - previous.left) <= 0.5 &&
          Math.abs(box.height - previous.height) <= 0.5
        previous = box
        matched = same ? matched + 1 : 0
      }
      if (timedOut || (next != null && matched >= frames - 1)) {
        window.clearInterval(timer)
        resolve()
      }
    }, 32)
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
    // WebKit throttles requestAnimationFrame while Playwright is waiting, so a
    // rAF loop never reached the timeout and the tooltip stayed hidden for the
    // whole sample window. An interval still runs during that wait.
    const timer = window.setInterval(() => {
      const next = read()
      const moved =
        last == null ||
        next == null ||
        Math.abs(next.top - last.top) > 1 ||
        Math.abs(next.height - last.height) > 1
      last = next
      if (moved) stableSince = performance.now()
      const quiet = next != null && performance.now() - stableSince >= quietMs
      const timedOut = performance.now() - start >= timeoutMs
      if (quiet || timedOut) {
        window.clearInterval(timer)
        resolve()
      }
    }, 32)
  })
}

/** Cutout updaters listen for this when a target changes size without scrolling. */
export const TUTORIAL_FRAME_RESIZED_EVENT = 'tutorial-frame-resized'

const FRAME_SIZE_SELECTOR = [
  '.composer:not(.composer-placeholder)',
  '.composer-input-wrapper',
  '.composer-toolbar',
  'textarea',
  '.history-inline-list',
  '.saved-selections-dropdown',
  '.results-section',
  '.provider-dropdown',
].join(',')

/**
 * Remeasure when a tutorial target grows or shrinks. The history list and saved
 * selections mount after the step has settled, and a textarea or results block
 * can change height without a scroll. rAF coalesces bursts; a 48ms timer still
 * runs when WebKit drops animation frames during a Playwright wait.
 */
export function watchTutorialFrameSize(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
    return () => {}
  }

  let raf = 0
  let timer: number | null = null
  const schedule = () => {
    if (raf === 0) {
      raf = requestAnimationFrame(() => {
        raf = 0
        onChange()
      })
    }
    if (timer == null) {
      timer = window.setTimeout(() => {
        timer = null
        onChange()
      }, 48)
    }
  }

  const observed = new Set<Element>()
  const lastSize = new Map<Element, string>()
  // Dropdown toggles re-render the composer. Remeasure only when a target's
  // box actually changes, or Firefox restarts the open animation and the list
  // never counts as visible.
  const noteSizeChange = () => {
    let changed = false
    for (const el of observed) {
      const rect = el.getBoundingClientRect()
      const key = `${Math.round(rect.width)}:${Math.round(rect.height)}`
      if (lastSize.get(el) === key) continue
      lastSize.set(el, key)
      changed = true
    }
    return changed
  }
  const resizeObserver = new ResizeObserver(() => {
    if (noteSizeChange()) schedule()
  })

  const bind = () => {
    document.querySelectorAll(FRAME_SIZE_SELECTOR).forEach(el => {
      if (observed.has(el)) return
      observed.add(el)
      resizeObserver.observe(el)
    })
  }

  bind()
  noteSizeChange()

  const host = document.querySelector('.app') ?? document.body
  const mutationObserver = new MutationObserver(records => {
    const relevant = records.some(record => {
      const node = record.target instanceof Element ? record.target : record.target.parentElement
      if (!node) return false
      return node.closest('#mobile-tutorial-portal-root, #tutorial-portal-root') == null
    })
    if (!relevant) return
    bind()
    if (noteSizeChange()) schedule()
  })
  mutationObserver.observe(host, { childList: true, subtree: true })

  return () => {
    if (raf !== 0) cancelAnimationFrame(raf)
    if (timer != null) window.clearTimeout(timer)
    resizeObserver.disconnect()
    mutationObserver.disconnect()
  }
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
