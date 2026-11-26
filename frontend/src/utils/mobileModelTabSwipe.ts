const HORIZONTAL_OVERFLOW = new Set(['auto', 'scroll', 'overlay'])

/** True when this element can pan sideways on its own. */
export function isHorizontallyScrollableElement(node: Element): boolean {
  const overflowX = window.getComputedStyle(node).overflowX
  if (!HORIZONTAL_OVERFLOW.has(overflowX)) return false
  return node.scrollWidth > node.clientWidth + 2
}

/**
 * A horizontal swipe that starts inside a horizontally scrollable region
 * (wide code, a table, display math, mermaid, or any overflow-x auto/scroll
 * box) belongs to that region. It must not also switch model tabs.
 *
 * This stays true when the region is already at its scroll edge. The browser
 * owns the gesture, including the rubber-band at the end. Turning the leftover
 * movement into a tab change makes one finger motion both scroll and jump.
 */
export function shouldSuppressMobileModelTabSwipe(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null
  if (!el) return false

  let node: Element | null = el
  while (node && !node.classList.contains('results-tabs-container')) {
    if (isHorizontallyScrollableElement(node)) return true
    node = node.parentElement
  }
  return false
}
