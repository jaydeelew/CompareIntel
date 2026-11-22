import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  prefersReducedTutorialMotion,
  setTutorialSpotlightSettling,
  trackTutorialMotion,
  tutorialBoxesNearlyEqual,
  waitForTutorialLayoutSettle,
  watchTutorialFrameSize,
} from '../tutorialSettle'

describe('tutorialSettle', () => {
  afterEach(() => {
    document.documentElement.classList.remove('tutorial-spotlight-settling')
    vi.restoreAllMocks()
  })

  it('toggles the settling class used to hide highlights during a step change', () => {
    setTutorialSpotlightSettling(true)
    expect(document.documentElement.classList.contains('tutorial-spotlight-settling')).toBe(true)
    setTutorialSpotlightSettling(false)
    expect(document.documentElement.classList.contains('tutorial-spotlight-settling')).toBe(false)
  })

  it('treats sub-pixel box changes as the same placement', () => {
    const box = { top: 10, left: 20, width: 100, height: 40 }
    expect(tutorialBoxesNearlyEqual(box, { ...box, top: 11 })).toBe(true)
    expect(tutorialBoxesNearlyEqual(box, { ...box, top: 14 })).toBe(false)
    expect(tutorialBoxesNearlyEqual(null, null)).toBe(true)
    expect(tutorialBoxesNearlyEqual(box, null)).toBe(false)
  })

  it('resolves after the quiet period when the page is still', async () => {
    const start = performance.now()
    await waitForTutorialLayoutSettle({ timeoutMs: 400, quietMs: 30 })
    expect(performance.now() - start).toBeGreaterThanOrEqual(25)
    expect(performance.now() - start).toBeLessThan(350)
  })

  it('does not resolve while visualViewport keeps resizing', async () => {
    const listeners = new Map<string, Set<() => void>>()
    const viewport = {
      height: 800,
      offsetTop: 0,
      width: 400,
      addEventListener: (type: string, fn: () => void) => {
        const set = listeners.get(type) ?? new Set()
        set.add(fn)
        listeners.set(type, set)
      },
      removeEventListener: (type: string, fn: () => void) => {
        listeners.get(type)?.delete(fn)
      },
    }
    vi.stubGlobal('visualViewport', viewport)

    let resolved = false
    const pending = waitForTutorialLayoutSettle({ timeoutMs: 500, quietMs: 40 }).then(() => {
      resolved = true
    })

    await new Promise(r => setTimeout(r, 20))
    viewport.height = 420
    listeners.get('resize')?.forEach(fn => fn())
    await new Promise(r => setTimeout(r, 25))
    expect(resolved).toBe(false)

    await pending
    expect(resolved).toBe(true)
  })

  it('resolves through 1px visualViewport jitter', async () => {
    const listeners = new Map<string, Set<() => void>>()
    const viewport = {
      height: 800,
      offsetTop: 0,
      width: 400,
      addEventListener: (type: string, fn: () => void) => {
        const set = listeners.get(type) ?? new Set()
        set.add(fn)
        listeners.set(type, set)
      },
      removeEventListener: (type: string, fn: () => void) => {
        listeners.get(type)?.delete(fn)
      },
    }
    vi.stubGlobal('visualViewport', viewport)

    const start = performance.now()
    const pending = waitForTutorialLayoutSettle({ timeoutMs: 500, quietMs: 40 })
    await new Promise(r => setTimeout(r, 15))
    viewport.offsetTop = 1
    listeners.get('scroll')?.forEach(fn => fn())
    await pending
    expect(performance.now() - start).toBeLessThan(200)
  })

  it('reads prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      query =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    )
    expect(prefersReducedTutorialMotion()).toBe(true)
  })

  it('remeasures when a target resizes and when a panel mounts', async () => {
    const callbacks: ResizeObserverCallback[] = []
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    const app = document.createElement('div')
    app.className = 'app'
    document.body.appendChild(app)
    const composer = document.createElement('div')
    composer.className = 'composer'
    app.appendChild(composer)

    const onChange = vi.fn()
    const stop = watchTutorialFrameSize(onChange)
    composer.getBoundingClientRect = () => ({ width: 320, height: 180 }) as DOMRect
    callbacks[0]?.([], {} as ResizeObserver)
    await new Promise(r => setTimeout(r, 60))
    expect(onChange).toHaveBeenCalled()

    onChange.mockClear()
    const panel = document.createElement('div')
    panel.className = 'history-inline-list'
    panel.getBoundingClientRect = () => ({ width: 320, height: 120 }) as DOMRect
    composer.appendChild(panel)
    await new Promise(r => setTimeout(r, 60))
    expect(onChange).toHaveBeenCalled()

    stop()
    app.remove()
    vi.unstubAllGlobals()
  })

  it('samples the target on the next frame while a touch is down', async () => {
    const composer = document.createElement('div')
    composer.className = 'composer'
    let top = 40
    composer.getBoundingClientRect = () =>
      ({ top, left: 8, width: 300, height: 120, right: 308, bottom: top + 120 }) as DOMRect
    document.body.append(composer)
    let calls = 0
    const stop = trackTutorialMotion(() => {
      calls += 1
    })
    document.dispatchEvent(new Event('touchstart'))
    top = 160
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    expect(calls).toBeGreaterThan(0)
    document.dispatchEvent(new Event('touchend'))
    stop()
    composer.remove()
  })

  it('follows scroll on a nested scroll ancestor and visualViewport', async () => {
    const scroller = document.createElement('div')
    scroller.className = 'results-section'
    scroller.style.overflow = 'auto'
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    document.body.append(scroller)

    const listeners = new Map<string, EventListener>()
    const previous = window.visualViewport
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        offsetTop: 0,
        offsetLeft: 0,
        height: 700,
        width: 390,
        addEventListener: (type: string, cb: EventListener) => listeners.set(type, cb),
        removeEventListener: () => undefined,
      },
    })

    let calls = 0
    const stop = trackTutorialMotion(() => {
      calls += 1
    })
    scroller.dispatchEvent(new Event('scroll'))
    listeners.get('scroll')?.(new Event('scroll'))
    await new Promise(r => setTimeout(r, 70))
    expect(calls).toBeGreaterThan(0)
    stop()
    scroller.remove()
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: previous })
  })
})
