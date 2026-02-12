/**
 * Custom hook for input validation and error clearing
 *
 * This hook consolidates input-related validation logic that was previously
 * scattered across multiple useEffects. By moving this logic into event handlers,
 * we follow React best practices (2025) of avoiding useEffect for state synchronization.
 *
 * Key improvements over useEffect-based approach:
 * 1. Error clearing happens synchronously when input changes
 * 2. No cascading state updates
 * 3. Better performance (no extra render cycles)
 * 4. More predictable behavior
 */

import { useCallback, useRef } from 'react'

// Errors that should be automatically cleared when user starts typing
const INPUT_RELATED_ERRORS = ['Please enter some text to compare'] as const

// Errors that should be cleared after a timeout
const AUTO_DISMISS_ERROR_PATTERNS = [
  'Your input is too long for one or more of the selected models',
] as const

const AUTO_DISMISS_TIMEOUT_MS = 20000

export interface UseInputValidationConfig {
  error: string | null
  setError: (error: string | null) => void
  setInput: React.Dispatch<React.SetStateAction<string>>
}

export interface UseInputValidationReturn {
  /**
   * Enhanced setInput that automatically clears input-related errors
   * when the user starts typing. Use this instead of the raw setInput.
   */
  handleInputChange: (value: string | ((prev: string) => string)) => void

  /**
   * Sets an error that should auto-dismiss after a timeout.
   * Used for errors like "input too long" that don't require user action.
   */
  setAutoDismissError: (error: string) => void

  /**
   * Clears any auto-dismiss timeout (call on unmount)
   */
  clearAutoDismissTimeout: () => void

  /**
   * Check if the current error is input-related
   */
  isInputRelatedError: () => boolean
}

export function useInputValidation(config: UseInputValidationConfig): UseInputValidationReturn {
  const { error, setError, setInput } = config
  const autoDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Check if the current error is one that should be cleared when user types
   */
  const isInputRelatedError = useCallback((): boolean => {
    if (!error) return false
    return INPUT_RELATED_ERRORS.some(pattern => error === pattern)
  }, [error])

  /**
   * Enhanced input change handler that clears input-related errors
   * This replaces the useEffect that was watching input changes
   */
  const handleInputChange = useCallback(
    (value: string | ((prev: string) => string)) => {
      // First, update the input
      setInput(value)

      // Then, synchronously clear input-related errors
      // This is more efficient than using useEffect because:
      // 1. It happens in the same event handler
      // 2. No extra render cycle needed
      // 3. The error clearing is directly tied to the user action
      if (error && isInputRelatedError()) {
        // Only clear if the new value has content
        // We need to handle both string and function forms
        const newValueHasContent =
          typeof value === 'function'
            ? true // Can't know without calling, but if it's a function, likely adding content
            : value.trim().length > 0

        if (newValueHasContent) {
          setError(null)
        }
      }
    },
    [error, isInputRelatedError, setError, setInput]
  )

  /**
   * Set an error that will automatically dismiss after a timeout
   * This replaces the useEffect that was watching for specific error patterns
   */
  const setAutoDismissError = useCallback(
    (errorMessage: string) => {
      // Clear any existing timeout
      if (autoDismissTimeoutRef.current) {
        clearTimeout(autoDismissTimeoutRef.current)
        autoDismissTimeoutRef.current = null
      }

      setError(errorMessage)

      // Check if this error should auto-dismiss
      const shouldAutoDismiss = AUTO_DISMISS_ERROR_PATTERNS.some(pattern =>
        errorMessage.includes(pattern)
      )

      if (shouldAutoDismiss) {
        autoDismissTimeoutRef.current = setTimeout(() => {
          setError(null)
          autoDismissTimeoutRef.current = null
        }, AUTO_DISMISS_TIMEOUT_MS)
      }
    },
    [setError]
  )

  /**
   * Clear the auto-dismiss timeout
   * Should be called on component unmount
   */
  const clearAutoDismissTimeout = useCallback(() => {
    if (autoDismissTimeoutRef.current) {
      clearTimeout(autoDismissTimeoutRef.current)
      autoDismissTimeoutRef.current = null
    }
  }, [])

  return {
    handleInputChange,
    setAutoDismissError,
    clearAutoDismissTimeout,
    isInputRelatedError,
  }
}

/**
 * Utility function to check if an error message matches auto-dismiss patterns
 * Can be used without the hook for simple checks
 */
export function shouldAutoDismissError(error: string | null): boolean {
  if (!error) return false
  return AUTO_DISMISS_ERROR_PATTERNS.some(pattern => error.includes(pattern))
}
