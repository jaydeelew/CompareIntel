/**
 * Tests for useDebounce hook
 *
 * Tests debouncing functionality, state updates, and cleanup.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useDebounce } from '../../hooks/useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500))
    expect(result.current).toBe('initial')
  })

  it('should debounce value updates', async () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 500 },
    })

    expect(result.current).toBe('initial')

    // Update value
    rerender({ value: 'updated', delay: 500 })
    expect(result.current).toBe('initial') // Should still be initial

    // Fast-forward time but not enough
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe('initial') // Should still be initial

    // Fast-forward to complete delay
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe('updated')
  })

  it('should reset timer when value changes rapidly', async () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'value1', delay: 500 },
    })

    // Change value multiple times rapidly
    rerender({ value: 'value2', delay: 500 })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    rerender({ value: 'value3', delay: 500 })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    rerender({ value: 'value4', delay: 500 })

    // Should still be initial value
    expect(result.current).toBe('value1')

    // Complete the delay from last change
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('value4')
  })

  it('should handle different delay values', async () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 1000 },
    })

    rerender({ value: 'updated', delay: 1000 })

    // Should not update after short delay
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('initial')

    // Should update after full delay
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('updated')
  })

  it('should handle delay changes', async () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 1000 },
    })

    rerender({ value: 'updated', delay: 500 })

    // Should update after new shorter delay
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('updated')
  })

  it('should handle number values', async () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 0, delay: 500 },
    })

    rerender({ value: 42, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(42)
  })

  it('should handle object values', async () => {
    const obj1 = { name: 'test1' }
    const obj2 = { name: 'test2' }

    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: obj1, delay: 500 },
    })

    rerender({ value: obj2, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(obj2)
  })

  it('should handle array values', async () => {
    const arr1 = [1, 2, 3]
    const arr2 = [4, 5, 6]

    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: arr1, delay: 500 },
    })

    rerender({ value: arr2, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(arr2)
  })

  it('should cleanup timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    const { unmount } = renderHook(() => useDebounce('test', 500))

    unmount()

    // Should have called clearTimeout for cleanup
    expect(clearTimeoutSpy).toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
  })

  it('should use default delay of 500ms when not provided', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'initial' },
    })

    rerender({ value: 'updated' })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('updated')
  })
})
