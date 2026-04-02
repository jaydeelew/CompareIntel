import { useEffect, useState } from 'react'

import { useAuth } from '../contexts/AuthContext'
import {
  getUserPreferences,
  USER_PREFERENCES_UPDATED_EVENT,
  type UserPreferences,
} from '../services/userSettingsService'

/**
 * When the signed-in user has enabled hiding capability cards, the home page hides those cards
 * and centers the question box. Anonymous users always see the cards.
 */
export function useHideHeroUtilityTiles(): boolean {
  const { user } = useAuth()
  const [hide, setHide] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      setHide(false)
      return
    }

    let cancelled = false
    getUserPreferences()
      .then(prefs => {
        if (!cancelled) setHide(Boolean(prefs.hide_hero_utility_tiles))
      })
      .catch(() => {
        if (!cancelled) setHide(false)
      })

    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<UserPreferences>).detail
      if (detail?.hide_hero_utility_tiles !== undefined) {
        setHide(detail.hide_hero_utility_tiles)
      }
    }
    window.addEventListener(USER_PREFERENCES_UPDATED_EVENT, onUpdated)

    return () => {
      cancelled = true
      window.removeEventListener(USER_PREFERENCES_UPDATED_EVENT, onUpdated)
    }
  }, [user?.id])

  return hide
}
