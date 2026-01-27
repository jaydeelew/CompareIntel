/**
 * Tests for sessionState utility
 *
 * Tests saving, loading, and clearing of session state for the
 * "remember state on logout" feature.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  saveSessionState,
  loadSessionState,
  clearSessionState,
  dispatchSaveStateEvent,
  onSaveStateEvent,
  type PersistedSessionState,
} from '../../utils/sessionState'

describe('sessionState', () => {
  const mockState: Omit<PersistedSessionState, 'savedAt'> = {
    input: 'Test input text',
    isFollowUpMode: true,
    webSearchEnabled: false,
    response: { results: { 'model-1': 'Response text' } },
    selectedModels: ['gpt-4', 'claude-3'],
    conversations: [{ id: 1, model_id: 'gpt-4', messages: [] }],
    userId: 123,
  }

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('saveSessionState', () => {
    it('should save state to localStorage', () => {
      saveSessionState(mockState)

      const stored = localStorage.getItem('compareintel_session_state')
      expect(stored).not.toBeNull()

      const parsed = JSON.parse(stored!)
      expect(parsed.input).toBe(mockState.input)
      expect(parsed.isFollowUpMode).toBe(mockState.isFollowUpMode)
      expect(parsed.webSearchEnabled).toBe(mockState.webSearchEnabled)
      expect(parsed.selectedModels).toEqual(mockState.selectedModels)
      expect(parsed.userId).toBe(mockState.userId)
      expect(parsed.savedAt).toBeDefined()
    })

    it('should include timestamp when saving', () => {
      const before = new Date().toISOString()
      saveSessionState(mockState)
      const after = new Date().toISOString()

      const stored = localStorage.getItem('compareintel_session_state')
      const parsed = JSON.parse(stored!)

      expect(parsed.savedAt >= before).toBe(true)
      expect(parsed.savedAt <= after).toBe(true)
    })

    it('should save response data', () => {
      saveSessionState(mockState)

      const stored = localStorage.getItem('compareintel_session_state')
      const parsed = JSON.parse(stored!)

      expect(parsed.response).toEqual(mockState.response)
    })

    it('should save conversations data', () => {
      saveSessionState(mockState)

      const stored = localStorage.getItem('compareintel_session_state')
      const parsed = JSON.parse(stored!)

      expect(parsed.conversations).toEqual(mockState.conversations)
    })

    it('should handle save errors gracefully', () => {
      // Mock localStorage.setItem to throw
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full')
      })

      // Should not throw
      expect(() => saveSessionState(mockState)).not.toThrow()
      expect(consoleSpy).toHaveBeenCalled()

      // Restore mocks
      consoleSpy.mockRestore()
      setItemSpy.mockRestore()
    })
  })

  describe('loadSessionState', () => {
    it('should load state for matching user', () => {
      saveSessionState(mockState)

      const loaded = loadSessionState(123)

      expect(loaded).not.toBeNull()
      expect(loaded!.input).toBe(mockState.input)
      expect(loaded!.isFollowUpMode).toBe(mockState.isFollowUpMode)
      expect(loaded!.selectedModels).toEqual(mockState.selectedModels)
    })

    it('should return null for different user', () => {
      saveSessionState(mockState)

      const loaded = loadSessionState(456) // Different user ID

      expect(loaded).toBeNull()
    })

    it('should return null when no state exists', () => {
      const loaded = loadSessionState(123)

      expect(loaded).toBeNull()
    })

    it('should return null and clear state for expired state (>7 days)', () => {
      // Save state with old timestamp
      const oldState: PersistedSessionState = {
        ...mockState,
        savedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
      }
      localStorage.setItem('compareintel_session_state', JSON.stringify(oldState))

      const loaded = loadSessionState(123)

      expect(loaded).toBeNull()
      // State should be cleared
      expect(localStorage.getItem('compareintel_session_state')).toBeNull()
    })

    it('should accept state within 7 days', () => {
      // Save state with timestamp from 6 days ago
      const recentState: PersistedSessionState = {
        ...mockState,
        savedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
      }
      localStorage.setItem('compareintel_session_state', JSON.stringify(recentState))

      const loaded = loadSessionState(123)

      expect(loaded).not.toBeNull()
      expect(loaded!.input).toBe(mockState.input)
    })

    it('should handle invalid JSON gracefully', () => {
      localStorage.setItem('compareintel_session_state', 'invalid json')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const loaded = loadSessionState(123)

      expect(loaded).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('clearSessionState', () => {
    it('should remove state from localStorage', () => {
      saveSessionState(mockState)
      expect(localStorage.getItem('compareintel_session_state')).not.toBeNull()

      clearSessionState()

      expect(localStorage.getItem('compareintel_session_state')).toBeNull()
    })

    it('should not throw when no state exists', () => {
      expect(() => clearSessionState()).not.toThrow()
    })
  })

  describe('dispatchSaveStateEvent and onSaveStateEvent', () => {
    it('should dispatch and receive save state event', () => {
      const callback = vi.fn()
      const cleanup = onSaveStateEvent(callback)

      dispatchSaveStateEvent()

      expect(callback).toHaveBeenCalledTimes(1)

      cleanup()
    })

    it('should allow multiple listeners', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const cleanup1 = onSaveStateEvent(callback1)
      const cleanup2 = onSaveStateEvent(callback2)

      dispatchSaveStateEvent()

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)

      cleanup1()
      cleanup2()
    })

    it('should stop receiving events after cleanup', () => {
      const callback = vi.fn()
      const cleanup = onSaveStateEvent(callback)

      cleanup()
      dispatchSaveStateEvent()

      expect(callback).not.toHaveBeenCalled()
    })

    it('should only remove specific listener on cleanup', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const cleanup1 = onSaveStateEvent(callback1)
      onSaveStateEvent(callback2)

      cleanup1()
      dispatchSaveStateEvent()

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })
})
