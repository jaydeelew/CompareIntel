import React, { useState, useEffect, useCallback } from 'react'

import { useAuthHeaders } from '../../contexts/AuthContext'

interface VisitorAnalytics {
  total_unique_visitors: number
  total_unique_devices: number
  total_comparisons: number
  unique_visitors_today: number
  unique_visitors_this_week: number
  unique_visitors_this_month: number
  authenticated_visitors: number
  anonymous_visitors: number
  daily_breakdown: Array<{
    date: string
    unique_visitors: number
    total_comparisons: number
  }>
  comparisons_today: number
  comparisons_this_week: number
  comparisons_this_month: number
}

const VisitorAnalyticsTab: React.FC = () => {
  const getAuthHeaders = useAuthHeaders()
  const [visitorAnalytics, setVisitorAnalytics] = useState<VisitorAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const fetchVisitorAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true)
      const headers = getAuthHeaders()
      const response = await fetch('/api/admin/analytics/visitors', {
        headers,
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        throw new Error(`Failed to fetch visitor analytics (${response.status})`)
      }
      const data = await response.json()
      setVisitorAnalytics(data)
    } catch (err) {
      console.error('Error fetching visitor analytics:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    fetchVisitorAnalytics()
  }, [fetchVisitorAnalytics])

  return (
    <div className="analytics-management">
      <div className="analytics-management-header">
        <h2>Visitor Analytics</h2>
        <button
          className="refresh-analytics-btn"
          onClick={fetchVisitorAnalytics}
          disabled={analyticsLoading}
        >
          {analyticsLoading ? (
            <>
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
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Loading...
            </>
          ) : (
            <>
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
              Refresh
            </>
          )}
        </button>
      </div>

      {analyticsLoading && !visitorAnalytics && (
        <div className="loading-message">
          <p>Loading visitor analytics...</p>
        </div>
      )}

      {visitorAnalytics && (
        <>
          <div className="analytics-stats-grid">
            <div className="analytics-stat-card primary">
              <h3>Total Unique Visitors</h3>
              <p className="analytics-stat-number">
                {visitorAnalytics.total_unique_visitors.toLocaleString()}
              </p>
              <p className="analytics-stat-label">Unique IP addresses (all time)</p>
            </div>
            <div className="analytics-stat-card">
              <h3>Total Unique Devices</h3>
              <p className="analytics-stat-number">
                {visitorAnalytics.total_unique_devices.toLocaleString()}
              </p>
              <p className="analytics-stat-label">Browser fingerprints</p>
            </div>
            <div className="analytics-stat-card">
              <h3>Total Comparisons</h3>
              <p className="analytics-stat-number">
                {visitorAnalytics.total_comparisons.toLocaleString()}
              </p>
              <p className="analytics-stat-label">All time usage</p>
            </div>
          </div>

          <div className="analytics-time-stats">
            <h3>Recent Activity</h3>
            <div className="analytics-stats-grid">
              <div className="analytics-stat-card">
                <h4>Today</h4>
                <p className="analytics-stat-number">
                  {visitorAnalytics.unique_visitors_today.toLocaleString()}
                </p>
                <p className="analytics-stat-label">Unique Visitors</p>
                <p className="analytics-stat-sub">
                  {visitorAnalytics.comparisons_today.toLocaleString()} comparisons
                </p>
              </div>
              <div className="analytics-stat-card">
                <h4>This Week</h4>
                <p className="analytics-stat-number">
                  {visitorAnalytics.unique_visitors_this_week.toLocaleString()}
                </p>
                <p className="analytics-stat-label">Unique Visitors</p>
                <p className="analytics-stat-sub">
                  {visitorAnalytics.comparisons_this_week.toLocaleString()} comparisons
                </p>
              </div>
              <div className="analytics-stat-card">
                <h4>This Month</h4>
                <p className="analytics-stat-number">
                  {visitorAnalytics.unique_visitors_this_month.toLocaleString()}
                </p>
                <p className="analytics-stat-label">Unique Visitors</p>
                <p className="analytics-stat-sub">
                  {visitorAnalytics.comparisons_this_month.toLocaleString()} comparisons
                </p>
              </div>
            </div>
          </div>

          <div className="analytics-breakdown">
            <h3>Visitor Type Breakdown</h3>
            <div className="analytics-stats-grid">
              <div className="analytics-stat-card success">
                <h4>Authenticated</h4>
                <p className="analytics-stat-number">
                  {visitorAnalytics.authenticated_visitors.toLocaleString()}
                </p>
                <p className="analytics-stat-label">Registered users</p>
              </div>
              <div className="analytics-stat-card warning">
                <h4>Anonymous</h4>
                <p className="analytics-stat-number">
                  {visitorAnalytics.anonymous_visitors.toLocaleString()}
                </p>
                <p className="analytics-stat-label">Guest visitors</p>
              </div>
            </div>
          </div>

          <div className="analytics-daily-breakdown">
            <h3>Daily Breakdown (Last 30 Days)</h3>
            <div className="daily-chart-container">
              <div className="daily-chart">
                {visitorAnalytics.daily_breakdown.map((day, index) => {
                  const maxVisitors = Math.max(
                    ...visitorAnalytics.daily_breakdown.map(d => d.unique_visitors),
                    1
                  )
                  const barHeight = maxVisitors > 0 ? (day.unique_visitors / maxVisitors) * 100 : 0
                  const date = new Date(day.date)
                  const isToday = date.toDateString() === new Date().toDateString()
                  return (
                    <div key={index} className="daily-chart-bar-container">
                      <div className="daily-chart-bar-wrapper">
                        <div
                          className={`daily-chart-bar ${isToday ? 'today' : ''}`}
                          style={{ height: `${barHeight}%` }}
                          title={`${day.date}: ${day.unique_visitors} visitors, ${day.total_comparisons} comparisons`}
                        >
                          <span className="daily-chart-value">{day.unique_visitors}</span>
                        </div>
                      </div>
                      <div className="daily-chart-label">
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="daily-chart-legend">
              <div className="legend-item">
                <span className="legend-color today"></span>
                <span>Today</span>
              </div>
              <div className="legend-item">
                <span className="legend-color"></span>
                <span>Previous days</span>
              </div>
            </div>
          </div>

          <div className="analytics-table-section">
            <h3>Daily Details</h3>
            <div className="analytics-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>
                      <span className="header-text-desktop">Date</span>
                      <span className="header-text-mobile">Date</span>
                    </th>
                    <th className="number-header">
                      <span className="header-text-desktop">Unique Visitors</span>
                      <span className="header-text-mobile">Visitors</span>
                    </th>
                    <th className="number-header">
                      <span className="header-text-desktop">Comparisons</span>
                      <span className="header-text-mobile">Comps</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visitorAnalytics.daily_breakdown
                    .slice()
                    .reverse()
                    .map((day, index) => {
                      const date = new Date(day.date)
                      const isToday = date.toDateString() === new Date().toDateString()
                      return (
                        <tr key={index} className={isToday ? 'today-row' : ''}>
                          <td>
                            {date.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {isToday && <span className="today-badge">Today</span>}
                          </td>
                          <td className="number-cell">{day.unique_visitors.toLocaleString()}</td>
                          <td className="number-cell">{day.total_comparisons.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default VisitorAnalyticsTab
