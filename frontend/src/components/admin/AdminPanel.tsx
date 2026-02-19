import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { BREAKPOINT_MOBILE } from '../../config/constants'
import { useAuth, useAuthHeaders } from '../../contexts/AuthContext'
import { getAppSettings, type AppSettings } from '../../services/adminService'
import logger from '../../utils/logger'
import { LoadingSpinner } from '../shared'

import ActionLogsTab from './ActionLogsTab'
import ModelsTab from './ModelsTab'
import PerformanceMonitoringTab from './PerformanceMonitoringTab'
import SearchProvidersTab from './SearchProvidersTab'
import UsersTab from './UsersTab'
import { formatName } from './utils'
import VisitorAnalyticsTab from './VisitorAnalyticsTab'
import './AdminPanel.css'

interface AdminStats {
  total_users: number
  active_users: number
  verified_users: number
  users_by_tier: { [key: string]: number }
  users_by_role: { [key: string]: number }
  recent_registrations: number
  total_usage_today: number
  admin_actions_today: number
}

interface AdminPanelProps {
  onClose?: () => void
}

type AdminTab = 'users' | 'models' | 'logs' | 'analytics' | 'search-providers' | 'performance'

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const { user, logout } = useAuth()
  const getAuthHeaders = useAuthHeaders()
  const location = useLocation()
  const navigate = useNavigate()

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelTabBusy, setModelTabBusy] = useState(false)
  const adminPanelRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef<number>(0)

  const getInitialTab = (): AdminTab => {
    if (typeof window !== 'undefined') {
      const savedTab = sessionStorage.getItem('adminPanel_activeTab')
      if (
        savedTab &&
        ['users', 'models', 'logs', 'analytics', 'search-providers', 'performance'].includes(
          savedTab
        )
      ) {
        return savedTab as AdminTab
      }
    }
    return 'users'
  }
  const [activeTab, setActiveTab] = useState<AdminTab>(getInitialTab)

  const [breakdownCollapsed, setBreakdownCollapsed] = useState<{ [key: string]: boolean }>(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= BREAKPOINT_MOBILE) {
      return { tier: true, role: true }
    }
    return { tier: false, role: false }
  })

  const toggleBreakdown = (section: 'tier' | 'role') => {
    setBreakdownCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth <= BREAKPOINT_MOBILE
      setBreakdownCollapsed(prev => ({
        tier: isMobile ? prev.tier : false,
        role: isMobile ? prev.role : false,
      }))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('adminPanel_activeTab', activeTab)
    }
  }, [activeTab])

  const saveScrollPosition = () => {
    if (typeof window !== 'undefined' && adminPanelRef.current) {
      scrollPositionRef.current = adminPanelRef.current.scrollTop
      sessionStorage.setItem('adminPanel_scrollPosition', String(scrollPositionRef.current))
    }
  }

  const restoreScrollPosition = () => {
    if (typeof window !== 'undefined' && adminPanelRef.current) {
      const savedScroll = sessionStorage.getItem('adminPanel_scrollPosition')
      if (savedScroll) {
        const scrollPos = parseInt(savedScroll, 10)
        requestAnimationFrame(() => {
          if (adminPanelRef.current) {
            adminPanelRef.current.scrollTop = scrollPos
          }
        })
      }
    }
  }

  useEffect(() => {
    const panel = adminPanelRef.current
    if (!panel) return
    const handleScroll = () => {
      scrollPositionRef.current = panel.scrollTop
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('adminPanel_scrollPosition', String(panel.scrollTop))
      }
    }
    panel.addEventListener('scroll', handleScroll, { passive: true })
    return () => panel.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (location.pathname !== '/admin' && user?.is_admin && !modelTabBusy) {
      navigate('/admin', { replace: true })
    }
  }, [location.pathname, user?.is_admin, modelTabBusy, navigate])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTab = sessionStorage.getItem('adminPanel_activeTab')
      if (
        savedTab &&
        ['users', 'models', 'logs', 'analytics', 'search-providers', 'performance'].includes(
          savedTab
        )
      ) {
        setActiveTab(savedTab as AdminTab)
      }
      setTimeout(() => restoreScrollPosition(), 100)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const headers = getAuthHeaders()
      const response = await fetch('/api/admin/stats', { headers, credentials: 'include' })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        throw new Error(`Failed to fetch admin stats (${response.status})`)
      }
      const data = await response.json()
      setStats(data)
    } catch (err) {
      logger.error('Error fetching admin stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch stats')
    }
  }, [getAuthHeaders])

  const fetchAppSettings = useCallback(async () => {
    try {
      const data = await getAppSettings()
      setAppSettings(data)
    } catch (err) {
      logger.error('Error fetching app settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch app settings')
    }
  }, [])

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false)
      return
    }
    const load = async () => {
      setLoading(true)
      setError(null)
      const ADMIN_LOAD_TIMEOUT_MS = 20000
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), ADMIN_LOAD_TIMEOUT_MS)
        )
        await Promise.race([Promise.all([fetchStats(), fetchAppSettings()]), timeoutPromise])
      } catch (err) {
        logger.error('Error loading admin data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load admin data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.is_admin, fetchStats, fetchAppSettings])

  const tabDisabled = modelTabBusy

  if (!user?.is_admin) {
    return (
      <div className="admin-panel">
        <div className="error-message">
          <h2>Access Denied</h2>
          <p>You need admin privileges to access this panel.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="admin-panel admin-panel-loading" data-testid="admin-panel">
        <div className="admin-loading-center">
          <LoadingSpinner size="xlarge" modern={true} message="Loading admin panel..." />
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel" data-testid="admin-panel" ref={adminPanelRef}>
      <div className="admin-header">
        <div className="admin-header-content">
          {onClose && (
            <button className="back-button" onClick={onClose} title="Back to Main App">
              ↪
            </button>
          )}
          <div className="admin-title-section">
            <h1>Admin Panel</h1>
            <p>Manage users and monitor system activity</p>
          </div>
          <button
            className="sign-out-button"
            onClick={logout}
            title="Sign Out"
            aria-label="Sign Out"
          >
            Sign Out
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {stats && (
        <div className="admin-stats">
          <h2>System Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Users</h3>
              <p className="stat-number">{stats.total_users}</p>
            </div>
            <div className="stat-card">
              <h3>Active Users</h3>
              <p className="stat-number">{stats.active_users}</p>
            </div>
            <div className="stat-card">
              <h3>Verified Users</h3>
              <p className="stat-number">{stats.verified_users}</p>
            </div>
            <div className="stat-card">
              <h3>Recent Registrations</h3>
              <p className="stat-number">{stats.recent_registrations}</p>
              <p className="stat-label">Last 7 days</p>
            </div>
          </div>
          <div className="stats-breakdown">
            <div className="breakdown-section">
              <button
                className="breakdown-toggle"
                onClick={() => toggleBreakdown('tier')}
                aria-expanded={!breakdownCollapsed.tier}
              >
                <h3>Users by Subscription Tier</h3>
                <svg
                  className={`breakdown-chevron ${!breakdownCollapsed.tier ? 'expanded' : ''}`}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div
                className={`breakdown-list ${breakdownCollapsed.tier ? 'collapsed' : 'expanded'}`}
              >
                {Object.entries(stats.users_by_tier).map(([tier, count]) => (
                  <div key={tier} className="breakdown-item">
                    <span className="tier-name">{formatName(tier)}</span>
                    <span className="tier-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="breakdown-section">
              <button
                className="breakdown-toggle"
                onClick={() => toggleBreakdown('role')}
                aria-expanded={!breakdownCollapsed.role}
              >
                <h3>Users by Role</h3>
                <svg
                  className={`breakdown-chevron ${!breakdownCollapsed.role ? 'expanded' : ''}`}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div
                className={`breakdown-list ${breakdownCollapsed.role ? 'collapsed' : 'expanded'}`}
              >
                {Object.entries(stats.users_by_role).map(([role, count]) => (
                  <div key={role} className="breakdown-item">
                    <span className="role-name">{formatName(role)}</span>
                    <span className="role-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => !tabDisabled && setActiveTab('users')}
          disabled={tabDisabled}
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Users
        </button>
        <button
          className={`admin-tab ${activeTab === 'models' ? 'active' : ''}`}
          onClick={() => setActiveTab('models')}
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
            <path d="M12 2v20M2 12h20" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          Models
        </button>
        <button
          className={`admin-tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => !tabDisabled && setActiveTab('logs')}
          disabled={tabDisabled}
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          Action Logs
        </button>
        <button
          className={`admin-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => !tabDisabled && setActiveTab('analytics')}
          disabled={tabDisabled}
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
            <path d="M3 3v18h18M7 16l4-4 4 4 6-6" />
            <path d="M7 10h.01M11 7h.01M15 4h.01" />
          </svg>
          <span className="admin-tab-text-desktop">Visitor Analytics</span>
          <span className="admin-tab-text-mobile">Analytics</span>
        </button>
        <button
          className={`admin-tab ${activeTab === 'search-providers' ? 'active' : ''}`}
          onClick={() => !tabDisabled && setActiveTab('search-providers')}
          disabled={tabDisabled}
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
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          Search Providers
        </button>
        <button
          className={`admin-tab ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => !tabDisabled && setActiveTab('performance')}
          disabled={tabDisabled}
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
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          Performance
        </button>
      </div>

      {activeTab === 'performance' && <PerformanceMonitoringTab />}
      {activeTab === 'models' && (
        <ModelsTab
          saveScrollPosition={saveScrollPosition}
          restoreScrollPosition={restoreScrollPosition}
          onBusyChange={setModelTabBusy}
        />
      )}
      {activeTab === 'logs' && <ActionLogsTab setError={setError} />}
      {activeTab === 'analytics' && <VisitorAnalyticsTab />}
      {activeTab === 'search-providers' && <SearchProvidersTab setError={setError} />}
      {activeTab === 'users' && (
        <UsersTab
          appSettings={appSettings}
          fetchStats={fetchStats}
          fetchAppSettings={fetchAppSettings}
          setError={setError}
        />
      )}
    </div>
  )
}

export default AdminPanel
