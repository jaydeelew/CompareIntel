import { beforeEach, describe, expect, it, vi } from 'vitest'

const tabsCreate = vi.fn()
const tabsUpdate = vi.fn()
const sidebarClose = vi.fn()

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      create: (...args: unknown[]) => tabsCreate(...args),
      update: (...args: unknown[]) => tabsUpdate(...args),
      query: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn(),
      },
    },
    sidebarAction: {
      close: (...args: unknown[]) => sidebarClose(...args),
    },
  },
}))

import { openUrlWithoutSidePanel } from '../sidePanelController'

describe('openUrlWithoutSidePanel', () => {
  beforeEach(() => {
    tabsCreate.mockReset()
    tabsUpdate.mockReset()
    sidebarClose.mockReset()
    tabsCreate.mockResolvedValue({ id: 42 })
    tabsUpdate.mockResolvedValue({ id: 42 })
    sidebarClose.mockResolvedValue(undefined)
  })

  it('opens the tab with the side panel disabled and closed', async () => {
    const setOptions = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('chrome', {
      sidePanel: { setOptions, close },
    })

    await openUrlWithoutSidePanel('https://compareintel.com/?handoff=1')

    expect(tabsCreate).toHaveBeenCalledWith({
      url: 'https://compareintel.com/?handoff=1',
      active: false,
    })
    expect(setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false })
    expect(tabsUpdate).toHaveBeenCalledWith(42, { active: true })
    expect(close).toHaveBeenCalledWith({ tabId: 42 })
    expect(sidebarClose).toHaveBeenCalled()

    const setOptionsOrder = setOptions.mock.invocationCallOrder[0]
    const updateOrder = tabsUpdate.mock.invocationCallOrder[0]
    const closeOrder = close.mock.invocationCallOrder[0]
    expect(setOptionsOrder).toBeLessThan(updateOrder)
    expect(updateOrder).toBeLessThan(closeOrder)

    vi.unstubAllGlobals()
  })
})
