import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyCardScrollSnapshot,
  clearManualCardScroll,
  contentSkipsPromptAlign,
  isVerticalCardScroll,
  latestUserPromptScrollTop,
  markManualCardScroll,
  readCardScrollSnapshot,
  scrollContentToLatestUserPrompt,
  userManuallyScrolledCard,
  writeCardScrollSnapshot,
} from '../alignLatestUserPrompt'

function rect(top: number, height: number): DOMRect {
  return {
    top,
    left: 0,
    width: 120,
    height,
    bottom: top + height,
    right: 120,
    x: 0,
    y: top,
    toJSON() {
      return {}
    },
  } as DOMRect
}

describe('alignLatestUserPrompt', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    clearManualCardScroll('model-a')
  })

  it('scrolls so the latest user prompt sits at the top of the card', () => {
    const content = document.createElement('div')
    const first = document.createElement('div')
    first.className = 'conversation-message user'
    const last = document.createElement('div')
    last.className = 'conversation-message user'
    content.append(first, last)
    document.body.append(content)
    content.scrollTop = 40
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 400 })
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(rect(100, 400))
    vi.spyOn(last, 'getBoundingClientRect').mockReturnValue(rect(520, 48))
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '12px',
    } as CSSStyleDeclaration)

    expect(latestUserPromptScrollTop(content)).toBe(448)
    expect(scrollContentToLatestUserPrompt(content)).toBe(true)
    expect(content.scrollTop).toBe(448)
  })

  it('does not treat a single prompt as a follow-up alignment', () => {
    const content = document.createElement('div')
    const only = document.createElement('div')
    only.className = 'conversation-message user'
    content.append(only)
    vi.spyOn(only, 'getBoundingClientRect').mockReturnValue(rect(20, 40))
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(rect(0, 200))
    expect(latestUserPromptScrollTop(content)).toBeNull()
  })

  it('remembers a manual scroll for that follow-up round', () => {
    const content = document.createElement('div')
    content.dataset.modelId = 'model-a'
    markManualCardScroll('model-a', 2, content)
    expect(userManuallyScrolledCard('model-a', 2)).toBe(true)
    expect(userManuallyScrolledCard('model-a', 3)).toBe(false)
    expect(contentSkipsPromptAlign(content, 2)).toBe(true)
    clearManualCardScroll('model-a')
    expect(contentSkipsPromptAlign(content, 2)).toBe(true)
  })

  it('restores the scroll a card had when it unmounted', () => {
    const content = document.createElement('div')
    content.dataset.promptAlignPad = '80'
    content.dataset.promptAlignBasePad = '12'
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 400 })
    content.scrollTop = 220
    writeCardScrollSnapshot('model-a', 2, content, { opened: true })

    const snap = readCardScrollSnapshot('model-a', 2)
    expect(snap).toMatchObject({ scrollTop: 220, pad: 80, basePad: 12, opened: true, round: 2 })
    expect(readCardScrollSnapshot('model-a', 3)).toBeNull()

    const next = document.createElement('div')
    Object.defineProperty(next, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(next, 'clientHeight', { configurable: true, value: 400 })
    applyCardScrollSnapshot(next, snap!)
    expect(next.scrollTop).toBe(220)
    expect(next.style.paddingBottom).toBe('92px')
  })

  it('keeps a saved scroll when a remount is not scrollable yet', () => {
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 400 })
    content.scrollTop = 220
    writeCardScrollSnapshot('model-a', 2, content, { opened: true })

    const fresh = document.createElement('div')
    Object.defineProperty(fresh, 'scrollHeight', { configurable: true, value: 0 })
    Object.defineProperty(fresh, 'clientHeight', { configurable: true, value: 0 })
    fresh.scrollTop = 0
    writeCardScrollSnapshot('model-a', 2, fresh)
    expect(readCardScrollSnapshot('model-a', 2)).toMatchObject({ scrollTop: 220, opened: true })
  })

  it('treats a sideways swipe as a tab change, not a card scroll', () => {
    expect(isVerticalCardScroll(160, 28)).toBe(false)
    expect(isVerticalCardScroll(4, 40)).toBe(true)
    expect(isVerticalCardScroll(0, 8)).toBe(false)
  })
})
