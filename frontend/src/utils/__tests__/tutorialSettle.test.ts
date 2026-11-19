import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  prefersReducedTutorialMotion,
  setTutorialSpotlightSettling,
  tutorialBoxesNearlyEqual,
  waitForTutorialLayoutSettle,
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
})
