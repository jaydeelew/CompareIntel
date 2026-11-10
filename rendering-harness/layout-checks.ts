/**
 * Browser-side layout checks. Passed to page.evaluate, so helpers stay inside
 * the function and nothing here can touch Node.
 */

export interface LayoutIssue {
  kind: 'page-overflow' | 'clipped-katex' | 'text-overlap' | 'dark-contrast' | 'dark-theme'
  detail: string
  heading: string
  sample: string
}

export function collectLayoutIssues(mode: string): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const container = document.querySelector('[data-render-container]')
  if (!container) {
    issues.push({ kind: 'page-overflow', detail: 'render container missing', heading: '', sample: '' })
    return issues
  }

  const nearestHeading = (el: Element): string => {
    let node: Element | null = el
    while (node) {
      let prev: Element | null = node
      while (prev) {
        if (/^H[1-6]$/.test(prev.tagName)) return (prev.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180)
        prev = prev.previousElementSibling
      }
      node = node.parentElement
    }
    return ''
  }

  const sampleOf = (el: Element): string => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)

  const pageRight = document.documentElement.clientWidth
  const intendedSelector =
    '.markdown-table-scroll, .code-block-direct, .preformatted-text, pre, .katex-display, code.inline-code'
  const absorbs = (host: Element): boolean => {
    if (!host.matches(intendedSelector)) return false
    const overflow = getComputedStyle(host).overflowX
    if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'hidden' && overflow !== 'clip') return false
    const box = host.getBoundingClientRect()
    return box.left >= -1.5 && box.right <= pageRight + 1.5
  }

  const insideAbsorber = (el: Element): boolean => {
    let node: Element | null = el.parentElement
    while (node && node !== document.documentElement) {
      if (absorbs(node)) return true
      if (node instanceof HTMLElement) {
        const ox = getComputedStyle(node).overflowX
        if (
          (ox === 'auto' || ox === 'scroll' || ox === 'overlay') &&
          node.scrollWidth > node.clientWidth + 4
        ) {
          const box = node.getBoundingClientRect()
          if (box.left >= -1.5 && box.right <= pageRight + 1.5) return true
        }
      }
      node = node.parentElement
    }
    return false
  }

  const hostsWideScrollers = (host: Element): boolean => {
    for (const child of host.querySelectorAll(intendedSelector)) {
      if (!(child instanceof HTMLElement)) continue
      const ox = getComputedStyle(child).overflowX
      if (
        (ox === 'auto' || ox === 'scroll' || ox === 'overlay') &&
        child.scrollWidth > child.clientWidth + 4
      ) {
        return true
      }
    }
    return false
  }

  const seenOverflow = new Set<string>()
  for (const el of Array.from(container.querySelectorAll('*'))) {
    if (!(el instanceof HTMLElement)) continue
    if (el.closest('script, style, .katex-mathml')) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    const style = getComputedStyle(el)
    const sticksOut = rect.right > pageRight + 1.5 || rect.left < -1.5
    // Block boxes stay inside the page while nowrap text paints past them.
    // Only visible overflow counts as page overflow; a scroller clips its own.
    const contentWider =
      style.overflowX === 'visible' &&
      el.clientWidth > 0 &&
      el.scrollWidth > el.clientWidth + 4 &&
      !absorbs(el)
    if (!sticksOut && !contentWider) continue
    if (insideAbsorber(el)) continue
    if (absorbs(el)) continue
    if (el.tagName === 'CODE' && el.closest('pre, .code-block, .code-block-direct')) continue
  if (contentWider && !sticksOut && hostsWideScrollers(el)) continue
    const key = `${el.tagName}:${Math.round(rect.left)}:${sampleOf(el).slice(0, 40)}`
    if (seenOverflow.has(key)) continue
    seenOverflow.add(key)
    issues.push({
      kind: 'page-overflow',
      detail: sticksOut
        ? `${el.tagName.toLowerCase()} extends to ${Math.round(rect.right)}px past the ${Math.round(pageRight)}px page`
        : `${el.tagName.toLowerCase()} content is ${el.scrollWidth}px inside a ${el.clientWidth}px box`,
      heading: nearestHeading(el),
      sample: sampleOf(el),
    })
    if (seenOverflow.size >= 6) break
  }

  for (const katex of Array.from(container.querySelectorAll('.katex'))) {
    const display = katex.closest('.katex-display')
    const fragments = Array.from(katex.getClientRects()).filter(rect => rect.width >= 1 && rect.height >= 1)
    let clipped = false
    let why = ''
    for (const rect of fragments) {
      let node: Element | null = katex.parentElement
      while (node && node !== document.body) {
        const style = getComputedStyle(node)
        const box = node.getBoundingClientRect()
        const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip'
        const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip'
        const horizontalScroll =
          Boolean(display) &&
          (node === display || node.contains(display)) &&
          (style.overflowX === 'auto' || style.overflowX === 'scroll' || clipsX)
        if (!horizontalScroll && clipsX && (rect.right > box.right + 2 || rect.left < box.left - 2)) {
          clipped = true
          why = `horizontal clip by ${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}`
          break
        }
        if (clipsY && (rect.bottom > box.bottom + 2 || rect.top < box.top - 2)) {
          clipped = true
          why = `vertical clip by ${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}`
          break
        }
        node = node.parentElement
      }
      if (clipped) break
    }
    if (clipped) {
      issues.push({
        kind: 'clipped-katex',
        detail: why,
        heading: nearestHeading(katex),
        sample: sampleOf(katex),
      })
      if (issues.filter(issue => issue.kind === 'clipped-katex').length >= 6) break
    }
  }

  interface Box {
    top: number
    bottom: number
    left: number
    right: number
    text: string
    parent: Element
  }
  const boxes: Box[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement
    if (!parent) continue
    if (parent.closest('.katex, script, style, .katex-mathml, pre, code')) continue
    const text = walker.currentNode.textContent || ''
    if (!text.trim()) continue
    const range = document.createRange()
    range.selectNodeContents(walker.currentNode)
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width < 2 || rect.height < 2) continue
      boxes.push({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        text: text.replace(/\s+/g, ' ').trim().slice(0, 40),
        parent,
      })
    }
  }
  for (const katex of Array.from(container.querySelectorAll('.katex'))) {
    const text = (katex.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    for (const rect of Array.from(katex.getClientRects())) {
      if (rect.width < 2 || rect.height < 2) continue
      boxes.push({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        text,
        parent: katex,
      })
    }
  }
  boxes.sort((a, b) => a.top - b.top || a.left - b.left)
  let overlaps = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[j].top >= boxes[i].bottom - 1) break
      const a = boxes[i]
      const b = boxes[j]
      if (a.parent === b.parent || a.parent.contains(b.parent) || b.parent.contains(a.parent)) continue
      const overlapLeft = Math.max(a.left, b.left)
      const overlapRight = Math.min(a.right, b.right)
      const overlapTop = Math.max(a.top, b.top)
      const overlapBottom = Math.min(a.bottom, b.bottom)
      const width = overlapRight - overlapLeft
      const height = overlapBottom - overlapTop
      if (width < 4 || height < 4) continue
      const areaA = (a.right - a.left) * (a.bottom - a.top)
      const areaB = (b.right - b.left) * (b.bottom - b.top)
      const smallerArea = Math.min(areaA, areaB)
      if (smallerArea <= 0 || (width * height) / smallerArea < 0.35) continue
      // Inline KaTeX is taller than the line box, so neighboring lines share an
      // edge. A real collision covers the middle of the smaller box.
      const smaller = areaA <= areaB ? a : b
      const midX = (smaller.left + smaller.right) / 2
      const midY = (smaller.top + smaller.bottom) / 2
      if (midX < overlapLeft || midX > overlapRight || midY < overlapTop || midY > overlapBottom) continue
      overlaps += 1
      issues.push({
        kind: 'text-overlap',
        detail: `"${a.text}" overlaps "${b.text}"`,
        heading: nearestHeading(a.parent),
        sample: a.text,
      })
      if (overlaps >= 6) break
    }
    if (overlaps >= 6) break
  }

  if (mode === 'dark') {
    const theme = document.documentElement.getAttribute('data-theme')
    const scheme = document.documentElement.style.colorScheme || getComputedStyle(document.documentElement).colorScheme
    if (theme !== 'dark' || !scheme.includes('dark')) {
      issues.push({
        kind: 'dark-theme',
        detail: `data-theme=${theme || 'unset'} color-scheme=${scheme || 'unset'}`,
        heading: '',
        sample: '',
      })
    }

    const parse = (value: string): { r: number; g: number; b: number; a: number } | null => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(',').map(part => parseFloat(part.trim()))
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
    }
    const channel = (value: number) => {
      const scaled = value / 255
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
    }
    const lum = (color: { r: number; g: number; b: number }) =>
      0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
    const over = (
      top: { r: number; g: number; b: number; a: number },
      bottom: { r: number; g: number; b: number; a: number }
    ) => {
      const a = top.a + bottom.a * (1 - top.a)
      const mix = (t: number, b: number) => (a === 0 ? 0 : (t * top.a + b * bottom.a * (1 - top.a)) / a)
      return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a }
    }
    const backgroundOf = (el: Element) => {
      const chain: Element[] = []
      let node: Element | null = el
      while (node) {
        chain.push(node)
        node = node.parentElement
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 }
      for (const item of chain.reverse()) {
        const color = parse(getComputedStyle(item).backgroundColor)
        if (color && color.a > 0) bg = over(color, bg)
      }
      return bg
    }

    let contrasts = 0
    for (const el of Array.from(container.querySelectorAll('p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote'))) {
      if (el.closest('pre, code, .katex')) continue
      const ownText = Array.from(el.childNodes).some(
        node => node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim().length > 0
      )
      if (!ownText) continue
      const fg = parse(getComputedStyle(el).color)
      if (!fg) continue
      const bg = backgroundOf(el)
      const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05)
      if (ratio >= 3) continue
      contrasts += 1
      issues.push({
        kind: 'dark-contrast',
        detail: `${el.tagName.toLowerCase()} contrast ${ratio.toFixed(2)}`,
        heading: nearestHeading(el),
        sample: sampleOf(el),
      })
      if (contrasts >= 6) break
    }
  }

  return issues
}
