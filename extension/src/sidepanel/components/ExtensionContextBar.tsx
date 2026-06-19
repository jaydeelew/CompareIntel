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
  tokenEstimate?: number
}

export function ExtensionContextBar({
  sharePageContext,
  onSharePageContextChange,
  onContextTabsChange,
  tokenEstimate,
}: ExtensionContextBarProps) {
  const [activeTab, setActiveTab] = useState<TabInfo | null>(null)
  const [pinnedTabs, setPinnedTabs] = useState<TabInfo[]>([])
  const [showTabPicker, setShowTabPicker] = useState(false)
  const [allTabs, setAllTabs] = useState<TabInfo[]>([])

  const refreshTabs = useCallback(async () => {
    const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
    if (activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
      setActiveTab({ ...activeRes.tab, pinned: false })
    } else {
      setActiveTab(null)
    }

    const listRes = await sendTabContextMessage({ type: 'LIST_TABS' })
    if (listRes.type === 'TABS_LIST') {
      setAllTabs(listRes.tabs)
      setPinnedTabs(listRes.tabs.filter((t) => t.pinned))
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

  const handleClearCache = async () => {
    await sendTabContextMessage({ type: 'CLEAR_CONTEXT_CACHE' })
  }

  const contextTabs: TabInfo[] = [
    ...(sharePageContext && activeTab ? [activeTab] : []),
    ...pinnedTabs.filter((p) => p.tabId !== activeTab?.tabId),
  ]

  return (
    <div className="context-bar">
      <div className="context-header">
        <label className="toggle">
          <input
            type="checkbox"
            checked={sharePageContext}
            onChange={(e) => onSharePageContextChange(e.target.checked)}
          />
          Page context
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="ghost" onClick={() => setShowTabPicker(true)}>
            + Pin tab
          </button>
          <button type="button" className="ghost" onClick={handleClearCache}>
            Clear
          </button>
        </div>
      </div>

      {tokenEstimate !== undefined && sharePageContext && (
        <div className="token-estimate">~{tokenEstimate.toLocaleString()} tokens estimated</div>
      )}

      <div className="tab-chips">
        {contextTabs.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>No page context included</span>
        )}
        {contextTabs.map((tab) => (
          <div key={tab.tabId} className="tab-chip">
            <span title={tab.url}>{tab.title || tab.url}</span>
            {tab.pinned && (
              <button type="button" className="ghost" onClick={() => handleUnpin(tab.tabId)}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {showTabPicker && (
        <div className="modal-overlay" onClick={() => setShowTabPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pin a tab</h2>
            <div className="tab-picker-list">
              {allTabs
                .filter((t) => !t.pinned)
                .map((tab) => (
                  <div key={tab.tabId} className="tab-picker-item" onClick={() => handlePin(tab.tabId)}>
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
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
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
