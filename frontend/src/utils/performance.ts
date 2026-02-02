/**
 * Performance Monitoring Utilities
 *
 * Tracks Web Vitals and custom performance markers for monitoring
 * application performance and Core Web Vitals metrics.
 */

import { onCLS, onFCP, onLCP, onTTFB, onINP } from 'web-vitals'
import type { Metric } from 'web-vitals'

/**
 * Performance budget thresholds (in milliseconds or score)
 * Based on Core Web Vitals recommendations
 */
export const PERFORMANCE_BUDGETS = {
  // Core Web Vitals thresholds
  LCP: 2500, // Largest Contentful Paint - Good: < 2.5s
  FID: 100, // First Input Delay - Good: < 100ms
  CLS: 0.1, // Cumulative Layout Shift - Good: < 0.1
  FCP: 1800, // First Contentful Paint - Good: < 1.8s
  TTFB: 800, // Time to First Byte - Good: < 800ms
  INP: 200, // Interaction to Next Paint - Good: < 200ms

  // Custom thresholds
  BUNDLE_SIZE: 200 * 1024, // 200KB gzipped
  INITIAL_LOAD: 3000, // 3 seconds
} as const

/**
 * Performance metric with additional context
 */
export interface PerformanceMetric extends Metric {
  rating: 'good' | 'needs-improvement' | 'poor'
  threshold: number
}

/**
 * Callback function type for performance metrics
 */
export type PerformanceCallback = (metric: PerformanceMetric) => void

/**
 * Get performance rating based on metric value and threshold
 */
function getRating(
  value: number,
  threshold: number,
  lowerIsBetter: boolean = true
): 'good' | 'needs-improvement' | 'poor' {
  if (lowerIsBetter) {
    if (value <= threshold) return 'good'
    if (value <= threshold * 1.5) return 'needs-improvement'
    return 'poor'
  } else {
    if (value >= threshold) return 'good'
    if (value >= threshold * 0.75) return 'needs-improvement'
    return 'poor'
  }
}

/**
 * Report performance metric with rating
 */
function reportMetric(
  metric: Metric,
  threshold: number,
  callback?: PerformanceCallback,
  lowerIsBetter: boolean = true
): void {
  const rating = getRating(metric.value, threshold, lowerIsBetter)
  const enhancedMetric: PerformanceMetric = {
    ...metric,
    rating,
    threshold,
  }

  // Log to console in development
  if (import.meta.env.DEV) {
    const emoji = rating === 'good' ? '✅' : rating === 'needs-improvement' ? '⚠️' : '❌'
    console.log(`${emoji} [Performance] ${metric.name}: ${metric.value.toFixed(2)}ms (${rating})`)
  }

  // Call custom callback if provided
  if (callback) {
    callback(enhancedMetric)
  }

  // Send to analytics endpoint (if configured)
  if (import.meta.env.PROD && import.meta.env.VITE_PERFORMANCE_ENDPOINT) {
    sendToAnalytics(enhancedMetric).catch(err => {
      console.error('Failed to send performance metric:', err)
    })
  }
}

/**
 * Send performance metric to analytics endpoint
 */
async function sendToAnalytics(metric: PerformanceMetric): Promise<void> {
  const endpoint = import.meta.env.VITE_PERFORMANCE_ENDPOINT
  if (!endpoint) return

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        id: metric.id,
        delta: metric.delta,
        entries: metric.entries,
        navigationType: metric.navigationType,
        url: window.location.href,
        timestamp: Date.now(),
      }),
      keepalive: true, // Ensure request completes even if page unloads
    })
  } catch (error) {
    // Silently fail - don't impact user experience
    console.error('Performance analytics error:', error)
  }
}

/**
 * Initialize Web Vitals tracking
 */
export function initWebVitals(callback?: PerformanceCallback): void {
  // Largest Contentful Paint (LCP)
  onLCP(metric => {
    reportMetric(metric, PERFORMANCE_BUDGETS.LCP, callback)
  })

  // Cumulative Layout Shift (CLS)
  onCLS(metric => {
    reportMetric(metric, PERFORMANCE_BUDGETS.CLS, callback)
  })

  // First Contentful Paint (FCP)
  onFCP(metric => {
    reportMetric(metric, PERFORMANCE_BUDGETS.FCP, callback)
  })

  // Time to First Byte (TTFB)
  onTTFB(metric => {
    reportMetric(metric, PERFORMANCE_BUDGETS.TTFB, callback)
  })

  // Interaction to Next Paint (INP) - replaces FID
  onINP(metric => {
    reportMetric(metric, PERFORMANCE_BUDGETS.INP, callback)
  })
}

/**
 * Performance marker utilities for custom measurements
 */
export class PerformanceMarker {
  private static marks: Map<string, number> = new Map()

  /**
   * Mark the start of a performance measurement
   */
  static start(name: string): void {
    const markName = `perf:${name}`
    performance.mark(markName)
    this.marks.set(name, performance.now())
  }

  /**
   * Check if a performance marker was started
   */
  static isStarted(name: string): boolean {
    return this.marks.has(name)
  }

  /**
   * Mark the end of a performance measurement and return duration
   */
  static end(name: string): number | null {
    const markName = `perf:${name}`
    const startTime = this.marks.get(name)

    if (!startTime) {
      // Only warn in development, and only if it's not a known issue (like cached responses)
      if (import.meta.env.DEV) {
        console.warn(`Performance marker "${name}" was not started`)
      }
      return null
    }

    const endTime = performance.now()
    const duration = endTime - startTime

    performance.mark(`${markName}:end`)
    performance.measure(name, markName, `${markName}:end`)

    this.marks.delete(name)

    // Log in development
    if (import.meta.env.DEV) {
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`)
    }

    return duration
  }

  /**
   * Measure a function's execution time
   */
  static async measure<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    this.start(name)
    try {
      const result = await fn()
      this.end(name)
      return result
    } catch (error) {
      this.end(name)
      throw error
    }
  }

  /**
   * Get all performance entries for a given name
   */
  static getEntries(name: string): PerformanceEntry[] {
    return performance.getEntriesByName(name)
  }

  /**
   * Clear all performance marks and measures
   */
  static clear(): void {
    this.marks.clear()
    performance.clearMarks()
    performance.clearMeasures()
  }
}

/**
 * Measure API request performance
 */
export function measureApiRequest<T>(endpoint: string, requestFn: () => Promise<T>): Promise<T> {
  return PerformanceMarker.measure(`api:${endpoint}`, requestFn)
}

/**
 * Measure component render performance
 */
export function measureRender(componentName: string, renderFn: () => void): void {
  PerformanceMarker.start(`render:${componentName}`)
  renderFn()
  PerformanceMarker.end(`render:${componentName}`)
}

/**
 * Get current performance metrics summary
 */
export function getPerformanceSummary(): {
  navigation: PerformanceNavigationTiming | null
  paint: PerformancePaintTiming[]
  resource: PerformanceResourceTiming[]
} {
  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined
  const paint = performance.getEntriesByType('paint') as PerformancePaintTiming[]
  const resource = performance.getEntriesByType('resource') as PerformanceResourceTiming[]

  return {
    navigation: navigation || null,
    paint,
    resource,
  }
}

/**
 * Check if performance budgets are met
 */
export function checkPerformanceBudgets(): {
  passed: boolean
  metrics: Array<{
    name: string
    value: number
    threshold: number
    rating: 'good' | 'needs-improvement' | 'poor'
  }>
} {
  const summary = getPerformanceSummary()
  const metrics: Array<{
    name: string
    value: number
    threshold: number
    rating: 'good' | 'needs-improvement' | 'poor'
  }> = []

  if (summary.navigation) {
    const nav = summary.navigation

    // TTFB
    const ttfb = nav.responseStart - nav.requestStart
    metrics.push({
      name: 'TTFB',
      value: ttfb,
      threshold: PERFORMANCE_BUDGETS.TTFB,
      rating: getRating(ttfb, PERFORMANCE_BUDGETS.TTFB),
    })

    // DOM Content Loaded
    const domContentLoaded = nav.domContentLoadedEventEnd - nav.fetchStart
    metrics.push({
      name: 'DOMContentLoaded',
      value: domContentLoaded,
      threshold: PERFORMANCE_BUDGETS.INITIAL_LOAD,
      rating: getRating(domContentLoaded, PERFORMANCE_BUDGETS.INITIAL_LOAD),
    })

    // Load Complete
    const loadComplete = nav.loadEventEnd - nav.fetchStart
    metrics.push({
      name: 'LoadComplete',
      value: loadComplete,
      threshold: PERFORMANCE_BUDGETS.INITIAL_LOAD,
      rating: getRating(loadComplete, PERFORMANCE_BUDGETS.INITIAL_LOAD),
    })
  }

  // FCP
  const fcpEntry = summary.paint.find(entry => entry.name === 'first-contentful-paint')
  if (fcpEntry) {
    metrics.push({
      name: 'FCP',
      value: fcpEntry.startTime,
      threshold: PERFORMANCE_BUDGETS.FCP,
      rating: getRating(fcpEntry.startTime, PERFORMANCE_BUDGETS.FCP),
    })
  }

  const passed = metrics.every(m => m.rating === 'good')

  return { passed, metrics }
}
