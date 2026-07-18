import { useCallback, useEffect, useRef, useState } from 'react'
import browser from 'webextension-polyfill'

import type { CreditBalance } from '@compareintel/core'
import { getDisplayCreditsRemaining } from '@compareintel/core'

import type { PanelScope } from '../shared/extensionSettings'
import { getRecentChat } from '../shared/recentChats'
import { getWebAppUrl, loadCreditBalance } from './api'
import { AuthModal, useAuth } from './components/AuthModal'
import { ExtensionComparisonShell } from './components/ExtensionComparisonShell'
import { RecentChatsSection } from './components/RecentChatsSection'
import { SettingsModal } from './components/SettingsModal'
import { sendTabContextMessage } from './messaging'
import { fetchPanelScope } from './settingsMessaging'
import type { ExtensionShellPersistedState } from './types/shellState'
import { generateBrowserFingerprint } from './utils/fingerprint'

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function App() {
  const { user, loading: authLoading, setUser } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [panelScope, setPanelScope] = useState<PanelScope>('always_open')
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [fingerprint, setFingerprint] = useState<string | undefined>()
  const [activeRecentChatId, setActiveRecentChatId] = useState<string | null>(null)
  const [recentChatsRefreshToken, setRecentChatsRefreshToken] = useState(0)
  const [shellSessionKey, setShellSessionKey] = useState(0)
  const shellStatesRef = useRef(new Map<number, ExtensionShellPersistedState>())

  const openWebApp = () => {
    browser.tabs.create({ url: getWebAppUrl() })
  }

  useEffect(() => {
    generateBrowserFingerprint().then(setFingerprint).catch(() => undefined)
  }, [])

  useEffect(() => {
    fetchPanelScope()
      .then(setPanelScope)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (panelScope !== 'always_open') {
      setActiveTabId(null)
      return
    }

    const refreshActiveTab = async () => {
      const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
      if (activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
        setActiveTabId((currentTabId) => {
          if (currentTabId === activeRes.tab!.tabId) return currentTabId
          const nextTabState = shellStatesRef.current.get(activeRes.tab!.tabId)
          setActiveRecentChatId(nextTabState?.activeRecentChatId ?? null)
          return activeRes.tab!.tabId
        })
      }
    }

    refreshActiveTab().catch(() => undefined)
    const interval = setInterval(() => refreshActiveTab().catch(() => undefined), 1000)
    return () => clearInterval(interval)
  }, [panelScope])

  const refreshCredits = useCallback(() => {
    if (authLoading) return
    loadCreditBalance(fingerprint)
      .then(setCreditBalance)
      .catch(() => undefined)
  }, [authLoading, fingerprint, user])

  useEffect(() => {
    refreshCredits()
  }, [refreshCredits])

  const handlePersistShellState = useCallback(
    (tabId: number, state: ExtensionShellPersistedState) => {
      shellStatesRef.current.set(tabId, state)
      if (panelScope === 'always_open' && tabId === activeTabId) {
        setActiveRecentChatId(state.activeRecentChatId ?? null)
      }
    },
    [activeTabId, panelScope]
  )

  const handleSelectRecentChat = useCallback(
    async (chatId: string) => {
      const chat = await getRecentChat(chatId)
      if (!chat) return

      if (panelScope === 'always_open' && activeTabId != null) {
        shellStatesRef.current.set(activeTabId, chat.state)
      }

      setActiveRecentChatId(chat.id)
      setShellSessionKey((value) => value + 1)
    },
    [activeTabId, panelScope]
  )

  const tier = user?.subscription_tier ?? creditBalance?.subscription_tier ?? 'unregistered'
  const creditsRemaining = getDisplayCreditsRemaining(creditBalance, tier)
  const creditsText =
    creditsRemaining === null
      ? 'Loading credits…'
      : `${Math.round(creditsRemaining)} credits remaining`

  const shellKey =
    panelScope === 'always_open' ? String(activeTabId ?? 'pending') : 'single'
  const persistedState =
    panelScope === 'always_open' && activeTabId != null
      ? shellStatesRef.current.get(activeTabId)
      : undefined

  return (
    <div className="app">
      <header className="header">
        {!user && (
          <span className="header-signin-prompt">Sign in for more models and higher limits</span>
        )}
        <div className="header-actions">
          <button
            type="button"
            className="icon-button icon-button-ghost header-icon-button"
            onClick={() => setShowSettings(true)}
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon />
          </button>
          {!user && (
            <button type="button" className="secondary" onClick={() => setShowAuth(true)}>
              Sign in
            </button>
          )}
          <button type="button" className="secondary" onClick={openWebApp}>
            Web App
          </button>
        </div>
      </header>

      <div className="credits-bar">{creditsText}</div>

      <RecentChatsSection
        activeChatId={activeRecentChatId}
        onSelectChat={(chatId) => void handleSelectRecentChat(chatId)}
        refreshToken={recentChatsRefreshToken}
      />

      <ExtensionComparisonShell
        key={`${shellKey}-${shellSessionKey}`}
        user={user}
        browserFingerprint={fingerprint}
        onOpenAuth={() => setShowAuth(true)}
        onComparisonFinished={refreshCredits}
        persistedState={persistedState}
        persistTabId={panelScope === 'always_open' ? activeTabId ?? undefined : undefined}
        onPersistState={
          panelScope === 'always_open' ? handlePersistShellState : undefined
        }
        onRecentChatSaved={() => setRecentChatsRefreshToken((value) => value + 1)}
        onActiveRecentChatChange={setActiveRecentChatId}
      />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onScopeChange={setPanelScope}
        />
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={(u) => {
            setUser(u)
            setShowAuth(false)
          }}
        />
      )}
    </div>
  )
}
