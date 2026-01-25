import React, { useState, useEffect, useCallback, useRef } from 'react'

import {
  getPerformanceSummary,
  checkPerformanceBudgets,
  PERFORMANCE_BUDGETS,
  initWebVitals,
} from '../../utils/performance'
import type { PerformanceMetric } from '../../utils/performance'

interface WebVitalsState {
  [key: string]: PerformanceMetric | null
}

interface PerformanceMarkerEntry {
  name: string
  duration: number
  entries: PerformanceEntry[]
}

const PerformanceMonitoringTab: React.FC = () => {
  const [webVitals, setWebVitals] = useState<WebVitalsState>({
    LCP: null,
    CLS: null,
    FCP: null,
    TTFB: null,
    INP: null,
  })
  const [budgetCheck, setBudgetCheck] = useState<ReturnType<typeof checkPerformanceBudgets> | null>(
    null
  )
  const [performanceSummary, setPerformanceSummary] = useState<ReturnType<
    typeof getPerformanceSummary
  > | null>(null)
  const [apiMarkers, setApiMarkers] = useState<PerformanceMarkerEntry[]>([])
  const [autoRefresh, setAutoRefresh] = useState(false)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Collect Web Vitals metrics
  useEffect(() => {
    // Track Web Vitals metrics via callback
    const handleMetric = (metric: PerformanceMetric) => {
      setWebVitals(prev => ({
        ...prev,
        [metric.name]: metric,
      }))
    }

    // Initialize Web Vitals tracking to capture metrics
    initWebVitals(handleMetric)
  }, [])

  // Helper function to get rating for a metric value
  const getRatingForValue = useCallback(
    (
      value: number,
      threshold: number,
      lowerIsBetter: boolean = true
    ): 'good' | 'needs-improvement' | 'poor' => {
      if (lowerIsBetter) {
        if (value <= threshold) return 'good'
        if (value <= threshold * 1.5) return 'needs-improvement'
        return 'poor'
      } else {
        if (value >= threshold) return 'good'
        if (value >= threshold * 0.75) return 'needs-improvement'
        return 'poor'
      }
    },
    []
  )

  // Try to extract metrics from performance entries
  const extractMetricsFromEntries = useCallback(() => {
    const summary = getPerformanceSummary()
    const updates: Partial<WebVitalsState> = {}

    // Extract FCP from paint timing (if available)
    if (summary.paint) {
      const fcpEntry = summary.paint.find(entry => entry.name === 'first-contentful-paint')
      if (fcpEntry) {
        updates.FCP = {
          name: 'FCP',
          value: fcpEntry.startTime,
          rating: getRatingForValue(fcpEntry.startTime, PERFORMANCE_BUDGETS.FCP),
          threshold: PERFORMANCE_BUDGETS.FCP,
          id: 'fcp-from-paint',
          delta: fcpEntry.startTime,
          entries: [],
          navigationType: 'navigate' as NavigationType,
        } as PerformanceMetric
      }
    }

    // Extract TTFB from navigation timing (if available)
    if (summary.navigation) {
      const ttfb = summary.navigation.responseStart - summary.navigation.requestStart
      updates.TTFB = {
        name: 'TTFB',
        value: ttfb,
        rating: getRatingForValue(ttfb, PERFORMANCE_BUDGETS.TTFB),
        threshold: PERFORMANCE_BUDGETS.TTFB,
        id: 'ttfb-from-navigation',
        delta: ttfb,
        entries: [],
        navigationType: 'navigate' as NavigationType,
      } as PerformanceMetric
    }

    // Update state if we found any metrics (only update if not already set)
    if (Object.keys(updates).length > 0) {
      setWebVitals(prev => {
        const newState = { ...prev }
        Object.entries(updates).forEach(([key, value]) => {
          if (!prev[key as keyof WebVitalsState] && value) {
            newState[key as keyof WebVitalsState] = value
          }
        })
        return newState
      })
    }
  }, [getRatingForValue])

  const refreshMetrics = useCallback(() => {
    // Get performance summary
    const summary = getPerformanceSummary()
    setPerformanceSummary(summary)

    // Try to extract metrics from performance entries
    extractMetricsFromEntries()

    // Check budgets
    const budgets = checkPerformanceBudgets()
    setBudgetCheck(budgets)

    // Get API performance markers
    const allEntries = performance.getEntriesByType('measure') as PerformanceMeasure[]
    const apiEntries = allEntries
      .filter(entry => entry.name.startsWith('api:'))
      .map(entry => ({
        name: entry.name.replace('api:', ''),
        duration: entry.duration,
        entries: performance.getEntriesByName(entry.name),
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 20) // Show top 20

    setApiMarkers(apiEntries)
  }, [extractMetricsFromEntries])

  useEffect(() => {
    refreshMetrics()

    if (autoRefresh) {
      const interval = setInterval(refreshMetrics, 5000) // Refresh every 5 seconds
      refreshIntervalRef.current = interval
      return () => {
        if (interval) clearInterval(interval)
      }
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [autoRefresh, refreshMetrics])

  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`
    }
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const getRatingColor = (rating: 'good' | 'needs-improvement' | 'poor'): string => {
    switch (rating) {
      case 'good':
        return 'var(--success-color, #10b981)'
      case 'needs-improvement':
        return 'var(--warning-color, #f59e0b)'
      case 'poor':
        return 'var(--error-color, #ef4444)'
      default:
        return 'var(--text-secondary)'
    }
  }

  const getRatingEmoji = (rating: 'good' | 'needs-improvement' | 'poor'): string => {
    switch (rating) {
      case 'good':
        return '✅'
      case 'needs-improvement':
        return '⚠️'
      case 'poor':
        return '❌'
      default:
        return '⚪'
    }
  }

  return (
    <div className="performance-monitoring-tab">
      <div className="performance-header">
        <h2>Performance Monitoring</h2>
        <div className="performance-controls">
          <button
            className={`refresh-btn ${autoRefresh ? 'active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Stop auto-refresh' : 'Enable auto-refresh (5s)'}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh'}
          </button>
          <button className="refresh-btn" onClick={refreshMetrics} title="Refresh metrics now">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            Refresh Now
          </button>
        </div>
      </div>

      {/* Web Vitals Section */}
      <div className="performance-section">
        <h3>Core Web Vitals</h3>
        <div className="web-vitals-grid">
          {Object.entries(webVitals).map(([name, metric]) => (
            <div key={name} className="metric-card">
              <div className="metric-header">
                <span className="metric-name">{name}</span>
                {metric && (
                  <span className="metric-rating" style={{ color: getRatingColor(metric.rating) }}>
                    {getRatingEmoji(metric.rating)} {metric.rating}
                  </span>
                )}
              </div>
              <div className="metric-value">
                {metric ? formatDuration(metric.value) : 'Not measured'}
              </div>
              {metric && (
                <div className="metric-threshold">
                  Threshold: {formatDuration(metric.threshold)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="web-vitals-info">
          {!webVitals.LCP && (
            <p className="info-text-small">
              <strong>LCP:</strong> Will be measured when the largest content element becomes
              visible. May require scrolling or page reload.
            </p>
          )}
          {!webVitals.CLS && (
            <p className="info-text-small">
              <strong>CLS:</strong> Measures layout shifts. Will appear as you interact with the
              page or after a page reload.
            </p>
          )}
          {!webVitals.INP && (
            <p className="info-text-small">
              <strong>INP:</strong> Requires user interaction (click, tap, or keypress). Interact
              with the page to measure.
            </p>
          )}
        </div>
      </div>

      {/* Performance Budgets Section */}
      {budgetCheck && (
        <div className="performance-section">
          <h3>Performance Budgets</h3>
          <div
            className={`budget-status ${budgetCheck.passed ? 'passed' : 'failed'}`}
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: budgetCheck.passed
                ? 'var(--success-bg, rgba(16, 185, 129, 0.1))'
                : 'var(--error-bg, rgba(239, 68, 68, 0.1))',
              border: `1px solid ${
                budgetCheck.passed ? 'var(--success-color, #10b981)' : 'var(--error-color, #ef4444)'
              }`,
              marginBottom: '1rem',
            }}
          >
            <strong>
              {budgetCheck.passed ? '✅ All budgets met' : '❌ Some budgets exceeded'}
            </strong>
          </div>
          <div className="budget-metrics">
            {budgetCheck.metrics.map(metric => (
              <div key={metric.name} className="budget-metric">
                <div className="budget-metric-header">
                  <span className="budget-metric-name">{metric.name}</span>
                  <span
                    className="budget-metric-rating"
                    style={{ color: getRatingColor(metric.rating) }}
                  >
                    {getRatingEmoji(metric.rating)} {metric.rating}
                  </span>
                </div>
                <div className="budget-metric-value">
                  {formatDuration(metric.value)} / {formatDuration(metric.threshold)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Timing Section */}
      {performanceSummary?.navigation && (
        <div className="performance-section">
          <h3>Navigation Timing</h3>
          <div className="timing-grid">
            <div className="timing-item">
              <span className="timing-label">DNS Lookup</span>
              <span className="timing-value">
                {formatDuration(
                  performanceSummary.navigation.domainLookupEnd -
                    performanceSummary.navigation.domainLookupStart
                )}
              </span>
            </div>
            <div className="timing-item">
              <span className="timing-label">TCP Connection</span>
              <span className="timing-value">
                {formatDuration(
                  performanceSummary.navigation.connectEnd -
                    performanceSummary.navigation.connectStart
                )}
              </span>
            </div>
            <div className="timing-item">
              <span className="timing-label">TTFB</span>
              <span className="timing-value">
                {formatDuration(
                  performanceSummary.navigation.responseStart -
                    performanceSummary.navigation.requestStart
                )}
              </span>
            </div>
            <div className="timing-item">
              <span className="timing-label">Download</span>
              <span className="timing-value">
                {formatDuration(
                  performanceSummary.navigation.responseEnd -
                    performanceSummary.navigation.responseStart
                )}
              </span>
            </div>
            <div className="timing-item">
              <span className="timing-label">DOM Processing</span>
              <span className="timing-value">
                {formatDuration(
                  performanceSummary.navigation.domComplete -
                    performanceSummary.navigation.domInteractive
                )}
              </span>
            </div>
            <div className="timing-item">
              <span className="timing-label">Page Load</span>
              <span className="timing-value">
                {formatDuration(
                  performanceSummary.navigation.loadEventEnd -
                    performanceSummary.navigation.fetchStart
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Resource Timing Section */}
      {performanceSummary && performanceSummary.resource.length > 0 && (
        <div className="performance-section">
          <h3>Resource Loading ({performanceSummary.resource.length} resources)</h3>
          <div className="resource-list">
            {performanceSummary.resource
              .sort((a, b) => b.duration - a.duration)
              .slice(0, 10)
              .map((resource, index) => (
                <div key={index} className="resource-item">
                  <div className="resource-name">
                    {resource.name.split('/').pop() || resource.name}
                  </div>
                  <div className="resource-timing">
                    <span>{formatDuration(resource.duration)}</span>
                    {resource.transferSize > 0 && (
                      <span className="resource-size"> ({formatBytes(resource.transferSize)})</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* API Performance Markers */}
      {apiMarkers.length > 0 && (
        <div className="performance-section">
          <h3>API Request Performance (Top 20)</h3>
          <div className="api-markers-list">
            {apiMarkers.map((marker, index) => (
              <div key={index} className="api-marker-item">
                <div className="api-marker-name">{marker.name}</div>
                <div className="api-marker-duration">{formatDuration(marker.duration)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="performance-section">
        <div className="info-box">
          <h4>About Performance Monitoring</h4>
          <ul>
            <li>
              <strong>Web Vitals:</strong> Core metrics that measure user experience (LCP, CLS, FCP,
              TTFB, INP)
            </li>
            <li>
              <strong>Performance Budgets:</strong> Thresholds to ensure optimal performance
            </li>
            <li>
              <strong>Navigation Timing:</strong> Detailed breakdown of page load phases
            </li>
            <li>
              <strong>Resource Timing:</strong> Performance of individual assets (JS, CSS, images)
            </li>
            <li>
              <strong>API Markers:</strong> Custom performance measurements for API requests
            </li>
          </ul>
          <p className="info-note">
            <strong>How metrics are measured:</strong>
          </p>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
            <li>
              <strong>FCP & TTFB:</strong> Available immediately from Performance API
            </li>
            <li>
              <strong>LCP:</strong> Measured when largest content element loads (may need page
              reload)
            </li>
            <li>
              <strong>CLS:</strong> Measured over time as layout shifts occur (may need page reload)
            </li>
            <li>
              <strong>INP:</strong> Requires user interaction (click/tap/keypress) to measure
            </li>
          </ul>
          <p className="info-note" style={{ marginTop: '1rem' }}>
            <strong>Tip:</strong> Reload the page to capture LCP and CLS metrics. Interact with the
            page (click buttons, scroll) to trigger INP measurements. Enable auto-refresh to see
            updates automatically.
          </p>
        </div>
      </div>
    </div>
  )
}

export default PerformanceMonitoringTab
