/**
 * ThemeSync - Cross-device theme sync for registered users
 *
 * When authenticated:
 * - Fetches theme from backend on login and applies it
 * - Pushes theme changes to backend when user toggles
 *
 * Unregistered users: theme stays localStorage-only.
 */

import { useEffect, useRef } from 'react'

import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { getUserPreferences, updateUserPreferences } from '../services/userSettingsService'

export function ThemeSync() {
  const { isAuthenticated, user } = useAuth()
  const { theme, setTheme } = useTheme()
  const hasFetchedInitialRef = useRef(false)

  // Sync from backend when user logs in
  useEffect(() => {
    if (!isAuthenticated || !user) {
      hasFetchedInitialRef.current = false
      return
    }

    getUserPreferences()
      .then(prefs => {
        if (prefs.theme === 'light' || prefs.theme === 'dark') {
          setTheme(prefs.theme)
        }
        hasFetchedInitialRef.current = true
      })
      .catch(() => {
        hasFetchedInitialRef.current = true
      })
  }, [isAuthenticated, user, setTheme])

  // Sync to backend when theme changes (and we've completed initial fetch)
  useEffect(() => {
    if (!isAuthenticated || !hasFetchedInitialRef.current) return

    updateUserPreferences({ theme }).catch(() => {
      // Fire and forget - don't surface errors to user
    })
  }, [isAuthenticated, theme])

  return null
}
