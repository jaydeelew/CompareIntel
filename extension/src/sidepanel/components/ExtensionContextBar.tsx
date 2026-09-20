import { useCallback, useEffect, useRef, useState } from 'react'

import { sendTabContextMessage } from '../messaging'
import { subscribeToTabChanges } from '../subscribeToTabChanges'
import {
  addPinnedContext,
  matchOpenTabsToContexts,
  normalizePageUrl,
  promoteActiveContextsToPinned,
  removePageContext,
  replaceActiveContext,
  samePageContexts,
  type SavedPageContext,
} from '../utils/pageContextSnapshot'

interface TabInfo {
  tabId: number
  url: string
  title: string
  favIconUrl?: string
}

interface ExtensionContextBarProps {
  sharePageContext: boolean
  onSharePageContextChange: (enabled: boolean) => void
  pageContexts: SavedPageContext[]
  onPageContextsChange: (contexts: SavedPageContext[]) => void
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  restoreKey?: string
}

export function ExtensionContextBar({
  sharePageContext,
  onSharePageContextChange,
  pageContexts,
  onPageContextsChange,
  collapsed,
  onCollapsedChange,
  restoreKey,
}: ExtensionContextBarProps) {
  const [activeTab, setActiveTab] = useState<TabInfo | null>(null)
  const [openTabs, setOpenTabs] = useState<TabInfo[]>([])
  const [showTabPicker, setShowTabPicker] = useState(false)

  const pageContextsRef = useRef(pageContexts)
  const sharePageContextRef = useRef(sharePageContext)
  const activeTabRef = useRef(activeTab)
  const restoreDoneRef = useRef(!restoreKey)
  const onPageContextsChangeRef = useRef(onPageContextsChange)
  const onSharePageContextChangeRef = useRef(onSharePageContextChange)
  const syncGenerationRef = useRef(0)
  const syncQueueRef = useRef(Promise.resolve())

  sharePageContextRef.current = sharePageContext
  activeTabRef.current = activeTab
  onPageContextsChangeRef.current = onPageContextsChange
  onSharePageContextChangeRef.current = onSharePageContextChange

  useEffect(() => {
    pageContextsRef.current = pageContexts
  }, [pageContexts])

  const emitPageContexts = useCallback((next: SavedPageContext[]) => {
    if (samePageContexts(pageContextsRef.current, next)) return
    pageContextsRef.current = next
    onPageContextsChangeRef.current(next)
  }, [])

  const syncBackgroundPins = useCallback((contexts: SavedPageContext[]) => {
    const generation = ++syncGenerationRef.current
    syncQueueRef.current = syncQueueRef.current
      .then(async () => {
        if (generation !== syncGenerationRef.current) return
        const listRes = await sendTabContextMessage({ type: 'LIST_TABS', allWindows: true })
        if (generation !== syncGenerationRef.current) return
        const tabs = listRes.type === 'TABS_LIST' ? listRes.tabs : []
        setOpenTabs(tabs)
        const tabIds = matchOpenTabsToContexts(contexts, tabs)
        if (generation !== syncGenerationRef.current) return
        await sendTabContextMessage({ type: 'SET_PINNED_TABS', tabIds })
      })
      .catch(() => undefined)
  }, [])

  const pinnedKey = pageContexts
    .filter((context) => context.source === 'pinned')
    .map((context) => normalizePageUrl(context.url))
    .join('\n')

  useEffect(() => {
    syncBackgroundPins(pageContextsRef.current)
  }, [pinnedKey, syncBackgroundPins])

  useEffect(() => {
    let lastKey = ''
    const pollActiveTab = async () => {
      const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
      const tab = activeRes.type === 'ACTIVE_TAB' ? activeRes.tab : null
      const nextKey = tab ? `${tab.tabId}|${tab.url}|${tab.title}` : ''
      const tabChanged = nextKey !== lastKey
      if (tabChanged) {
        lastKey = nextKey
        setActiveTab(tab)
        activeTabRef.current = tab
      }
      if (!restoreDoneRef.current || !tabChanged) return
      emitPageContexts(
        replaceActiveContext(pageContextsRef.current, tab, sharePageContextRef.current)
      )
    }

    void pollActiveTab().catch(() => undefined)
    return subscribeToTabChanges(() => {
      void pollActiveTab().catch(() => undefined)
    })
  }, [emitPageContexts])

  useEffect(() => {
    emitPageContexts(
      replaceActiveContext(pageContextsRef.current, activeTabRef.current, sharePageContext)
    )
  }, [emitPageContexts, sharePageContext])

  useEffect(() => {
    restoreDoneRef.current = !restoreKey
    if (!restoreKey || pageContextsRef.current.length === 0) {
      restoreDoneRef.current = true
      return
    }

    const promoted = promoteActiveContextsToPinned(pageContextsRef.current)
    emitPageContexts(promoted)

    const finishRestore = async () => {
      const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
      const tab = activeRes.type === 'ACTIVE_TAB' ? activeRes.tab : null
      const savedUrls = new Set(promoted.map((context) => normalizePageUrl(context.url)))
      if (tab && !savedUrls.has(normalizePageUrl(tab.url))) {
        sharePageContextRef.current = false
        onSharePageContextChangeRef.current(false)
      }
      restoreDoneRef.current = true
      emitPageContexts(
        replaceActiveContext(pageContextsRef.current, tab, sharePageContextRef.current)
      )
    }

    void finishRestore().catch(() => {
      restoreDoneRef.current = true
    })
  }, [emitPageContexts, restoreKey])

  useEffect(() => {
    const refreshOpenTabs = async () => {
      const listRes = await sendTabContextMessage({ type: 'LIST_TABS', allWindows: true })
      if (listRes.type === 'TABS_LIST') setOpenTabs(listRes.tabs)
    }
    void refreshOpenTabs().catch(() => undefined)
    return subscribeToTabChanges(() => {
      void refreshOpenTabs().catch(() => undefined)
    }, 300)
  }, [])

  const handlePin = (tab: TabInfo) => {
    setShowTabPicker(false)
    emitPageContexts(addPinnedContext(pageContextsRef.current, tab))
  }

  const handleRemove = (url: string) => {
    const key = normalizePageUrl(url)
    const isCurrent =
      activeTabRef.current != null && normalizePageUrl(activeTabRef.current.url) === key
    if (isCurrent) {
      sharePageContextRef.current = false
      onSharePageContextChangeRef.current(false)
    }
    emitPageContexts(
      replaceActiveContext(
        removePageContext(pageContextsRef.current, url),
        activeTabRef.current,
        isCurrent ? false : sharePageContextRef.current
      )
    )
  }

  const handleOpenTabPicker = async () => {
    setShowTabPicker(true)
    const listRes = await sendTabContextMessage({ type: 'LIST_TABS', allWindows: true })
    if (listRes.type === 'TABS_LIST') setOpenTabs(listRes.tabs)
  }

  const handleClearContext = () => {
    sharePageContextRef.current = false
    onSharePageContextChangeRef.current(false)
    emitPageContexts([])
    syncBackgroundPins([])
    void sendTabContextMessage({ type: 'CLEAR_CONTEXT_CACHE' }).catch(() => undefined)
  }

  const pinnedUrls = new Set(
    pageContexts
      .filter((context) => context.source === 'pinned')
      .map((context) => normalizePageUrl(context.url))
  )
  const liveTabsByUrl = new Map(
    [...openTabs, ...(activeTab ? [activeTab] : [])].map((tab) => [
      normalizePageUrl(tab.url),
      tab,
    ])
  )
  const pickerTabs = openTabs.filter((tab) => !pinnedUrls.has(normalizePageUrl(tab.url)))
  const contextTabs = pageContexts.map((context) => {
    const live = liveTabsByUrl.get(normalizePageUrl(context.url))
    return {
      ...context,
      tabId: live?.tabId,
      open: live != null,
      title: live?.title || context.title,
      favIconUrl: live?.favIconUrl ?? context.favIconUrl,
    }
  })

  return (
    <div className={`context-bar${collapsed ? ' context-bar-collapsed' : ''}`}>
      <div className="context-header">
        <div className="context-header-lead">
          <button
            type="button"
            className="ghost context-collapse-toggle"
            onClick={() => onCollapsedChange(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand context tabs' : 'Collapse context tabs'}
          >
            <span className="context-collapse-chevron" aria-hidden="true">
              {collapsed ? '▶' : '▼'}
            </span>
            Page context
          </button>
          {contextTabs.length > 0 && (
            <div className="tab-icons" aria-hidden="true">
              {contextTabs.map((tab) => (
                <span
                  key={normalizePageUrl(tab.url)}
                  className="tab-icon"
                  title={tab.title || tab.url}
                >
                  {tab.favIconUrl ? (
                    <img src={tab.favIconUrl} alt="" width={14} height={14} />
                  ) : (
                    <span className="tab-icon-fallback">
                      {(tab.title || tab.url).charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="context-header-actions">
            <label className="toggle">
              <input
                type="checkbox"
                checked={sharePageContext}
                onChange={(e) => onSharePageContextChange(e.target.checked)}
              />
              <span>Active tab</span>
            </label>
            <button type="button" className="ghost" onClick={() => void handleOpenTabPicker()}>
              + Pin tab
            </button>
            <button type="button" className="ghost" onClick={handleClearContext}>
              Clear
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="tab-chips">
          {contextTabs.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>No page context included</span>
          )}
          {contextTabs.map((tab) => (
            <div
              key={normalizePageUrl(tab.url)}
              className={`tab-chip${tab.open ? '' : ' tab-chip-unavailable'}`}
              title={tab.open ? tab.title || tab.url : `${tab.title || tab.url} (tab not open)`}
            >
              {tab.favIconUrl && (
                <img
                  src={tab.favIconUrl}
                  alt=""
                  width={14}
                  height={14}
                  className="tab-chip-favicon"
                />
              )}
              <span className="tab-chip-label" title={tab.title || tab.url}>
                {tab.title || tab.url}
              </span>
              <button
                type="button"
                className="ghost tab-chip-close"
                onClick={() => handleRemove(tab.url)}
                aria-label="Remove tab from context"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showTabPicker && (
        <div className="modal-overlay" onClick={() => setShowTabPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pin a tab</h2>
            <div className="tab-picker-list">
              {pickerTabs.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>No tabs available to pin</span>
              )}
              {pickerTabs.map((tab) => (
                <div
                  key={tab.tabId}
                  className="tab-picker-item"
                  onClick={() => handlePin(tab)}
                >
                  {tab.favIconUrl && <img src={tab.favIconUrl} alt="" width={16} height={16} />}
                  <span>{tab.title || tab.url}</span>
                </div>
              ))}
            </div>
            <button type="button" className="secondary" onClick={() => setShowTabPicker(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TabMentionInput({
  value,
  onChange,
  onPinTab,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onPinTab?: (tab: TabInfo) => void
  placeholder?: string
  className?: string
}) {
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)

  useEffect(() => {
    sendTabContextMessage({ type: 'LIST_TABS', allWindows: true })
      .then((res) => {
        if (res.type === 'TABS_LIST') setTabs(res.tabs)
      })
      .catch(() => undefined)
  }, [])

  const filtered = tabs.filter(
    (t) =>
      !mentionFilter ||
      t.title.toLowerCase().includes(mentionFilter.toLowerCase()) ||
      t.url.toLowerCase().includes(mentionFilter.toLowerCase())
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    onChange(v)
    const atMatch = v.match(/@([^\s@]*)$/)
    if (atMatch) {
      setShowMentions(true)
      setMentionFilter(atMatch[1])
      setMentionIndex(0)
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (tab: TabInfo) => {
    const newValue = value.replace(/@([^\s@]*)$/, `@${tab.title} `)
    onChange(newValue)
    setShowMentions(false)
    onPinTab?.(tab)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showMentions || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(filtered[mentionIndex])
    } else if (e.key === 'Escape') {
      setShowMentions(false)
    }
  }

  return (
    <div className="composer-wrapper">
      <textarea
        className={className}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
      />
      {showMentions && filtered.length > 0 && (
        <div className="mention-dropdown">
          {filtered.map((tab, i) => (
            <div
              key={tab.tabId}
              className={`mention-item ${i === mentionIndex ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                insertMention(tab)
              }}
            >
              {tab.title || tab.url}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
