/**
 * Tests for useAnimationState hook
 *
 * Tests animation state management that replaces useEffect-based
 * animation clearing patterns.
 */

import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useAnimationState } from '../../hooks/useAnimationState'

describe('useAnimationState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with animations disabled', () => {
      const { result } = renderHook(() => useAnimationState())

      expect(result.current.isAnimatingButton).toBe(false)
      expect(result.current.isAnimatingTextarea).toBe(false)
    })
  })

  describe('startButtonAnimation', () => {
    it('should enable button animation', () => {
      const { result } = renderHook(() => useAnimationState())

      act(() => {
        result.current.startButtonAnimation()
      })

      expect(result.current.isAnimatingButton).toBe(true)
      expect(result.current.isAnimatingTextarea).toBe(false)
    })
  })

  describe('startTextareaAnimation', () => {
    it('should enable textarea animation', () => {
      const { result } = renderHook(() => useAnimationState())

      act(() => {
        result.current.startTextareaAnimation()
      })

      expect(result.current.isAnimatingTextarea).toBe(true)
      expect(result.current.isAnimatingButton).toBe(false)
    })
  })

  describe('stopAllAnimations', () => {
    it('should stop all animations', () => {
      const { result } = renderHook(() => useAnimationState())

      act(() => {
        result.current.startButtonAnimation()
        result.current.startTextareaAnimation()
      })

      expect(result.current.isAnimatingButton).toBe(true)
      expect(result.current.isAnimatingTextarea).toBe(true)

      act(() => {
        result.current.stopAllAnimations()
      })

      expect(result.current.isAnimatingButton).toBe(false)
      expect(result.current.isAnimatingTextarea).toBe(false)
    })
  })

  describe('clearAnimations', () => {
    it('should be an alias for stopAllAnimations', () => {
      const { result } = renderHook(() => useAnimationState())

      act(() => {
        result.current.startButtonAnimation()
        result.current.startTextareaAnimation()
      })

      act(() => {
        result.current.clearAnimations()
      })

      expect(result.current.isAnimatingButton).toBe(false)
      expect(result.current.isAnimatingTextarea).toBe(false)
    })
  })

  describe('handleInputWithAnimationClear', () => {
    it('should execute the handler and return its result', () => {
      const { result } = renderHook(() => useAnimationState())

      let handlerResult: string = ''
      act(() => {
        handlerResult = result.current.handleInputWithAnimationClear(() => 'handler result')
      })

      expect(handlerResult).toBe('handler result')
    })

    it('should clear animations when they are active', () => {
      const { result } = renderHook(() => useAnimationState())

      act(() => {
        result.current.startButtonAnimation()
        result.current.startTextareaAnimation()
      })

      expect(result.current.isAnimatingButton).toBe(true)

      act(() => {
        result.current.handleInputWithAnimationClear(() => 'test')
      })

      expect(result.current.isAnimatingButton).toBe(false)
      expect(result.current.isAnimatingTextarea).toBe(false)
    })

    it('should not fail when animations are not active', () => {
      const { result } = renderHook(() => useAnimationState())

      let executed = false
      act(() => {
        result.current.handleInputWithAnimationClear(() => {
          executed = true
        })
      })

      expect(executed).toBe(true)
    })
  })

  describe('scroll event handling', () => {
    it('should clear animations on scroll', () => {
      const { result } = renderHook(() => useAnimationState())

      act(() => {
        result.current.startButtonAnimation()
        result.current.startTextareaAnimation()
      })

      expect(result.current.isAnimatingButton).toBe(true)
      expect(result.current.isAnimatingTextarea).toBe(true)

      // Simulate scroll event
      act(() => {
        window.dispatchEvent(new Event('scroll'))
      })

      expect(result.current.isAnimatingButton).toBe(false)
      expect(result.current.isAnimatingTextarea).toBe(false)
    })

    it('should cleanup scroll listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderHook(() => useAnimationState())

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function))

      removeEventListenerSpy.mockRestore()
    })
  })

  describe('with targetElementRef', () => {
    it('should check element visibility on scroll', () => {
      // Create a mock element ref
      const mockElement = document.createElement('div')

      // Mock getBoundingClientRect to return element in view
      vi.spyOn(mockElement, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 200,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      })

      // Create a wrapper that provides the ref
      const { result } = renderHook(() => {
        const ref = useRef<HTMLDivElement>(mockElement)
        return useAnimationState({ targetElementRef: ref })
      })

      act(() => {
        result.current.startButtonAnimation()
      })

      expect(result.current.isAnimatingButton).toBe(true)

      // Simulate scroll event
      act(() => {
        window.dispatchEvent(new Event('scroll'))
      })

      // Animation should be cleared because scroll happened
      expect(result.current.isAnimatingButton).toBe(false)
    })
  })
})
