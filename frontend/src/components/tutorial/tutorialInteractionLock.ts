import { useEffect } from 'react'

import { getTutorialScrollRoot } from '../../utils/tutorialPositioning'
import { trackTutorialMotion } from '../../utils/tutorialSettle'

const SHIELD_ID = 'tutorial-interaction-shield'
const PORTAL_SELECTOR = '#tutorial-portal-root, #mobile-tutorial-portal-root'
const HIGHLIGHT_SELECTOR = '.tutorial-highlight, .mobile-tutorial-highlight'
const HOLE_PAD_PX = 8
const MODAL_SELECTOR = [
  '.disabled-button-info-overlay',
  '.auth-modal-overlay',
  '.modal-overlay',
  '[role="dialog"]',
].join(',')

type InertMark = { el: HTMLElement; was: boolean }

type ToolbarMark = {
  el: HTMLButtonElement
  wasInert: boolean
  pointerEvents: string
}

function readTutorialStep(): string | null {
  if (typeof window === 'undefined') return null
  const fromWindow = (window as Window & { __TUTORIAL_CURRENT_STEP__?: string | null })
    .__TUTORIAL_CURRENT_STEP__
  if (fromWindow) return fromWindow
  return document.documentElement.getAttribute('data-tutorial-step')
}

/** Toolbar controls the current step actually uses. Everything else in the bar stays inert. */
function toolbarButtonKept(button: HTMLElement, step: string | null): boolean {
  if (!step) return false
  const submitStep =
    step === 'submit-comparison' || step === 'submit-comparison-2' || step === 'follow-up'
  if (
    submitStep &&
    (button.classList.contains('submit-button') ||
      button.getAttribute('data-testid') === 'comparison-submit-button')
  ) {
    return true
  }
  if (step === 'history-dropdown' && button.classList.contains('history-toggle-button')) return true
  if (step === 'save-selection' && button.classList.contains('saved-selections-button')) return true
  return false
}

function readInert(el: HTMLElement): boolean {
  return el.inert || el.hasAttribute('inert')
}

function writeInert(el: HTMLElement, inert: boolean): void {
  el.inert = inert
  if (inert) el.setAttribute('inert', '')
  else el.removeAttribute('inert')
}

/**
 * While a tutorial step is showing, block every control that is not the
 * highlighted target or part of the tutorial card. The shield swallows
 * pointer events outside those targets. `inert` removes the rest from
 * keyboard focus. Both are cleared when the tutorial unmounts.
 */
export function syncTutorialInteractionLock(): () => void {
  const marked: InertMark[] = []
  const toolbarMarks: ToolbarMark[] = []
  let shield: SVGSVGElement | null = null
  let resizeObserver: ResizeObserver | null = null
  const observed = new Set<Element>()
  let mutationObserver: MutationObserver | null = null
  let raf = 0
  let timer: number | null = null
  let disposed = false
  const scrollRoot = document.querySelector('.app') as HTMLElement | null
  const previousOverflowAnchor = scrollRoot?.style.overflowAnchor ?? ''
  // WebKit scroll anchoring jumps the page when subtrees become inert, which
  // pulls the follow-up composer off screen and swaps the card for the scroll hint.
  if (scrollRoot) scrollRoot.style.overflowAnchor = 'none'

  const restoreInert = () => {
    for (const mark of marked) writeInert(mark.el, mark.was)
    marked.length = 0
  }

  const allowedElements = () => {
    const highlighted = Array.from(document.querySelectorAll(HIGHLIGHT_SELECTOR)).filter(
      el => !el.closest(PORTAL_SELECTOR)
    )
    const allowComposer = (node: Element | null) => {
      const composer = node?.closest('.composer')
      if (!composer || composer.classList.contains('composer-placeholder')) return
      if (composer.closest('.composer-hero-mirror')) return
      if (highlighted.includes(composer)) return
      highlighted.push(composer)
    }
    // A highlight on the submit button must not inert the textarea beside it.
    // The hero mirror stays inert; the portaled composer is the one the user types in.
    highlighted.forEach(el => allowComposer(el))
    const slot = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    )
    const portalText =
      document.querySelector('#tutorial-portal-root, #mobile-tutorial-portal-root')?.textContent ??
      ''
    const reviewStep = /Review the New Responses|Access Your History|Save Model/.test(portalText)
    const resultsHighlighted = highlighted.some(
      el => el.classList.contains('results-section') || el.classList.contains('loading-section')
    )
    // The follow-up composer is portaled after the results block, so a results
    // highlight does not contain it. Keep it live until the review card is showing.
    if (slot && resultsHighlighted && !reviewStep) allowComposer(slot)
    const composerHighlighted = highlighted.some(el => el.classList.contains('composer'))
    if (slot && composerHighlighted) allowComposer(slot)
    if (composerHighlighted) {
      document.querySelectorAll('.history-inline-list, .saved-selections-dropdown').forEach(el => {
        if (el.closest('.composer-hero-mirror') || highlighted.includes(el)) return
        highlighted.push(el)
      })
    }
    // A modal opened from a hole in the shield (Add File, auth) must stay clickable.
    document.querySelectorAll(MODAL_SELECTOR).forEach(el => {
      if (el.closest(PORTAL_SELECTOR) || highlighted.includes(el)) return
      highlighted.push(el)
    })
    return highlighted
  }

  const restoreToolbar = () => {
    for (const mark of toolbarMarks) {
      writeInert(mark.el, mark.wasInert)
      mark.el.style.pointerEvents = mark.pointerEvents
      mark.el.removeAttribute('data-tutorial-toolbar-locked')
    }
    toolbarMarks.length = 0
  }

  const syncToolbar = () => {
    const step = readTutorialStep()
    const desired = new Set<HTMLButtonElement>()
    document.querySelectorAll('.composer-toolbar button').forEach(node => {
      if (!(node instanceof HTMLButtonElement)) return
      if (toolbarButtonKept(node, step)) return
      desired.add(node)
    })
    for (const mark of toolbarMarks) {
      if (desired.has(mark.el)) continue
      writeInert(mark.el, mark.wasInert)
      mark.el.style.pointerEvents = mark.pointerEvents
      mark.el.removeAttribute('data-tutorial-toolbar-locked')
    }
    const next: ToolbarMark[] = []
    for (const button of desired) {
      let mark = toolbarMarks.find(item => item.el === button)
      if (!mark) {
        mark = {
          el: button,
          wasInert: readInert(button),
          pointerEvents: button.style.pointerEvents,
        }
      }
      next.push(mark)
      if (!readInert(button)) writeInert(button, true)
      button.style.pointerEvents = 'none'
      button.setAttribute('data-tutorial-toolbar-locked', '')
    }
    toolbarMarks.length = 0
    toolbarMarks.push(...next)
  }

  const scrollBy = (deltaY: number) => {
    if (deltaY === 0) return
    try {
      const root = getTutorialScrollRoot()
      root.scrollToTop(root.getScrollTop() + deltaY)
    } catch {
      // jsdom does not implement Element.scrollTo.
    }
  }

  const ensureShield = (): SVGSVGElement => {
    if (shield?.isConnected) return shield
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    el.id = SHIELD_ID
    el.setAttribute('aria-hidden', 'true')
    el.style.position = 'fixed'
    el.style.inset = '0'
    el.style.zIndex = '9998'
    el.style.width = '100%'
    el.style.height = '100%'
    // The path, not the svg box, receives hits, so the even-odd holes stay open.
    el.style.pointerEvents = 'none'
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    // WebKit does not hit-test a transparent fill, so clicks fall through to the page.
    path.setAttribute('fill', 'rgba(0,0,0,0.02)')
    path.setAttribute('fill-rule', 'evenodd')
    path.setAttribute('pointer-events', 'fill')
    el.appendChild(path)
    const swallow = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
    }
    el.addEventListener('pointerdown', swallow)
    el.addEventListener('click', swallow)
    el.addEventListener(
      'wheel',
      event => {
        scrollBy(event.deltaY)
        event.preventDefault()
      },
      { passive: false }
    )
    let touchStartY = 0
    let touchStartScroll = 0
    el.addEventListener(
      'touchstart',
      event => {
        touchStartY = event.touches[0]?.clientY ?? 0
        try {
          touchStartScroll = getTutorialScrollRoot().getScrollTop()
        } catch {
          touchStartScroll = 0
        }
      },
      { passive: true }
    )
    el.addEventListener(
      'touchmove',
      event => {
        const y = event.touches[0]?.clientY ?? touchStartY
        let current = touchStartScroll
        try {
          current = getTutorialScrollRoot().getScrollTop()
        } catch {
          current = touchStartScroll
        }
        scrollBy(touchStartScroll + (touchStartY - y) - current)
        event.preventDefault()
      },
      { passive: false }
    )
    const parent = document.querySelector(PORTAL_SELECTOR) ?? document.body
    parent.appendChild(el)
    shield = el
    return el
  }

  const updateHoles = () => {
    if (disposed) return
    const el = ensureShield()
    const path = el.querySelector('path')
    if (!path) return
    const width = window.innerWidth
    const height = window.innerHeight
    let d = `M0,0 H${width} V${height} H0 Z`
    // Even-odd fill paints a point inside two holes. The submit button and the
    // history list are highlighted inside the composer, so those holes overlap
    // and the overlap becomes part of the shield. Merge overlapping holes.
    type Hole = { top: number; left: number; right: number; bottom: number }
    const overlaps = (a: Hole, b: Hole) =>
      a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom
    const holes: Hole[] = []
    for (const node of allowedElements()) {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 2 || rect.height <= 2) continue
      let next: Hole = {
        top: Math.round(rect.top - HOLE_PAD_PX),
        left: Math.round(rect.left - HOLE_PAD_PX),
        right: Math.round(rect.right + HOLE_PAD_PX),
        bottom: Math.round(rect.bottom + HOLE_PAD_PX),
      }
      let merged = true
      while (merged) {
        merged = false
        for (let i = holes.length - 1; i >= 0; i--) {
          const hole = holes[i]
          if (!hole || !overlaps(hole, next)) continue
          next = {
            top: Math.min(next.top, hole.top),
            left: Math.min(next.left, hole.left),
            right: Math.max(next.right, hole.right),
            bottom: Math.max(next.bottom, hole.bottom),
          }
          holes.splice(i, 1)
          merged = true
        }
      }
      holes.push(next)
    }
    for (const hole of holes) {
      d += ` M${hole.left},${hole.top} H${hole.right} V${hole.bottom} H${hole.left} Z`
    }
    path.setAttribute('d', d)
  }

  const applyInert = () => {
    const allowed = allowedElements()
    const focused =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null
    const desired = new Set<HTMLElement>()
    const visit = (node: Element) => {
      if (node.id === SHIELD_ID || node.closest(PORTAL_SELECTOR)) return
      if (allowed.some(target => target === node)) return
      const containsAllowed = allowed.some(target => node.contains(target))
      // Setting inert on an ancestor of the focused prompt blurs it and WebKit
      // drops the typed text. Walk past that ancestor instead.
      const containsFocus = focused != null && focused !== node && node.contains(focused)
      if (!containsAllowed && !containsFocus) {
        if (node instanceof HTMLElement) desired.add(node)
        return
      }
      for (const child of Array.from(node.children)) visit(child)
    }
    for (const child of Array.from(document.body.children)) visit(child)

    // Leave elements that are already inert untouched. Clearing and resetting
    // inert on every frame blurs the prompt field and drops the typed text.
    const next: InertMark[] = []
    for (const el of desired) {
      const existing = marked.find(mark => mark.el === el)
      if (existing) {
        next.push(existing)
        if (!readInert(el)) writeInert(el, true)
      } else {
        next.push({ el, was: readInert(el) })
        writeInert(el, true)
      }
    }
    for (const mark of marked) {
      if (!desired.has(mark.el)) writeInert(mark.el, mark.was)
    }
    marked.length = 0
    marked.push(...next)
  }

  const bindResize = () => {
    if (typeof ResizeObserver === 'undefined') return
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => scheduleApply())
    }
    const next = new Set(allowedElements())
    for (const el of observed) {
      if (next.has(el)) continue
      resizeObserver.unobserve(el)
      observed.delete(el)
    }
    for (const el of next) {
      if (observed.has(el)) continue
      observed.add(el)
      resizeObserver.observe(el)
    }
  }

  const apply = () => {
    if (disposed) return
    applyInert()
    syncToolbar()
    updateHoles()
    bindResize()
  }

  const scheduleApply = () => {
    if (disposed) return
    if (raf === 0) {
      raf = requestAnimationFrame(() => {
        raf = 0
        apply()
      })
    }
    if (timer == null) {
      timer = window.setTimeout(() => {
        timer = null
        apply()
      }, 48)
    }
  }

  apply()

  mutationObserver = new MutationObserver(records => {
    const relevant = records.some(record => {
      const node = record.target instanceof Element ? record.target : record.target.parentElement
      if (!node) return false
      return node.closest(`${PORTAL_SELECTOR}, #${SHIELD_ID}`) == null
    })
    if (!relevant) return
    scheduleApply()
  })
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })
  // Step changes publish data-tutorial-step on <html> before the highlight class moves.
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-tutorial-step'],
  })

  // Scrolling only moves the holes. Re-running inert on each frame blurs the
  // prompt on WebKit and the typed text disappears before submit.
  const stopMotion = trackTutorialMotion(() => {
    if (disposed) return
    updateHoles()
  })

  return () => {
    disposed = true
    if (raf !== 0) cancelAnimationFrame(raf)
    if (timer != null) window.clearTimeout(timer)
    mutationObserver?.disconnect()
    resizeObserver?.disconnect()
    stopMotion()
    restoreToolbar()
    restoreInert()
    if (scrollRoot) scrollRoot.style.overflowAnchor = previousOverflowAnchor
    shield?.remove()
    shield = null
  }
}

export function useTutorialInteractionLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return syncTutorialInteractionLock()
  }, [active])
}
