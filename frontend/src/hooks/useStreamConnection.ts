/**
 * useStreamConnection - Abort controller and cancellation for streaming.
 * Manages the lifecycle of the current stream's AbortController.
 */

import { useCallback, useRef } from 'react'

export interface UseStreamConnectionCallbacks {
  setIsLoading: (loading: boolean) => void
  setCurrentAbortController: (controller: AbortController | null) => void
}

export interface UseStreamConnectionReturn {
  currentAbortControllerRef: React.MutableRefObject<AbortController | null>
  cancelComparison: () => void
}

export function useStreamConnection(
  callbacks: UseStreamConnectionCallbacks,
  userCancelledRef: React.MutableRefObject<boolean>
): UseStreamConnectionReturn {
  const currentAbortControllerRef = useRef<AbortController | null>(null)
  const { setIsLoading, setCurrentAbortController } = callbacks

  const cancelComparison = useCallback(() => {
    if (currentAbortControllerRef.current) {
      userCancelledRef.current = true
      currentAbortControllerRef.current.abort()
      currentAbortControllerRef.current = null
    }
    setIsLoading(false)
    setCurrentAbortController(null)
  }, [setIsLoading, setCurrentAbortController, userCancelledRef])

  return {
    currentAbortControllerRef,
    cancelComparison,
  }
}
