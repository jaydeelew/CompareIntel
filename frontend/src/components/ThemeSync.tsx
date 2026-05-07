/**
 * ThemeSync - Cross-device theme sync for registered users
 *
 * When authenticated:
 * - Fetches theme from backend on login and applies it (once per user session)
 * - Pushes theme changes to backend when user toggles
 *
 * Unregistered users: theme stays localStorage-only.
 *
 * Note: Initial fetch runs when auth or `user` changes; `lastUserIdRef` limits the
 * actual backend fetch to login / account switch. Ignoring `setTheme` identity avoids
 * a toggle re-fetch that could overwrite the user's choice with stale backend data.
 */

import { useEffect, useRef } from 'react'

import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/useTheme'
import { getUserPreferences, updateUserPreferences } from '../services/userSettingsService'

export function ThemeSync() {
  const { isAuthenticated, user } = useAuth()
  const { theme, setTheme } = useTheme()
  const hasFetchedInitialRef = useRef(false)
  const lastUserIdRef = useRef<number | null>(null)
  const setThemeRef = useRef(setTheme)
  setThemeRef.current = setTheme

  // Sync from backend when user logs in (runs only on auth/user change, NOT on setTheme change)
  useEffect(() => {
    if (!isAuthenticated || !user) {
      hasFetchedInitialRef.current = false
      lastUserIdRef.current = null
      return
    }

    // Only fetch when user actually changes (login or switch account)
    if (lastUserIdRef.current === user.id) {
      return
    }
    lastUserIdRef.current = user.id
    hasFetchedInitialRef.current = false

    getUserPreferences()
      .then(prefs => {
        const backendTheme =
          prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : 'light'
        // Backend is source of truth for registered users - always apply it on login
        setThemeRef.current(backendTheme)
        hasFetchedInitialRef.current = true
      })
      .catch(() => {
        hasFetchedInitialRef.current = true
      })
  }, [isAuthenticated, user])

  // Sync to backend when theme changes (and we've completed initial fetch)
  useEffect(() => {
    if (!isAuthenticated || !hasFetchedInitialRef.current) return

    updateUserPreferences({ theme }).catch(() => {
      // Fire and forget - don't surface errors to user
    })
  }, [isAuthenticated, theme])

  return null
}
