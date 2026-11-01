import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESTRICTED_PAGE_MESSAGE } from '../../shared/urlPolicy'

const tabsQuery = vi.fn()
const tabsGet = vi.fn()
const executeScript = vi.fn()
const onUpdated = { addListener: vi.fn() }
const onRemoved = { addListener: vi.fn() }

vi.stubGlobal('chrome', {
  tabs: {
    query: (...args: unknown[]) => tabsQuery(...args),
    get: (...args: unknown[]) => tabsGet(...args),
    onUpdated,
    onRemoved,
  },
  windows: {
    getLastFocused: vi.fn().mockResolvedValue({ id: 1 }),
  },
  scripting: {
    executeScript: (...args: unknown[]) => executeScript(...args),
  },
})

import { TabContextManager } from '../tabContextManager'

describe('TabContextManager', () => {
  let manager: TabContextManager

  beforeEach(() => {
    tabsQuery.mockReset()
    tabsGet.mockReset()
    executeScript.mockReset()
    manager = new TabContextManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('captures the invoked tab with executeScript and returns it as the active tab', async () => {
    executeScript.mockResolvedValue([
      {
        result: {
          url: 'https://example.com/docs',
          title: 'Docs',
          text: 'page text',
          selection: 'chosen',
        },
      },
    ])
    tabsQuery.mockResolvedValue([
      { id: 12, url: 'https://example.com/docs', title: 'Docs', favIconUrl: 'https://example.com/i.png' },
    ])
    tabsGet.mockResolvedValue({
      id: 12,
      url: 'https://example.com/docs',
      title: 'Docs',
      favIconUrl: 'https://example.com/i.png',
    })

    await manager.captureTab({
      id: 12,
      url: 'https://example.com/docs',
      title: 'Docs',
      favIconUrl: 'https://example.com/i.png',
    })

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 12 },
      func: expect.any(Function),
    })

    const active = await manager.handleMessage({ type: 'GET_ACTIVE_TAB' })
    expect(active).toMatchObject({
      type: 'ACTIVE_TAB',
      tab: { tabId: 12, url: 'https://example.com/docs', title: 'Docs' },
    })

    const selection = await manager.handleMessage({ type: 'GET_SELECTION', tabId: 12 })
    expect(selection).toEqual({ type: 'SELECTION', text: 'chosen' })
  })

  it('returns a clear restriction for chrome:// and the Web Store', async () => {
    tabsQuery.mockResolvedValue([{ id: 3, url: 'chrome://newtab', title: 'New Tab' }])

    await manager.captureTab({ id: 3, url: 'chrome://newtab', title: 'New Tab' })
    const response = await manager.handleMessage({ type: 'GET_ACTIVE_TAB' })
    expect(response).toMatchObject({
      type: 'ACTIVE_TAB',
      tab: null,
      restriction: { tabId: 3, message: RESTRICTED_PAGE_MESSAGE },
    })
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('does not list tabs that lack a visible extractable URL', async () => {
    tabsQuery.mockResolvedValue([
      { id: 1, title: 'Hidden' },
      { id: 2, url: 'chrome://extensions', title: 'Extensions' },
      { id: 3, url: 'https://compareintel.com/app', title: 'CompareIntel' },
    ])

    const response = await manager.handleMessage({ type: 'LIST_TABS', allWindows: true })
    expect(response).toEqual({
      type: 'TABS_LIST',
      tabs: [
        {
          tabId: 3,
          url: 'https://compareintel.com/app',
          title: 'CompareIntel',
          favIconUrl: undefined,
          pinned: false,
        },
      ],
    })
  })

  it('does not read page text on GET_ACTIVE_TAB', async () => {
    tabsQuery.mockResolvedValue([
      { id: 12, url: 'https://example.com/docs', title: 'Docs' },
    ])
    await manager.handleMessage({ type: 'GET_ACTIVE_TAB' })
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('evicts cached page text on navigation and tab close', async () => {
    executeScript.mockResolvedValue([
      {
        result: {
          url: 'https://example.com/docs',
          title: 'Docs',
          text: 'page text',
          selection: 'chosen',
        },
      },
    ])
    tabsGet.mockResolvedValue({
      id: 12,
      url: 'https://example.com/docs',
      title: 'Docs',
    })
    await manager.captureTab({
      id: 12,
      url: 'https://example.com/docs',
      title: 'Docs',
    })
    expect(await manager.handleMessage({ type: 'GET_SELECTION', tabId: 12 })).toEqual({
      type: 'SELECTION',
      text: 'chosen',
    })

    const onUpdatedCb = onUpdated.addListener.mock.calls.at(-1)?.[0] as (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => void
    onUpdatedCb(12, { url: 'https://example.com/other' })
    executeScript.mockClear()
    executeScript.mockResolvedValue([{ result: { selection: '' } }])
    await manager.handleMessage({ type: 'GET_SELECTION', tabId: 12 })
    expect(executeScript).toHaveBeenCalled()

    executeScript.mockClear()
    executeScript.mockResolvedValue([
      {
        result: {
          url: 'https://example.com/docs',
          title: 'Docs',
          text: 'page text',
          selection: 'chosen',
        },
      },
    ])
    const onRemovedCb = onRemoved.addListener.mock.calls.at(-1)?.[0] as (tabId: number) => void
    await manager.captureTab({
      id: 12,
      url: 'https://example.com/docs',
      title: 'Docs',
    })
    onRemovedCb(12)
    executeScript.mockClear()
    executeScript.mockResolvedValue([{ result: { selection: 'fresh' } }])
    await manager.handleMessage({ type: 'GET_SELECTION', tabId: 12 })
    expect(executeScript).toHaveBeenCalled()
  })

  it('records an extraction failure for restricted pages instead of injecting', async () => {
    tabsGet.mockResolvedValue({ id: 8, url: 'https://chromewebstore.google.com/detail/x', title: 'Store' })

    const response = await manager.handleMessage({
      type: 'GET_TAB_CONTEXT',
      tabIds: [8],
    })
    expect(response).toMatchObject({
      type: 'TAB_CONTEXT',
      bundle: {
        tabs: [],
        extractionFailures: [
          {
            tabId: 8,
            url: 'https://chromewebstore.google.com/detail/x',
            title: 'Store',
          },
        ],
      },
    })
    expect(executeScript).not.toHaveBeenCalled()
  })
})
