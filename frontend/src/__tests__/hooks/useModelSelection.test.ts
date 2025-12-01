/**
 * Tests for useModelSelection hook
 *
 * Tests model selection state, validation, and helper functions.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useModelSelection } from '../../hooks/useModelSelection'
import type { SubscriptionTier } from '../../types'
import { createMockUser } from '../utils'

describe('useModelSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('anonymous user', () => {
    it('should initialize with empty selection', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      expect(result.current.selectedModels).toEqual([])
      expect(result.current.originalSelectedModels).toEqual([])
      expect(result.current.maxModelsLimit).toBe(3) // Anonymous limit
      expect(result.current.canSelectMore).toBe(true)
    })

    it('should have correct limit for anonymous users', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      expect(result.current.maxModelsLimit).toBe(3)
    })

    it('should allow selecting models up to limit', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.toggleModelSelection('model1')
        result.current.toggleModelSelection('model2')
        result.current.toggleModelSelection('model3')
      })

      expect(result.current.selectedModels).toEqual(['model1', 'model2', 'model3'])
      expect(result.current.canSelectMore).toBe(false)
    })

    it('should prevent selecting more than limit', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.toggleModelSelection('model1')
        result.current.toggleModelSelection('model2')
        result.current.toggleModelSelection('model3')
        result.current.toggleModelSelection('model4') // Should not add
      })

      expect(result.current.selectedModels).toEqual(['model1', 'model2', 'model3'])
      expect(result.current.canSelectMore).toBe(false)
    })
  })

  describe('authenticated users', () => {
    it('should use free tier limit', () => {
      const user = createMockUser({ subscription_tier: 'free' })
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: true,
          user,
        })
      )

      expect(result.current.maxModelsLimit).toBe(3)
    })

    it('should use starter tier limit', () => {
      const user = createMockUser({ subscription_tier: 'starter' })
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: true,
          user,
        })
      )

      expect(result.current.maxModelsLimit).toBe(6)
    })

    it('should use pro tier limit', () => {
      const user = createMockUser({ subscription_tier: 'pro' })
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: true,
          user,
        })
      )

      expect(result.current.maxModelsLimit).toBe(9)
    })

    it('should handle unknown tier gracefully', () => {
      const user = createMockUser({
        subscription_tier: 'unknown_tier' as unknown as SubscriptionTier,
      })
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: true,
          user,
        })
      )

      // Should fall back to anonymous limit
      expect(result.current.maxModelsLimit).toBe(3)
    })
  })

  describe('model selection', () => {
    it('should toggle model selection', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.toggleModelSelection('model1')
      })

      expect(result.current.selectedModels).toEqual(['model1'])
      expect(result.current.isModelSelected('model1')).toBe(true)
      expect(result.current.isModelSelected('model2')).toBe(false)

      act(() => {
        result.current.toggleModelSelection('model1') // Deselect
      })

      expect(result.current.selectedModels).toEqual([])
      expect(result.current.isModelSelected('model1')).toBe(false)
    })

    it('should handle multiple toggles', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.toggleModelSelection('model1')
        result.current.toggleModelSelection('model2')
        result.current.toggleModelSelection('model3')
      })

      expect(result.current.selectedModels).toEqual(['model1', 'model2', 'model3'])

      act(() => {
        result.current.toggleModelSelection('model2') // Deselect middle one
      })

      expect(result.current.selectedModels).toEqual(['model1', 'model3'])
    })

    it('should update canSelectMore when models are selected', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      expect(result.current.canSelectMore).toBe(true)

      act(() => {
        result.current.toggleModelSelection('model1')
      })

      expect(result.current.canSelectMore).toBe(true)

      act(() => {
        result.current.toggleModelSelection('model2')
        result.current.toggleModelSelection('model3')
      })

      expect(result.current.canSelectMore).toBe(false)
    })
  })

  describe('setSelectedModels', () => {
    it('should allow direct setting of models', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.setSelectedModels(['model1', 'model2'])
      })

      expect(result.current.selectedModels).toEqual(['model1', 'model2'])
    })

    it('should allow setting with function updater', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.setSelectedModels(['model1'])
        result.current.setSelectedModels(prev => [...prev, 'model2'])
      })

      expect(result.current.selectedModels).toEqual(['model1', 'model2'])
    })

    it('should allow setting more than limit (validation happens elsewhere)', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.setSelectedModels(['model1', 'model2', 'model3', 'model4'])
      })

      // Hook allows it, but canSelectMore will be false
      expect(result.current.selectedModels.length).toBe(4)
      expect(result.current.canSelectMore).toBe(false)
    })
  })

  describe('originalSelectedModels', () => {
    it('should allow setting original selected models', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.setOriginalSelectedModels(['model1', 'model2'])
      })

      expect(result.current.originalSelectedModels).toEqual(['model1', 'model2'])
    })
  })

  describe('clearSelection', () => {
    it('should clear all selected models', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.toggleModelSelection('model1')
        result.current.toggleModelSelection('model2')
        result.current.toggleModelSelection('model3')
      })

      expect(result.current.selectedModels.length).toBe(3)

      act(() => {
        result.current.clearSelection()
      })

      expect(result.current.selectedModels).toEqual([])
      expect(result.current.canSelectMore).toBe(true)
    })
  })

  describe('isModelSelected', () => {
    it('should correctly identify selected models', () => {
      const { result } = renderHook(() =>
        useModelSelection({
          isAuthenticated: false,
          user: null,
        })
      )

      act(() => {
        result.current.toggleModelSelection('model1')
        result.current.toggleModelSelection('model2')
      })

      expect(result.current.isModelSelected('model1')).toBe(true)
      expect(result.current.isModelSelected('model2')).toBe(true)
      expect(result.current.isModelSelected('model3')).toBe(false)
    })
  })

  describe('user changes', () => {
    it('should update limit when user changes', () => {
      const { result, rerender } = renderHook(
        ({ isAuthenticated, user }) => useModelSelection({ isAuthenticated, user }),
        {
          initialProps: {
            isAuthenticated: false,
            user: null,
          },
        }
      )

      expect(result.current.maxModelsLimit).toBe(3)

      const freeUser = createMockUser({ subscription_tier: 'free' })
      rerender({ isAuthenticated: true, user: freeUser })

      expect(result.current.maxModelsLimit).toBe(3)

      const proUser = createMockUser({ subscription_tier: 'pro' })
      rerender({ isAuthenticated: true, user: proUser })

      expect(result.current.maxModelsLimit).toBe(9)
    })
  })
})
