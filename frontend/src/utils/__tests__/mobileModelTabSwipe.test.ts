/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'

import { shouldSuppressMobileModelTabSwipe } from '../mobileModelTabSwipe'

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

function markScrollable(el: HTMLElement, clientWidth: number, scrollWidth: number) {
  el.style.overflowX = 'auto'
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth })
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth })
}

describe('shouldSuppressMobileModelTabSwipe', () => {
  it('lets a swipe on prose switch models', () => {
    const host = mount(`
      <div class="results-tabs-container">
        <p class="prose">For normal use, math.sqrt is enough.</p>
      </div>
    `)
    const prose = host.querySelector('.prose')!
    expect(shouldSuppressMobileModelTabSwipe(prose)).toBe(false)
    host.remove()
  })

  it('keeps a swipe that starts on overflowing code, math, a table, or mermaid', () => {
    const host = mount(`
      <div class="results-tabs-container">
        <pre class="code-block"><code class="token">print(x)</code></pre>
        <div class="katex-display"><span class="katex">math</span></div>
        <div class="markdown-table-scroll"><table><td>wide</td></table></div>
        <div class="mermaid"><svg><text>diagram</text></svg></div>
      </div>
    `)
    for (const selector of [
      '.code-block',
      '.katex-display',
      '.markdown-table-scroll',
      '.mermaid',
    ]) {
      const box = host.querySelector(selector) as HTMLElement
      markScrollable(box, 180, 640)
      const inner = box.firstElementChild!
      expect(shouldSuppressMobileModelTabSwipe(inner)).toBe(true)
    }
    host.remove()
  })

  it('still switches models when the code block fits without scrolling', () => {
    const host = mount(`
      <div class="results-tabs-container">
        <pre class="code-block"><code>x = 1</code></pre>
      </div>
    `)
    const code = host.querySelector('.code-block') as HTMLElement
    markScrollable(code, 180, 180)
    expect(shouldSuppressMobileModelTabSwipe(code.querySelector('code'))).toBe(false)
    host.remove()
  })

  it('does not switch models when the block is already scrolled to the edge', () => {
    const host = mount(`
      <div class="results-tabs-container">
        <pre class="code-block"><code>wide</code></pre>
      </div>
    `)
    const code = host.querySelector('.code-block') as HTMLElement
    markScrollable(code, 180, 640)
    Object.defineProperty(code, 'scrollLeft', { configurable: true, value: 460 })
    expect(shouldSuppressMobileModelTabSwipe(code.querySelector('code'))).toBe(true)
    host.remove()
  })
})
