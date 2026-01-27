/**
 * Session State Persistence Utility
 *
 * Handles saving and restoring user session state for the "remember state on logout" feature.
 * State is saved to localStorage and restored when the user logs back in.
 */

const SESSION_STATE_KEY = 'compareintel_session_state'
const SAVE_STATE_EVENT = 'compareintel:saveStateBeforeLogout'

/**
 * Session state that can be persisted across logout/login
 */
export interface PersistedSessionState {
  input: string
  isFollowUpMode: boolean
  webSearchEnabled: boolean
  response: unknown | null
  selectedModels: string[]
  conversations: unknown[]
  savedAt: string
  userId: number
}

/**
 * Save session state to localStorage
 */
export function saveSessionState(state: Omit<PersistedSessionState, 'savedAt'>): void {
  try {
    const stateToSave: PersistedSessionState = {
      ...state,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateToSave))
    console.log('[SessionState] Saved state for user', state.userId)
  } catch (error) {
    console.error('[SessionState] Failed to save state:', error)
  }
}

/**
 * Load persisted session state from localStorage
 * Returns null if no state exists or if it's for a different user
 */
export function loadSessionState(userId: number): PersistedSessionState | null {
  try {
    const stored = localStorage.getItem(SESSION_STATE_KEY)
    if (!stored) return null

    const state: PersistedSessionState = JSON.parse(stored)

    // Only restore state for the same user
    if (state.userId !== userId) {
      console.log('[SessionState] Stored state is for different user, ignoring')
      clearSessionState()
      return null
    }

    // Check if state is too old (more than 7 days)
    const savedAt = new Date(state.savedAt)
    const now = new Date()
    const daysDiff = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff > 7) {
      console.log('[SessionState] Stored state is too old, ignoring')
      clearSessionState()
      return null
    }

    console.log('[SessionState] Loaded saved state for user', userId)
    return state
  } catch (error) {
    console.error('[SessionState] Failed to load state:', error)
    return null
  }
}

/**
 * Clear persisted session state
 */
export function clearSessionState(): void {
  try {
    localStorage.removeItem(SESSION_STATE_KEY)
    console.log('[SessionState] Cleared saved state')
  } catch (error) {
    console.error('[SessionState] Failed to clear state:', error)
  }
}

/**
 * Dispatch event to signal that state should be saved before logout
 */
export function dispatchSaveStateEvent(): void {
  const event = new CustomEvent(SAVE_STATE_EVENT)
  window.dispatchEvent(event)
}

/**
 * Listen for the save state event
 */
export function onSaveStateEvent(callback: () => void): () => void {
  const handler = () => callback()
  window.addEventListener(SAVE_STATE_EVENT, handler)
  return () => window.removeEventListener(SAVE_STATE_EVENT, handler)
}
