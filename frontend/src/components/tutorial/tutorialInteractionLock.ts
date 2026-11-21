import { useEffect } from 'react'

import { getTutorialScrollRoot } from '../../utils/tutorialPositioning'

const SHIELD_ID = 'tutorial-interaction-shield'
const PORTAL_SELECTOR = '#tutorial-portal-root, #mobile-tutorial-portal-root'
const HIGHLIGHT_SELECTOR = '.tutorial-highlight, .mobile-tutorial-highlight'
const HOLE_PAD_PX = 8

type InertMark = { el: HTMLElement; was: boolean }

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
  let shield: SVGSVGElement | null = null
  let resizeObserver: ResizeObserver | null = null
  const observed = new Set<Element>()
  let mutationObserver: MutationObserver | null = null
  let raf = 0
  let timer: number | null = null
  let disposed = false

  const restoreInert = () => {
    for (const mark of marked) writeInert(mark.el, mark.was)
    marked.length = 0
  }

  const allowedElements = () => {
    const highlighted = Array.from(document.querySelectorAll(HIGHLIGHT_SELECTOR)).filter(
      el => !el.closest(PORTAL_SELECTOR)
    )
    const slot = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    )
    // The highlight class can land on the hero mirror before the portaled composer
    // mounts. The live composer is the one the step asks the user to type in.
    const composerHighlighted = highlighted.some(
      el => el.classList.contains('composer') || Boolean(el.closest('.composer'))
    )
    if (slot && composerHighlighted && !highlighted.includes(slot)) highlighted.push(slot)
    if (composerHighlighted) {
      document.querySelectorAll('.history-inline-list, .saved-selections-dropdown').forEach(el => {
        if (el.closest('.composer-hero-mirror') || highlighted.includes(el)) return
        highlighted.push(el)
      })
    }
    return highlighted
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
    path.setAttribute('fill', 'transparent')
    path.setAttribute('fill-rule', 'evenodd')
    path.setAttribute('pointer-events', 'fill')
    el.appendChild(path)
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
    const holes = allowedElements()
      .map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 2 && rect.height > 2)
    for (const rect of holes) {
      const top = Math.round(rect.top - HOLE_PAD_PX)
      const left = Math.round(rect.left - HOLE_PAD_PX)
      const right = Math.round(rect.right + HOLE_PAD_PX)
      const bottom = Math.round(rect.bottom + HOLE_PAD_PX)
      d += ` M${left},${top} H${right} V${bottom} H${left} Z`
    }
    path.setAttribute('d', d)
  }

  const applyInert = () => {
    restoreInert()
    const allowed = allowedElements()
    const visit = (node: Element) => {
      if (node.id === SHIELD_ID || node.closest(PORTAL_SELECTOR)) return
      if (allowed.some(target => target === node)) return
      if (!allowed.some(target => node.contains(target))) {
        if (node instanceof HTMLElement) {
          marked.push({ el: node, was: readInert(node) })
          writeInert(node, true)
        }
        return
      }
      for (const child of Array.from(node.children)) visit(child)
    }
    for (const child of Array.from(document.body.children)) visit(child)
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

  const onScroll = () => scheduleApply()
  const scrollListen: AddEventListenerOptions = { capture: true, passive: true }
  document.addEventListener('scroll', onScroll, scrollListen)
  window.addEventListener('resize', onScroll)
  document.querySelector('.app')?.addEventListener('scroll', onScroll, scrollListen)
  window.visualViewport?.addEventListener('resize', onScroll)

  return () => {
    disposed = true
    if (raf !== 0) cancelAnimationFrame(raf)
    if (timer != null) window.clearTimeout(timer)
    mutationObserver?.disconnect()
    resizeObserver?.disconnect()
    document.removeEventListener('scroll', onScroll, scrollListen)
    window.removeEventListener('resize', onScroll)
    document.querySelector('.app')?.removeEventListener('scroll', onScroll, scrollListen)
    window.visualViewport?.removeEventListener('resize', onScroll)
    restoreInert()
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
