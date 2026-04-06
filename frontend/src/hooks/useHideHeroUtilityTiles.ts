import { useEffect, useState } from 'react'

import { useAuth } from '../contexts/AuthContext'
import {
  getUserPreferences,
  USER_PREFERENCES_UPDATED_EVENT,
  type UserPreferences,
} from '../services/userSettingsService'

/**
 * When the signed-in user has enabled hiding capability cards, the home page applies the
 * `hero-section--composer-focused` class.  Above 768 px this removes the tiles, title, and
 * subtitle from the document flow and vertically centres the composer so the hero height stays
 * rock-steady during horizontal resizes.  At mobile widths (≤ 768 px) the elements are hidden
 * with opacity/visibility instead to preserve the compact layout.  Anonymous users always see
 * the cards.
 */
export function useHideHeroUtilityTiles(): boolean {
  const { user } = useAuth()
  const [hide, setHide] = useState(false)

  useEffect(() => {
    if (!user) {
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
  }, [user])

  return hide
}
