import { useEffect, useState } from 'react'

import type { RateLimitStatus } from '@compareintel/core'

import { loadRateLimitStatus } from './api'
import { AuthModal, useAuth } from './components/AuthModal'
import { ExtensionComparisonShell } from './components/ExtensionComparisonShell'
import { ExtensionSettings } from './components/ExtensionSettings'
import { generateBrowserFingerprint } from './utils/fingerprint'

export function App() {
  const { user, loading: authLoading, setUser, logout, openBilling } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null)
  const [fingerprint, setFingerprint] = useState<string | undefined>()

  useEffect(() => {
    generateBrowserFingerprint().then(setFingerprint).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (authLoading) return
    loadRateLimitStatus(fingerprint)
      .then(setRateLimit)
      .catch(() => undefined)
  }, [user, fingerprint, authLoading])

  const creditsText = user
    ? `${(user.monthly_credits_allocated ?? 0) - (user.credits_used_this_period ?? 0)} credits remaining`
    : rateLimit
      ? `${rateLimit.remaining_usage ?? rateLimit.fingerprint_remaining ?? 0} comparisons remaining today`
      : 'Loading limits…'

  return (
    <div className="app">
      <header className="header">
        <h1>CompareIntel</h1>
        <div className="header-actions">
          {!user && (
            <button type="button" className="secondary" onClick={() => setShowAuth(true)}>
              Sign in
            </button>
          )}
          <button type="button" className="ghost" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
        </div>
      </header>

      <div className="credits-bar">{creditsText}</div>

      <ExtensionComparisonShell
        user={user}
        rateLimit={rateLimit}
        browserFingerprint={fingerprint}
        onOpenAuth={() => setShowAuth(true)}
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

      {showSettings && (
        <ExtensionSettings
          onClose={() => setShowSettings(false)}
          onLogout={async () => {
            await logout()
            setShowSettings(false)
          }}
          onOpenBilling={openBilling}
          userEmail={user?.email}
        />
      )}
    </div>
  )
}
