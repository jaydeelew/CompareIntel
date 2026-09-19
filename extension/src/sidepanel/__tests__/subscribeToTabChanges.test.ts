import { describe, expect, it, vi } from 'vitest'

import { subscribeToTabChanges } from '../subscribeToTabChanges'

function createTabsApi() {
  const activated = new Set<(...args: unknown[]) => void>()
  const updated = new Set<(...args: unknown[]) => void>()
  const removed = new Set<(...args: unknown[]) => void>()
  const created = new Set<(...args: unknown[]) => void>()

  return {
    onActivated: {
      addListener: (fn: (...args: unknown[]) => void) => activated.add(fn),
      removeListener: (fn: (...args: unknown[]) => void) => activated.delete(fn),
      emit: () => activated.forEach((fn) => fn({ tabId: 1, windowId: 1 })),
    },
    onUpdated: {
      addListener: (fn: (...args: unknown[]) => void) => updated.add(fn),
      removeListener: (fn: (...args: unknown[]) => void) => updated.delete(fn),
      emit: (changeInfo: chrome.tabs.TabChangeInfo) =>
        updated.forEach((fn) => fn(1, changeInfo)),
    },
    onRemoved: {
      addListener: (fn: (...args: unknown[]) => void) => removed.add(fn),
      removeListener: (fn: (...args: unknown[]) => void) => removed.delete(fn),
    },
    onCreated: {
      addListener: (fn: (...args: unknown[]) => void) => created.add(fn),
      removeListener: (fn: (...args: unknown[]) => void) => created.delete(fn),
    },
    _activated: activated,
    _updated: updated,
  }
}

describe('subscribeToTabChanges', () => {
  it('notifies on tab activation and useful updates, then unsubscribes', async () => {
    vi.useFakeTimers()
    const tabsApi = createTabsApi()
    const chromeStub = {
      tabs: tabsApi,
      windows: {
        onFocusChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    }
    vi.stubGlobal('chrome', chromeStub)

    const onChange = vi.fn()
    const unsubscribe = subscribeToTabChanges(onChange, 50)

    tabsApi.onActivated.emit()
    tabsApi.onUpdated.emit({ status: 'complete' })
    tabsApi.onUpdated.emit({ audible: true })
    await vi.advanceTimersByTimeAsync(50)

    expect(onChange).toHaveBeenCalledTimes(1)

    unsubscribe()
    tabsApi.onActivated.emit()
    await vi.advanceTimersByTimeAsync(50)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(tabsApi._activated.size).toBe(0)

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})
