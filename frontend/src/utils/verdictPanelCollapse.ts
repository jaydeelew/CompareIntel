/**
 * Persist Verdict panel expanded/collapsed. Default: expanded on desktop,
 * collapsed on mobile so answers are visible first on a small screen.
 */

import { BREAKPOINT_MOBILE } from '../config/constants'

export const VERDICT_PANEL_EXPANDED_KEY = 'compareintel_verdict_panel_expanded'

export function defaultVerdictPanelExpanded(width?: number): boolean {
  const viewportWidth =
    width ?? (typeof window === 'undefined' ? BREAKPOINT_MOBILE + 1 : window.innerWidth)
  return viewportWidth > BREAKPOINT_MOBILE
}

export function readVerdictPanelExpanded(): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(VERDICT_PANEL_EXPANDED_KEY)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return null
  } catch {
    return null
  }
}

export function writeVerdictPanelExpanded(expanded: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VERDICT_PANEL_EXPANDED_KEY, expanded ? 'true' : 'false')
  } catch {
    // Ignore quota / private-mode failures; the in-memory toggle still works.
  }
}

export function initialVerdictPanelExpanded(): boolean {
  const stored = readVerdictPanelExpanded()
  if (stored != null) return stored
  return defaultVerdictPanelExpanded()
}
