/**
 * Tests for useActiveTabIndex hook
 *
 * Tests tab index management with bounds checking that replaces
 * useEffect-based cascading state updates.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useActiveTabIndex, clampTabIndex } from '../../hooks/useActiveTabIndex'

describe('useActiveTabIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default index of 0', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 5 }))

      expect(result.current.activeTabIndex).toBe(0)
      expect(result.current.rawIndex).toBe(0)
    })

    it('should initialize with custom initial index', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 5, initialIndex: 2 }))

      expect(result.current.activeTabIndex).toBe(2)
      expect(result.current.rawIndex).toBe(2)
    })

    it('should clamp initial index if out of bounds', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 3, initialIndex: 5 }))

      // rawIndex stores what was set, activeTabIndex is clamped
      expect(result.current.rawIndex).toBe(5)
      expect(result.current.activeTabIndex).toBe(0)
    })
  })

  describe('setActiveTabIndex', () => {
    it('should set valid index', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 5 }))

      act(() => {
        result.current.setActiveTabIndex(3)
      })

      expect(result.current.activeTabIndex).toBe(3)
      expect(result.current.rawIndex).toBe(3)
    })

    it('should clamp index when set out of bounds', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 3 }))

      act(() => {
        result.current.setActiveTabIndex(10)
      })

      // rawIndex stores what was set
      expect(result.current.rawIndex).toBe(10)
      // activeTabIndex is clamped to 0
      expect(result.current.activeTabIndex).toBe(0)
    })

    it('should clamp negative index to 0', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 5 }))

      act(() => {
        result.current.setActiveTabIndex(-5)
      })

      expect(result.current.rawIndex).toBe(-5)
      expect(result.current.activeTabIndex).toBe(0)
    })
  })

  describe('automatic clamping when tabCount changes', () => {
    it('should automatically clamp when tabCount decreases', () => {
      const { result, rerender } = renderHook(({ tabCount }) => useActiveTabIndex({ tabCount }), {
        initialProps: { tabCount: 5 },
      })

      // Set index to 4 (valid for tabCount 5)
      act(() => {
        result.current.setActiveTabIndex(4)
      })
      expect(result.current.activeTabIndex).toBe(4)

      // Decrease tabCount to 3 (index 4 is now out of bounds)
      rerender({ tabCount: 3 })

      // activeTabIndex should be clamped to 0
      expect(result.current.activeTabIndex).toBe(0)
      // rawIndex still stores the original value
      expect(result.current.rawIndex).toBe(4)
    })

    it('should keep valid index when tabCount increases', () => {
      const { result, rerender } = renderHook(({ tabCount }) => useActiveTabIndex({ tabCount }), {
        initialProps: { tabCount: 3 },
      })

      act(() => {
        result.current.setActiveTabIndex(2)
      })
      expect(result.current.activeTabIndex).toBe(2)

      // Increase tabCount to 10 (index 2 is still valid)
      rerender({ tabCount: 10 })

      expect(result.current.activeTabIndex).toBe(2)
    })
  })

  describe('nextTab', () => {
    it('should go to next tab', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 5 }))

      act(() => {
        result.current.nextTab()
      })

      expect(result.current.activeTabIndex).toBe(1)
    })

    it('should wrap around from last to first', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 3, initialIndex: 2 }))

      expect(result.current.activeTabIndex).toBe(2)

      act(() => {
        result.current.nextTab()
      })

      expect(result.current.activeTabIndex).toBe(0)
    })

    it('should do nothing when tabCount is 0', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 0 }))

      act(() => {
        result.current.nextTab()
      })

      expect(result.current.activeTabIndex).toBe(0)
    })
  })

  describe('prevTab', () => {
    it('should go to previous tab', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 5, initialIndex: 2 }))

      act(() => {
        result.current.prevTab()
      })

      expect(result.current.activeTabIndex).toBe(1)
    })

    it('should wrap around from first to last', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 3, initialIndex: 0 }))

      act(() => {
        result.current.prevTab()
      })

      expect(result.current.activeTabIndex).toBe(2)
    })

    it('should do nothing when tabCount is 0', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 0 }))

      act(() => {
        result.current.prevTab()
      })

      expect(result.current.activeTabIndex).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('should handle single tab', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 1 }))

      expect(result.current.activeTabIndex).toBe(0)

      // Next and prev should stay at 0
      act(() => {
        result.current.nextTab()
      })
      expect(result.current.activeTabIndex).toBe(0)

      act(() => {
        result.current.prevTab()
      })
      expect(result.current.activeTabIndex).toBe(0)
    })

    it('should handle zero tabs', () => {
      const { result } = renderHook(() => useActiveTabIndex({ tabCount: 0 }))

      expect(result.current.activeTabIndex).toBe(0)

      act(() => {
        result.current.setActiveTabIndex(5)
      })
      expect(result.current.activeTabIndex).toBe(0)
    })
  })
})

describe('clampTabIndex', () => {
  it('should return 0 for zero tabCount', () => {
    expect(clampTabIndex(0, 0)).toBe(0)
    expect(clampTabIndex(5, 0)).toBe(0)
  })

  it('should return index if within bounds', () => {
    expect(clampTabIndex(2, 5)).toBe(2)
    expect(clampTabIndex(0, 3)).toBe(0)
    expect(clampTabIndex(4, 5)).toBe(4)
  })

  it('should return 0 for out-of-bounds index', () => {
    expect(clampTabIndex(10, 5)).toBe(0)
    expect(clampTabIndex(-1, 5)).toBe(0)
  })

  it('should handle edge case at boundary', () => {
    // Index 4 should be valid for tabCount 5 (indices 0-4)
    expect(clampTabIndex(4, 5)).toBe(4)
    // Index 5 should be clamped to 0 for tabCount 5
    expect(clampTabIndex(5, 5)).toBe(0)
  })
})
