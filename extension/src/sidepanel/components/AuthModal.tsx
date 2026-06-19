import { useEffect, useState } from 'react'
import browser from 'webextension-polyfill'

import {
  extensionLogin,
  extensionLogout,
  extensionRegister,
  fetchCurrentUserFromApi,
  apiClient,
} from '../api'
import type { User } from '@compareintel/core'

interface AuthModalProps {
  onClose: () => void
  onSuccess: (user: User) => void
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user =
        mode === 'login'
          ? await extensionLogin(email, password)
          : await extensionRegister(email, password)
      if (user) onSuccess(user)
      else setError('Authentication succeeded but user data unavailable.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
        </button>
        <button type="button" className="secondary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  )
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCurrentUserFromApi()
      .then(setUser)
      .finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    await extensionLogout()
    setUser(null)
  }

  const openBilling = () => {
    browser.tabs.create({ url: 'https://compareintel.com/?settings=billing' })
  }

  return { user, loading, setUser, logout, openBilling }
}
