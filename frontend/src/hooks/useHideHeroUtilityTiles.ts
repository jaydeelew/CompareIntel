import { useAuth } from '../contexts/AuthContext'

/**
 * Registered users always see the carousel (cards hidden).
 * Anonymous users always see the capability cards by default.
 */
export function useHideHeroUtilityTiles(): boolean {
  const { user } = useAuth()
  return !!user
}
