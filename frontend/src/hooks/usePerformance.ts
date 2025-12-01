/**
 * React Hook for Performance Monitoring
 *
 * Provides hooks for tracking performance metrics and measuring
 * component render times.
 */

import { useEffect, useRef, useCallback } from 'react'

import { PerformanceMarker, initWebVitals } from '../utils/performance'
import type { PerformanceCallback } from '../utils/performance'

/**
 * Hook to track Web Vitals metrics
 */
export function useWebVitals(callback?: PerformanceCallback): void {
  useEffect(() => {
    initWebVitals(callback)
  }, [callback])
}

/**
 * Hook to measure component render performance
 */
export function useRenderPerformance(componentName: string): {
  measureRender: (renderFn: () => void) => void
} {
  const renderCount = useRef(0)

  const measureRender = useCallback(
    (renderFn: () => void) => {
      renderCount.current += 1
      PerformanceMarker.start(`render:${componentName}:${renderCount.current}`)
      renderFn()
      PerformanceMarker.end(`render:${componentName}:${renderCount.current}`)
    },
    [componentName]
  )

  return { measureRender }
}

/**
 * Hook to measure async operations
 */
export function useAsyncPerformance(operationName: string): {
  measure: <R>(fn: () => Promise<R>) => Promise<R>
} {
  const measure = useCallback(
    async <R>(fn: () => Promise<R>): Promise<R> => {
      return PerformanceMarker.measure(operationName, fn)
    },
    [operationName]
  )

  return { measure }
}

/**
 * Hook to track performance metrics and log them
 */
export function usePerformanceTracking(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return

    const callback: PerformanceCallback = metric => {
      // In development, log all metrics
      if (import.meta.env.DEV) {
        console.log(`[Performance] ${metric.name}: ${metric.value.toFixed(2)}ms (${metric.rating})`)
      }

      // In production, you might want to send to analytics
      // This is handled by the performance utility
    }

    initWebVitals(callback)
  }, [enabled])
}
