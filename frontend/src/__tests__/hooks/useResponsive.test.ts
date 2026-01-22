/**
 * Tests for useResponsive hook
 *
 * Tests combined breakpoint and touch detection functionality.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useResponsive } from '../../hooks/useResponsive'

// Mock the constants
vi.mock('../../config/constants', () => ({
  BREAKPOINT_SMALL: 640,
  BREAKPOINT_MOBILE: 768,
  BREAKPOINT_WIDE: 1000,
}))

describe('useResponsive', () => {
  const originalInnerWidth = window.innerWidth
  const originalOntouchstart = 'ontouchstart' in window
  const originalMaxTouchPoints = navigator.maxTouchPoints

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset to desktop defaults
    Object.defineProperty(window, 'innerWidth', {
      value: 1200,
      writable: true,
      configurable: true,
    })

    // Make it a non-touch device by default
    delete (window as Record<string, unknown>).ontouchstart
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    // Restore original values
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    })

    if (originalOntouchstart) {
      ;(window as Record<string, unknown>).ontouchstart = () => {}
    }
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalMaxTouchPoints,
      writable: true,
      configurable: true,
    })
  })

  it('should detect desktop layout correctly', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })

    const { result } = renderHook(() => useResponsive())

    expect(result.current.isSmallLayout).toBe(false)
    expect(result.current.isMobileLayout).toBe(false)
    expect(result.current.isWideLayout).toBe(true)
    expect(result.current.viewportWidth).toBe(1200)
    expect(result.current.isTouchDevice).toBe(false)
  })

  it('should detect small layout (<= 640px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true })

    const { result } = renderHook(() => useResponsive())

    expect(result.current.isSmallLayout).toBe(true)
    expect(result.current.isMobileLayout).toBe(true)
    expect(result.current.isWideLayout).toBe(false)
    expect(result.current.viewportWidth).toBe(600)
  })

  it('should detect mobile layout (<= 768px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true })

    const { result } = renderHook(() => useResponsive())

    expect(result.current.isSmallLayout).toBe(false)
    expect(result.current.isMobileLayout).toBe(true)
    expect(result.current.isWideLayout).toBe(false)
  })

  it('should detect narrow desktop (> 768px but <= 1000px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })

    const { result } = renderHook(() => useResponsive())

    expect(result.current.isSmallLayout).toBe(false)
    expect(result.current.isMobileLayout).toBe(false)
    expect(result.current.isWideLayout).toBe(false)
  })

  it('should detect touch device via ontouchstart', () => {
    ;(window as Record<string, unknown>).ontouchstart = () => {}

    const { result } = renderHook(() => useResponsive())

    expect(result.current.isTouchDevice).toBe(true)
  })

  it('should detect touch device via maxTouchPoints', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })

    const { result } = renderHook(() => useResponsive())

    expect(result.current.isTouchDevice).toBe(true)
  })

  it('should update on window resize', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })

    const { result } = renderHook(() => useResponsive())

    expect(result.current.viewportWidth).toBe(1200)
    expect(result.current.isMobileLayout).toBe(false)

    // Simulate resize to mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.viewportWidth).toBe(500)
    expect(result.current.isMobileLayout).toBe(true)
    expect(result.current.isSmallLayout).toBe(true)
  })

  it('should update on orientation change', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })

    const { result } = renderHook(() => useResponsive())

    expect(result.current.isMobileLayout).toBe(false)

    // Simulate orientation change to portrait
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
      window.dispatchEvent(new Event('orientationchange'))
    })

    expect(result.current.isMobileLayout).toBe(true)
  })

  it('should detect exact breakpoint boundaries', () => {
    // Test exactly at 640px (should be small)
    Object.defineProperty(window, 'innerWidth', { value: 640, configurable: true })
    const { result: result640 } = renderHook(() => useResponsive())
    expect(result640.current.isSmallLayout).toBe(true)

    // Test exactly at 768px (should be mobile)
    Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true })
    const { result: result768 } = renderHook(() => useResponsive())
    expect(result768.current.isMobileLayout).toBe(true)
    expect(result768.current.isSmallLayout).toBe(false)

    // Test exactly at 1000px (should NOT be wide)
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    const { result: result1000 } = renderHook(() => useResponsive())
    expect(result1000.current.isWideLayout).toBe(false)

    // Test at 1001px (should be wide)
    Object.defineProperty(window, 'innerWidth', { value: 1001, configurable: true })
    const { result: result1001 } = renderHook(() => useResponsive())
    expect(result1001.current.isWideLayout).toBe(true)
  })

  it('should cleanup event listeners on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useResponsive())

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('orientationchange', expect.any(Function))

    removeEventListenerSpy.mockRestore()
  })

  it('should memoize state object to prevent unnecessary re-renders', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })

    const { result, rerender } = renderHook(() => useResponsive())

    const firstState = result.current

    // Rerender without any changes
    rerender()

    // State reference should be the same (memoized)
    expect(result.current).toBe(firstState)
  })

  it('should handle SSR scenario (window undefined)', () => {
    // This test verifies the initial state fallbacks
    // The hook checks typeof window === 'undefined'
    // In actual SSR, window would be undefined, but in test environment it exists
    // So we just verify the hook doesn't crash and returns valid values

    const { result } = renderHook(() => useResponsive())

    expect(typeof result.current.viewportWidth).toBe('number')
    expect(typeof result.current.isTouchDevice).toBe('boolean')
  })
})
