import { useCallback, useEffect, useState } from 'react'

import { sendTabContextMessage } from '../messaging'

interface TabInfo {
  tabId: number
  url: string
  title: string
  favIconUrl?: string
  pinned: boolean
}

interface ExtensionContextBarProps {
  sharePageContext: boolean
  onSharePageContextChange: (enabled: boolean) => void
  onContextTabsChange: (tabIds: number[]) => void
}

export function ExtensionContextBar({
  sharePageContext,
  onSharePageContextChange,
  onContextTabsChange,
}: ExtensionContextBarProps) {
  const [activeTab, setActiveTab] = useState<TabInfo | null>(null)
  const [pinnedTabs, setPinnedTabs] = useState<TabInfo[]>([])
  const [showTabPicker, setShowTabPicker] = useState(false)
  const [allTabs, setAllTabs] = useState<TabInfo[]>([])
  const [collapsed, setCollapsed] = useState(false)

  const refreshTabs = useCallback(async () => {
    const listRes = await sendTabContextMessage({ type: 'LIST_TABS' })
    let tabs: TabInfo[] = []
    if (listRes.type === 'TABS_LIST') {
      tabs = listRes.tabs
      setAllTabs(tabs)
      setPinnedTabs(tabs.filter((t) => t.pinned))
    }

    const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
    if (activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
      const pinned = tabs.find((t) => t.tabId === activeRes.tab!.tabId)?.pinned ?? false
      setActiveTab({ ...activeRes.tab, pinned })
    } else {
      setActiveTab(null)
    }

    const pinnedRes = await sendTabContextMessage({ type: 'GET_PINNED_TABS' })
    if (pinnedRes.type === 'PINNED_TABS') {
      onContextTabsChange(pinnedRes.tabIds)
    }
  }, [onContextTabsChange])

  useEffect(() => {
    refreshTabs().catch(() => undefined)
    const interval = setInterval(() => refreshTabs().catch(() => undefined), 5000)
    return () => clearInterval(interval)
  }, [refreshTabs])

  const handlePin = async (tabId: number) => {
    await sendTabContextMessage({ type: 'PIN_TAB', tabId })
    await refreshTabs()
    setShowTabPicker(false)
  }

  const handleUnpin = async (tabId: number) => {
    await sendTabContextMessage({ type: 'UNPIN_TAB', tabId })
    await refreshTabs()
  }

  const handleClearContext = async () => {
    await sendTabContextMessage({ type: 'CLEAR_CONTEXT_CACHE' })
    onSharePageContextChange(false)
    await refreshTabs()
  }

  const contextTabs: TabInfo[] = [
    ...(sharePageContext && activeTab ? [activeTab] : []),
    ...pinnedTabs.filter((p) => p.tabId !== activeTab?.tabId),
  ]

  return (
    <div className={`context-bar${collapsed ? ' context-bar-collapsed' : ''}`}>
      <div className="context-header">
        <button
          type="button"
          className="ghost context-collapse-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand context tabs' : 'Collapse context tabs'}
        >
          <span className="context-collapse-chevron" aria-hidden="true">
            {collapsed ? '▶' : '▼'}
          </span>
          Page context
        </button>
        {!collapsed && (
          <div style={{ display: 'flex', gap: 4 }}>
            <label className="toggle">
              <input
                type="checkbox"
                checked={sharePageContext}
                onChange={(e) => onSharePageContextChange(e.target.checked)}
              />
              Active tab
            </label>
            <button type="button" className="ghost" onClick={() => setShowTabPicker(true)}>
              + Pin tab
            </button>
            <button type="button" className="ghost" onClick={handleClearContext}>
              Clear
            </button>
          </div>
        )}
      </div>

      {collapsed ? (
        <div className="tab-icons">
          {contextTabs.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>None</span>
          )}
          {contextTabs.map((tab) => (
            <span
              key={tab.tabId}
              className="tab-icon"
              title={tab.title || tab.url}
            >
              {tab.favIconUrl ? (
                <img src={tab.favIconUrl} alt="" width={16} height={16} />
              ) : (
                <span className="tab-icon-fallback">
                  {(tab.title || tab.url).charAt(0).toUpperCase()}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <div className="tab-chips">
          {contextTabs.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>No page context included</span>
          )}
          {contextTabs.map((tab) => {
            const isActiveContext = sharePageContext && activeTab?.tabId === tab.tabId
            const showClose = tab.pinned || isActiveContext

            const handleClose = () => {
              if (tab.pinned) {
                void handleUnpin(tab.tabId)
              } else if (isActiveContext) {
                onSharePageContextChange(false)
              }
            }

            return (
              <div key={tab.tabId} className="tab-chip">
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
                {showClose && (
                  <button
                    type="button"
                    className="ghost tab-chip-close"
                    onClick={handleClose}
                    aria-label="Remove tab from context"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showTabPicker && (
        <div className="modal-overlay" onClick={() => setShowTabPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pin a tab</h2>
            <div className="tab-picker-list">
              {allTabs
                .filter((t) => !t.pinned)
                .map((tab) => (
                  <div key={tab.tabId} className="tab-picker-item" onClick={() => handlePin(tab.tabId)}>
                    {tab.favIconUrl && (
                      <img src={tab.favIconUrl} alt="" width={16} height={16} />
                    )}
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

/** @ mention autocomplete for tabs */
export function TabMentionInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)

  useEffect(() => {
    sendTabContextMessage({ type: 'LIST_TABS' })
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

  const insertMention = async (tab: TabInfo) => {
    const newValue = value.replace(/@([^\s@]*)$/, `@${tab.title} `)
    onChange(newValue)
    setShowMentions(false)
    await sendTabContextMessage({ type: 'PIN_TAB', tabId: tab.tabId })
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
