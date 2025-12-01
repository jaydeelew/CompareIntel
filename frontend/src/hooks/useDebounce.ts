/**
 * Custom hook for debouncing values
 *
 * Delays updating a value until after a specified delay has passed
 * since the last change. Useful for expensive operations like API calls.
 */

import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set up timeout to update debounced value after delay
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Clean up timeout if value changes before delay completes
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
