import { useCallback, useEffect, useRef, useState } from 'react'

import type { CreditBalance } from '@compareintel/core'
import { getDisplayCreditsRemaining } from '@compareintel/core'

import type { PanelScope } from '../shared/extensionSettings'
import {
  DEFAULT_CONVERSATION_FONT_SIZE,
  DEFAULT_INPUT_FONT_SIZE,
  getFontSizes,
  type FontSizes,
} from '../shared/extensionSettings'
import { getRecentChat } from '../shared/recentChats'
import { importExtensionChatsToAccount } from '../shared/importLocalHistory'
import { apiClient, loadCreditBalance } from './api'
import { ExtensionComparisonShell } from './components/ExtensionComparisonShell'
import { RecentChatsSection } from './components/RecentChatsSection'
import { SettingsModal } from './components/SettingsModal'
import { sendTabContextMessage } from './messaging'
import { subscribeToTabChanges } from './subscribeToTabChanges'
import { fetchPanelScope } from './settingsMessaging'
import type { ExtensionShellPersistedState } from './types/shellState'
import { useAuth } from './useAuth'
import { openWebAppLogin, openWebAppWithHandoff, signOutFromExtension } from './webAppActions'
import { generateBrowserFingerprint } from './utils/fingerprint'

const MAX_SHELL_STATES = 12

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
  const { user, loading: authLoading } = useAuth()
  const [showSettings, setShowSettings] = useState(false)
  const [showRecentChats, setShowRecentChats] = useState(false)
  const [panelScope, setPanelScope] = useState<PanelScope>('always_open')
  const [fontSizes, setFontSizes] = useState<FontSizes>({
    inputFontSize: DEFAULT_INPUT_FONT_SIZE,
    conversationFontSize: DEFAULT_CONVERSATION_FONT_SIZE,
  })
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [fingerprint, setFingerprint] = useState<string | undefined>()
  const [activeRecentChatId, setActiveRecentChatId] = useState<string | null>(null)
  const [recentChatsRefreshToken, setRecentChatsRefreshToken] = useState(0)
  const [shellSessionKey, setShellSessionKey] = useState(0)
  const [loadedChatState, setLoadedChatState] = useState<
    ExtensionShellPersistedState | undefined
  >()
  const shellStatesRef = useRef(new Map<number, ExtensionShellPersistedState>())

  useEffect(() => {
    generateBrowserFingerprint().then(setFingerprint).catch(() => undefined)
  }, [])

  useEffect(() => {
    fetchPanelScope()
      .then(setPanelScope)
      .catch(() => undefined)
    getFontSizes()
      .then(setFontSizes)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--input-font-size', `${fontSizes.inputFontSize}px`)
    document.documentElement.style.setProperty(
      '--conversation-font-size',
      `${fontSizes.conversationFontSize}px`
    )
  }, [fontSizes])

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
          setLoadedChatState(undefined)
          setActiveRecentChatId(nextTabState?.activeRecentChatId ?? null)
          return activeRes.tab!.tabId
        })
      }
    }

    refreshActiveTab().catch(() => undefined)
    return subscribeToTabChanges(() => {
      void refreshActiveTab().catch(() => undefined)
    })
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

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void importExtensionChatsToAccount(apiClient)
      .then((ids) => {
        if (cancelled || ids.length === 0) return
        setRecentChatsRefreshToken((value) => value + 1)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [user])

  const handlePersistShellState = useCallback(
    (tabId: number, state: ExtensionShellPersistedState) => {
      const states = shellStatesRef.current
      states.delete(tabId)
      states.set(tabId, state)
      while (states.size > MAX_SHELL_STATES) {
        const oldest = states.keys().next().value
        if (oldest == null) break
        states.delete(oldest)
      }
      if (panelScope === 'always_open' && tabId === activeTabId) {
        setActiveRecentChatId(state.activeRecentChatId ?? null)
      }
    },
    [activeTabId, panelScope]
  )

  useEffect(() => {
    const tabsApi = globalThis.chrome?.tabs
    if (!tabsApi?.onRemoved) return
    const onRemoved = (tabId: number) => {
      shellStatesRef.current.delete(tabId)
    }
    tabsApi.onRemoved.addListener(onRemoved)
    return () => tabsApi.onRemoved.removeListener(onRemoved)
  }, [])

  const handleSelectRecentChat = useCallback(
    async (chatId: string) => {
      const chat = await getRecentChat(chatId)
      if (!chat) return

      const pageContexts =
        chat.state.pageContexts && chat.state.pageContexts.length > 0
          ? chat.state.pageContexts
          : chat.sourceTabUrl
            ? [
                {
                  url: chat.sourceTabUrl,
                  title: chat.sourceTabTitle || chat.sourceTabUrl,
                  source: 'active' as const,
                },
              ]
            : []
      const loadedState = { ...chat.state, pageContexts }

      if (panelScope === 'always_open' && activeTabId != null) {
        shellStatesRef.current.set(activeTabId, loadedState)
      }

      setLoadedChatState(loadedState)
      setActiveRecentChatId(chat.id)
      setShellSessionKey((value) => value + 1)
    },
    [activeTabId, panelScope]
  )

  const openWebApp = () => {
    const shellState =
      loadedChatState ??
      (panelScope === 'always_open' && activeTabId != null
        ? shellStatesRef.current.get(activeTabId)
        : undefined)
    void openWebAppWithHandoff(shellState, fingerprint)
  }

  const tier = user?.subscription_tier ?? creditBalance?.subscription_tier ?? 'unregistered'
  const creditsRemaining = getDisplayCreditsRemaining(creditBalance, tier)
  const creditsText =
    creditsRemaining === null
      ? 'Loading credits…'
      : `${Math.round(creditsRemaining)} ${
          tier === 'unregistered' ? 'daily credits' : 'credits'
        } remaining`

  const shellKey =
    panelScope === 'always_open' ? String(activeTabId ?? 'pending') : 'single'
  const persistedState =
    loadedChatState ??
    (panelScope === 'always_open' && activeTabId != null
      ? shellStatesRef.current.get(activeTabId)
      : undefined)

  const resetActiveConversation = useCallback(() => {
    if (panelScope === 'always_open' && activeTabId != null) {
      shellStatesRef.current.delete(activeTabId)
    }
    setLoadedChatState(undefined)
    setActiveRecentChatId(null)
    setShellSessionKey((value) => value + 1)
  }, [activeTabId, panelScope])

  const handleDeleteRecentChat = useCallback(
    (chatId: string) => {
      if (activeRecentChatId === chatId) {
        resetActiveConversation()
      }
    },
    [activeRecentChatId, resetActiveConversation]
  )

  const handleDeleteServerConversation = useCallback(
    (conversationId: number) => {
      const activeConversationId = persistedState?.conversationId ?? null
      if (activeConversationId === conversationId) {
        resetActiveConversation()
      }
    },
    [persistedState?.conversationId, resetActiveConversation]
  )

  return (
    <div className="app">
      <header className="header">
        {!user && (
          <span className="header-signin-prompt">Sign in for more models and higher limits</span>
        )}
        {user && <span className="header-user-email">{user.email}</span>}
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
          {!user ? (
            <button type="button" className="secondary" onClick={() => void openWebAppLogin()}>
              Sign in
            </button>
          ) : (
            <button type="button" className="secondary" onClick={() => void signOutFromExtension()}>
              Sign out
            </button>
          )}
          <button type="button" className="secondary" onClick={openWebApp}>
            Web App
          </button>
        </div>
      </header>

      <div className="credits-bar">
        <span className="credits-bar-text">{creditsText}</span>
        <button
          type="button"
          className="recent-chats-trigger"
          onClick={() => setShowRecentChats(true)}
          aria-haspopup="dialog"
          aria-expanded={showRecentChats}
        >
          Recent chats
        </button>
      </div>

      {showRecentChats && (
        <RecentChatsSection
          user={user}
          activeChatId={activeRecentChatId}
          activeConversationId={persistedState?.conversationId ?? null}
          onSelectChat={(chatId) => void handleSelectRecentChat(chatId)}
          onSelectServerConversation={(state) => {
            if (panelScope === 'always_open' && activeTabId != null) {
              shellStatesRef.current.set(activeTabId, state)
            }
            setLoadedChatState(state)
            setActiveRecentChatId(null)
            setShellSessionKey((value) => value + 1)
          }}
          onDeleteChat={handleDeleteRecentChat}
          onDeleteServerConversation={handleDeleteServerConversation}
          onClose={() => setShowRecentChats(false)}
          refreshToken={recentChatsRefreshToken}
        />
      )}

      <ExtensionComparisonShell
        key={`${shellKey}-${shellSessionKey}`}
        user={user}
        browserFingerprint={fingerprint}
        onComparisonFinished={refreshCredits}
        persistedState={persistedState}
        persistTabId={panelScope === 'always_open' ? activeTabId ?? undefined : undefined}
        onPersistState={
          panelScope === 'always_open' ? handlePersistShellState : undefined
        }
        onRecentChatSaved={() => setRecentChatsRefreshToken((value) => value + 1)}
        onActiveRecentChatChange={(chatId) => {
          setActiveRecentChatId(chatId)
          if (chatId == null) setLoadedChatState(undefined)
        }}
      />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onScopeChange={setPanelScope}
          onFontSizesChange={setFontSizes}
        />
      )}
    </div>
  )
}
