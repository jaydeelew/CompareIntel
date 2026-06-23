import { useCallback, useEffect, useState } from 'react'
import browser from 'webextension-polyfill'

import type { CreditBalance } from '@compareintel/core'
import { getDisplayCreditsRemaining } from '@compareintel/core'

import { getWebAppUrl, loadCreditBalance } from './api'
import { AuthModal, useAuth } from './components/AuthModal'
import { ExtensionComparisonShell } from './components/ExtensionComparisonShell'
import { generateBrowserFingerprint } from './utils/fingerprint'

export function App() {
  const { user, loading: authLoading, setUser } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [fingerprint, setFingerprint] = useState<string | undefined>()

  const openWebApp = () => {
    browser.tabs.create({ url: getWebAppUrl() })
  }

  useEffect(() => {
    generateBrowserFingerprint().then(setFingerprint).catch(() => undefined)
  }, [])

  const refreshCredits = useCallback(() => {
    if (authLoading) return
    loadCreditBalance(fingerprint)
      .then(setCreditBalance)
      .catch(() => undefined)
  }, [authLoading, fingerprint, user])

  useEffect(() => {
    refreshCredits()
  }, [refreshCredits])

  const tier = user?.subscription_tier ?? creditBalance?.subscription_tier ?? 'unregistered'
  const creditsRemaining = getDisplayCreditsRemaining(creditBalance, tier)
  const creditsText =
    creditsRemaining === null
      ? 'Loading credits…'
      : `${Math.round(creditsRemaining)} credits remaining`

  return (
    <div className="app">
      <header className="header">
        {!user && (
          <span className="header-signin-prompt">Sign in for more models and higher limits</span>
        )}
        <div className="header-actions">
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

      <ExtensionComparisonShell
        user={user}
        browserFingerprint={fingerprint}
        onOpenAuth={() => setShowAuth(true)}
        onComparisonFinished={refreshCredits}
      />

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
