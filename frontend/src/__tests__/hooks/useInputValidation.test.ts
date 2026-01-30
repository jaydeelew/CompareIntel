/**
 * Tests for useInputValidation hook
 *
 * Tests input validation and automatic error clearing behavior
 * that replaces useEffect-based state synchronization patterns.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useInputValidation, shouldAutoDismissError } from '../../hooks/useInputValidation'

describe('useInputValidation', () => {
  let mockSetError: ReturnType<typeof vi.fn>
  let mockSetInput: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSetError = vi.fn()
    mockSetInput = vi.fn()
  })

  describe('handleInputChange', () => {
    it('should call setInput with the provided value', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: null,
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.handleInputChange('test input')
      })

      expect(mockSetInput).toHaveBeenCalledWith('test input')
    })

    it('should clear input-related error when user types content', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: 'Please enter some text to compare',
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.handleInputChange('some text')
      })

      expect(mockSetInput).toHaveBeenCalledWith('some text')
      expect(mockSetError).toHaveBeenCalledWith(null)
    })

    it('should clear follow-up error when user types content', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: 'Please enter a follow-up question or code',
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.handleInputChange('follow up question')
      })

      expect(mockSetError).toHaveBeenCalledWith(null)
    })

    it('should NOT clear error when input is whitespace only', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: 'Please enter some text to compare',
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.handleInputChange('   ')
      })

      expect(mockSetInput).toHaveBeenCalledWith('   ')
      expect(mockSetError).not.toHaveBeenCalled()
    })

    it('should NOT clear non-input-related errors', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: 'Server error occurred',
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.handleInputChange('some text')
      })

      expect(mockSetInput).toHaveBeenCalledWith('some text')
      expect(mockSetError).not.toHaveBeenCalled()
    })

    it('should handle function updater for setInput', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: 'Please enter some text to compare',
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      const updater = (prev: string) => prev + ' updated'

      act(() => {
        result.current.handleInputChange(updater)
      })

      expect(mockSetInput).toHaveBeenCalledWith(updater)
      // When a function is passed, we assume it adds content
      expect(mockSetError).toHaveBeenCalledWith(null)
    })
  })

  describe('isInputRelatedError', () => {
    it('should return true for "Please enter some text to compare"', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: 'Please enter some text to compare',
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      expect(result.current.isInputRelatedError()).toBe(true)
    })

    it('should return true for "Please enter a follow-up question or code"', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: 'Please enter a follow-up question or code',
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      expect(result.current.isInputRelatedError()).toBe(true)
    })

    it('should return false for other errors', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: 'Some other error',
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      expect(result.current.isInputRelatedError()).toBe(false)
    })

    it('should return false when error is null', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: null,
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      expect(result.current.isInputRelatedError()).toBe(false)
    })
  })

  describe('setAutoDismissError', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should set the error immediately', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: null,
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.setAutoDismissError(
          'Your input is too long for one or more of the selected models'
        )
      })

      expect(mockSetError).toHaveBeenCalledWith(
        'Your input is too long for one or more of the selected models'
      )
    })

    it('should auto-dismiss "input too long" error after 20 seconds', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: null,
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.setAutoDismissError(
          'Your input is too long for one or more of the selected models'
        )
      })

      // Error should be set
      expect(mockSetError).toHaveBeenCalledWith(
        'Your input is too long for one or more of the selected models'
      )
      mockSetError.mockClear()

      // Fast-forward 19 seconds - should not be dismissed yet
      act(() => {
        vi.advanceTimersByTime(19000)
      })
      expect(mockSetError).not.toHaveBeenCalled()

      // Fast-forward 1 more second (total 20 seconds) - should be dismissed
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(mockSetError).toHaveBeenCalledWith(null)
    })

    it('should NOT auto-dismiss non-matching errors', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: null,
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.setAutoDismissError('Some other error')
      })

      expect(mockSetError).toHaveBeenCalledWith('Some other error')
      mockSetError.mockClear()

      // Fast-forward 25 seconds - should NOT be dismissed
      act(() => {
        vi.advanceTimersByTime(25000)
      })
      expect(mockSetError).not.toHaveBeenCalled()
    })

    it('should cancel previous timeout when setting new auto-dismiss error', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: null,
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      // Set first error
      act(() => {
        result.current.setAutoDismissError(
          'Your input is too long for one or more of the selected models - first'
        )
      })

      // Fast-forward 10 seconds
      act(() => {
        vi.advanceTimersByTime(10000)
      })

      // Set second error (should cancel first timeout)
      mockSetError.mockClear()
      act(() => {
        result.current.setAutoDismissError(
          'Your input is too long for one or more of the selected models - second'
        )
      })

      expect(mockSetError).toHaveBeenCalledWith(
        'Your input is too long for one or more of the selected models - second'
      )
      mockSetError.mockClear()

      // Fast-forward 10 more seconds (total 20 from first, 10 from second)
      // First should have been cancelled, so no dismiss yet
      act(() => {
        vi.advanceTimersByTime(10000)
      })

      // Should NOT be dismissed (only 10 seconds since second error)
      expect(mockSetError).not.toHaveBeenCalled()

      // Fast-forward 10 more seconds (total 20 from second)
      act(() => {
        vi.advanceTimersByTime(10000)
      })

      // Now it should be dismissed
      expect(mockSetError).toHaveBeenCalledWith(null)
    })
  })

  describe('clearAutoDismissTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should cancel the auto-dismiss timeout', () => {
      const { result } = renderHook(() =>
        useInputValidation({
          error: null,
          setError: mockSetError,
          setInput: mockSetInput,
        })
      )

      act(() => {
        result.current.setAutoDismissError(
          'Your input is too long for one or more of the selected models'
        )
      })
      mockSetError.mockClear()

      // Cancel the timeout
      act(() => {
        result.current.clearAutoDismissTimeout()
      })

      // Fast-forward 25 seconds - should NOT be dismissed because timeout was cleared
      act(() => {
        vi.advanceTimersByTime(25000)
      })
      expect(mockSetError).not.toHaveBeenCalled()
    })
  })
})

describe('shouldAutoDismissError', () => {
  it('should return true for "input too long" errors', () => {
    expect(
      shouldAutoDismissError('Your input is too long for one or more of the selected models')
    ).toBe(true)
  })

  it('should return true for partial match of "input too long"', () => {
    expect(
      shouldAutoDismissError(
        'Error: Your input is too long for one or more of the selected models. Please shorten your input.'
      )
    ).toBe(true)
  })

  it('should return false for other errors', () => {
    expect(shouldAutoDismissError('Server error')).toBe(false)
    expect(shouldAutoDismissError('Please enter some text')).toBe(false)
  })

  it('should return false for null', () => {
    expect(shouldAutoDismissError(null)).toBe(false)
  })
})
