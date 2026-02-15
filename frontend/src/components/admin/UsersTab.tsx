import React, { useState, useEffect, useCallback } from 'react'

import { useAuth, useAuthHeaders } from '../../contexts/AuthContext'
import {
  toggleAnonymousMockMode as toggleAnonymousMockModeService,
  type AppSettings,
} from '../../services/adminService'

import { formatDateToCST } from './utils'

interface AdminUser {
  id: number
  email: string
  is_verified: boolean
  is_active: boolean
  role: string
  is_admin: boolean
  subscription_tier: string
  subscription_status: string
  subscription_period: string
  monthly_overage_count: number
  monthly_credits_allocated?: number
  credits_used_this_period?: number
  mock_mode_enabled: boolean
  created_at: string
  updated_at: string
  last_access?: string | null
}

interface AdminUserListResponse {
  users: AdminUser[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

interface UsersTabProps {
  appSettings: AppSettings | null
  fetchStats: () => Promise<void>
  fetchAppSettings: () => Promise<void>
  setError: (err: string | null) => void
}

const UsersTab: React.FC<UsersTabProps> = ({
  appSettings,
  fetchStats,
  fetchAppSettings,
  setError,
}) => {
  const { user, refreshUser } = useAuth()
  const getAuthHeaders = useAuthHeaders()

  const [users, setUsers] = useState<AdminUserListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [creditsReset, setCreditsReset] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [selectedTier, setSelectedTier] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showSelfDeleteModal, setShowSelfDeleteModal] = useState(false)
  const [showTierChangeModal, setShowTierChangeModal] = useState(false)
  const [userToDelete, setUserToDelete] = useState<{ id: number; email: string } | null>(null)
  const [tierChangeData, setTierChangeData] = useState<{
    userId: number
    email: string
    currentTier: string
    newTier: string
  } | null>(null)
  const [createUserData, setCreateUserData] = useState({
    email: '',
    password: '',
    role: 'user',
    subscription_tier: 'free',
    subscription_period: 'monthly',
    is_active: true,
    is_verified: false,
  })
  const [showPassword, setShowPassword] = useState(false)

  const fetchUsersInitial = useCallback(
    async (page = 1) => {
      try {
        const headers = getAuthHeaders()
        const params = new URLSearchParams({ page: page.toString(), per_page: '20' })
        const response = await fetch(`/api/admin/users?${params}`, {
          headers,
          credentials: 'include',
        })
        if (!response.ok) {
          if (response.status === 401)
            throw new Error('Authentication required. Please log in again.')
          if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
          throw new Error(`Failed to fetch users (${response.status})`)
        }
        const data = await response.json()
        setUsers(data)
      } catch (err) {
        console.error('Error fetching users:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch users')
      }
    },
    [getAuthHeaders, setError]
  )

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false)
      return
    }
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        await fetchUsersInitial(currentPage)
      } catch (err) {
        console.error('Error loading users:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentPage, user?.is_admin, fetchUsersInitial, setError])

  useEffect(() => {
    if (appSettings?.is_development) {
      const hasAnonymousUsage =
        (appSettings.anonymous_users_with_usage ?? 0) > 0 ||
        (appSettings.anonymous_db_usage_count ?? 0) > 0
      setCreditsReset(!hasAnonymousUsage)
    }
  }, [appSettings])

  const handleManualSearch = async () => {
    try {
      const headers = getAuthHeaders()
      const params = new URLSearchParams({ page: '1', per_page: '20' })
      if (searchTerm) params.append('search', searchTerm)
      if (selectedRole) params.append('role', selectedRole)
      if (selectedTier) params.append('tier', selectedTier)
      const response = await fetch(`/api/admin/users?${params}`, {
        headers,
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        throw new Error(`Failed to fetch users (${response.status})`)
      }
      const data = await response.json()
      setUsers(data)
      setCurrentPage(1)
    } catch (err) {
      console.error('Error searching users:', err)
      setError(err instanceof Error ? err.message : 'Failed to search users')
    }
  }

  const toggleUserActive = async (userId: number) => {
    try {
      const headers = getAuthHeaders()
      const response = await fetch(`/api/admin/users/${userId}/toggle-active`, {
        method: 'POST',
        headers,
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        throw new Error(`Failed to toggle user status (${response.status})`)
      }
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])
    } catch (err) {
      console.error('Error toggling user status:', err)
      setError(err instanceof Error ? err.message : 'Failed to toggle user status')
    }
  }

  const sendVerification = async (userId: number) => {
    try {
      const headers = getAuthHeaders()
      const response = await fetch(`/api/admin/users/${userId}/send-verification`, {
        method: 'POST',
        headers,
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        throw new Error(`Failed to send verification email (${response.status})`)
      }
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])
    } catch (err) {
      console.error('Error sending verification:', err)
      setError(err instanceof Error ? err.message : 'Failed to send verification email')
    }
  }

  const resetUsage = async (userId: number) => {
    try {
      const headers = getAuthHeaders()
      const response = await fetch(`/api/admin/users/${userId}/reset-usage`, {
        method: 'POST',
        headers,
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        throw new Error(`Failed to reset usage (${response.status})`)
      }
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])
      if (user && userId === user.id) await refreshUser()
    } catch (err) {
      console.error('Error resetting usage:', err)
      setError(err instanceof Error ? err.message : 'Failed to reset usage')
    }
  }

  const toggleAnonymousMockMode = async () => {
    try {
      await toggleAnonymousMockModeService()
      await fetchAppSettings()
    } catch (err) {
      console.error('Error toggling anonymous mock mode:', err)
      setError(err instanceof Error ? err.message : 'Failed to toggle anonymous mock mode')
    }
  }

  const zeroAnonymousUsage = async () => {
    try {
      const headers = getAuthHeaders()
      const response = await fetch('/api/admin/settings/zero-anonymous-usage', {
        method: 'POST',
        headers,
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        throw new Error(`Failed to reset anonymous credits (${response.status})`)
      }
      await response.json()
      setCreditsReset(true)
      window.dispatchEvent(new CustomEvent('anonymousCreditsReset'))
    } catch (err) {
      console.error('Error resetting anonymous credits:', err)
      setError(err instanceof Error ? err.message : 'Failed to reset anonymous credits')
    }
  }

  const toggleMockMode = async (userId: number) => {
    try {
      const headers = getAuthHeaders()
      const response = await fetch(`/api/admin/users/${userId}/toggle-mock-mode`, {
        method: 'POST',
        headers,
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        if (response.status === 400) {
          const errorData = await response.json()
          throw new Error(
            errorData.detail || 'Mock mode can only be enabled for admin/super-admin users'
          )
        }
        throw new Error(`Failed to toggle mock mode (${response.status})`)
      }
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])
      if (user && userId === user.id) await refreshUser()
    } catch (err) {
      console.error('Error toggling mock mode:', err)
      setError(err instanceof Error ? err.message : 'Failed to toggle mock mode')
    }
  }

  const handleTierChangeClick = (
    userId: number,
    email: string,
    currentTier: string,
    newTier: string
  ) => {
    if (currentTier === newTier) return
    setTierChangeData({ userId, email, currentTier, newTier })
    setShowTierChangeModal(true)
  }

  const handleTierChangeCancel = () => {
    setShowTierChangeModal(false)
    setTierChangeData(null)
    fetchUsersInitial(currentPage)
  }

  const handleTierChangeConfirm = async () => {
    if (!tierChangeData) return
    try {
      const headers = getAuthHeaders()
      const response = await fetch(`/api/admin/users/${tierChangeData.userId}/change-tier`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_tier: tierChangeData.newTier }),
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403)
          throw new Error('Access denied. Super admin privileges required.')
        throw new Error(`Failed to change tier (${response.status})`)
      }
      setShowTierChangeModal(false)
      setTierChangeData(null)
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])
      if (user && tierChangeData.userId === user.id) await refreshUser()
    } catch (err) {
      console.error('Error changing tier:', err)
      setError(err instanceof Error ? err.message : 'Failed to change tier')
      setShowTierChangeModal(false)
      setTierChangeData(null)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const headers = getAuthHeaders()
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(createUserData),
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json()
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        if (response.status === 400) throw new Error(errorData.detail || 'Invalid user data')
        throw new Error(`Failed to create user (${response.status})`)
      }
      setCreateUserData({
        email: '',
        password: '',
        role: 'user',
        subscription_tier: 'free',
        subscription_period: 'monthly',
        is_active: true,
        is_verified: false,
      })
      setShowPassword(false)
      setShowCreateModal(false)
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err instanceof Error ? err.message : 'Failed to create user')
    }
  }

  const handleDeleteClick = (userId: number, email: string) => {
    if (user && user.id === userId) {
      setUserToDelete({ id: userId, email })
      setShowSelfDeleteModal(true)
    } else {
      setUserToDelete({ id: userId, email })
      setShowDeleteModal(true)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return
    try {
      const headers = getAuthHeaders()
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403)
          throw new Error('Access denied. Super Admin privileges required to delete users.')
        if (response.status === 400) throw new Error(errorData.detail || 'Cannot delete user')
        if (response.status === 404) throw new Error('User not found')
        throw new Error(`Failed to delete user (${response.status})`)
      }
      setShowDeleteModal(false)
      setUserToDelete(null)
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])
    } catch (err) {
      console.error('Error deleting user:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete user')
      setShowDeleteModal(false)
      setUserToDelete(null)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteModal(false)
    setUserToDelete(null)
  }

  const handleSelfDeleteCancel = () => {
    setShowSelfDeleteModal(false)
    setUserToDelete(null)
  }

  if (loading) {
    return <div className="loading-message">Loading users...</div>
  }

  return (
    <>
      {appSettings?.is_development && (
        <div className="admin-stats" style={{ marginBottom: '2rem' }}>
          <h2>Unregistered Users (Development Mode Only)</h2>
          <div className="stats-grid">
            <div className="stat-card anonymous-settings-card-wrapper">
              <div className="anonymous-settings-container">
                <div className="anonymous-settings-section">
                  <h3
                    style={{
                      marginBottom: '0.25rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    Unregistered Tier Mock Mode
                  </h3>
                  <button
                    onClick={toggleAnonymousMockMode}
                    className={`mock-mode-btn ${appSettings.anonymous_mock_mode_enabled ? 'enabled' : 'disabled'}`}
                    title={`Unregistered mock mode is ${appSettings.anonymous_mock_mode_enabled ? 'enabled' : 'disabled'}`}
                  >
                    🎭 Anonymous Mock {appSettings.anonymous_mock_mode_enabled ? 'ON' : 'OFF'}
                  </button>
                  <p
                    style={{
                      marginTop: '0.25rem',
                      fontSize: '0.9rem',
                      color: '#666',
                      textAlign: 'center',
                      minHeight: '2.5rem',
                    }}
                  >
                    {appSettings.anonymous_mock_mode_enabled
                      ? 'Unregistered users will receive mock responses'
                      : 'Unregistered users will use real API calls'}
                  </p>
                </div>
                <div className="anonymous-settings-section">
                  <h3
                    style={{
                      marginBottom: '0.25rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    Anonymous Credit Reset
                  </h3>
                  <button
                    onClick={zeroAnonymousUsage}
                    className={`mock-mode-btn zero-usage-btn ${creditsReset ? 'credits-reset-green' : ''}`}
                    title="Reset all unregistered user credits to maximum (50 credits)"
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
                    {creditsReset ? 'Credits Reset' : 'Reset Anonymous Credits'}
                  </button>
                  <p
                    style={{
                      marginTop: '0.25rem',
                      fontSize: '0.9rem',
                      color: '#666',
                      textAlign: 'center',
                      minHeight: '2.5rem',
                    }}
                  >
                    {creditsReset
                      ? 'All unregistered user credits have been reset to maximum'
                      : 'Resets all unregistered user credits to 50'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="user-management">
        <div className="user-management-header">
          <h2>User Management</h2>
          <button className="create-user-btn" onClick={() => setShowCreateModal(true)}>
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
              <path d="M5 12h14M12 5v14" />
            </svg>
            Create User
          </button>
        </div>

        <div className="search-form">
          <div className="search-controls">
            <input
              type="text"
              placeholder="Search by email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="filter-select"
            >
              <option value="">All Roles</option>
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <select
              value={selectedTier}
              onChange={e => setSelectedTier(e.target.value)}
              className="filter-select"
            >
              <option value="">All Tiers</option>
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="starter_plus">Starter+</option>
              <option value="pro">Pro</option>
              <option value="pro_plus">Pro+</option>
            </select>
            <button type="button" className="search-btn" onClick={handleManualSearch}>
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
              Search
            </button>
          </div>
        </div>

        {users && (
          <>
            <div className="users-table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Tier</th>
                    <th>Status</th>
                    <th>Verified</th>
                    <th>Credits</th>
                    <th>Created</th>
                    <th>Last Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.users.map(userRow => (
                    <tr key={userRow.id}>
                      <td>{userRow.email}</td>
                      <td>
                        <span className={`role-badge role-${userRow.role}`}>{userRow.role}</span>
                      </td>
                      <td>
                        {user?.role === 'super_admin' ? (
                          <select
                            value={userRow.subscription_tier}
                            onChange={e =>
                              handleTierChangeClick(
                                userRow.id,
                                userRow.email,
                                userRow.subscription_tier,
                                e.target.value
                              )
                            }
                            className="tier-select"
                            title="Change subscription tier (Super Admin only)"
                          >
                            <option value="free">Free</option>
                            <option value="starter">Starter</option>
                            <option value="starter_plus">Starter+</option>
                            <option value="pro">Pro</option>
                            <option value="pro_plus">Pro+</option>
                          </select>
                        ) : (
                          <span className={`tier-badge tier-${userRow.subscription_tier}`}>
                            {userRow.subscription_tier}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${userRow.is_active ? 'active' : 'inactive'}`}
                        >
                          {userRow.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`verified-badge ${userRow.is_verified ? 'verified' : 'unverified'}`}
                        >
                          {userRow.is_verified ? (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="usage-info">
                          <span className="usage-count">
                            {userRow.credits_used_this_period || 0}/
                            {userRow.monthly_credits_allocated || 0}
                          </span>
                          {userRow.monthly_overage_count > 0 && (
                            <span className="overage-count">
                              {userRow.monthly_overage_count} overages
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span title={new Date(userRow.created_at).toLocaleString()}>
                          {(() => {
                            const date = new Date(userRow.created_at)
                            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
                          })()}
                        </span>
                      </td>
                      <td>
                        {userRow.last_access ? (
                          <span title={formatDateToCST(userRow.last_access)}>
                            {formatDateToCST(userRow.last_access)}
                          </span>
                        ) : (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>Never</span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => toggleUserActive(userRow.id)}
                            className={`toggle-btn ${userRow.is_active ? 'deactivate' : 'activate'}`}
                          >
                            {userRow.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          {!userRow.is_verified && (
                            <button
                              onClick={() => sendVerification(userRow.id)}
                              className="verify-btn"
                            >
                              Send Verification
                            </button>
                          )}
                          {(userRow.credits_used_this_period || 0) > 0 && (
                            <button
                              onClick={() => resetUsage(userRow.id)}
                              className="reset-usage-btn"
                              title="Reset credits to maximum for user's tier"
                            >
                              Zero Usage
                            </button>
                          )}
                          {(import.meta.env.DEV ||
                            userRow.role === 'admin' ||
                            userRow.role === 'super_admin') && (
                            <button
                              onClick={() => toggleMockMode(userRow.id)}
                              className={`mock-mode-btn ${userRow.mock_mode_enabled ? 'enabled' : 'disabled'}`}
                              title={`Mock mode is ${userRow.mock_mode_enabled ? 'enabled' : 'disabled'}`}
                            >
                              {userRow.mock_mode_enabled ? 'Mock ON' : 'Mock OFF'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteClick(userRow.id, userRow.email)}
                            className="delete-btn"
                            title="Delete user (Super Admin only)"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="users-cards-mobile">
              {users.users.map(userRow => (
                <div key={userRow.id} className="user-card">
                  <div className="user-card-email">{userRow.email}</div>
                  <div className="user-card-badges">
                    <span className={`role-badge role-${userRow.role}`}>{userRow.role}</span>
                    {user?.role === 'super_admin' ? (
                      <select
                        value={userRow.subscription_tier}
                        onChange={e =>
                          handleTierChangeClick(
                            userRow.id,
                            userRow.email,
                            userRow.subscription_tier,
                            e.target.value
                          )
                        }
                        className="tier-select"
                        title="Change subscription tier (Super Admin only)"
                      >
                        <option value="free">Free</option>
                        <option value="starter">Starter</option>
                        <option value="starter_plus">Starter+</option>
                        <option value="pro">Pro</option>
                        <option value="pro_plus">Pro+</option>
                      </select>
                    ) : (
                      <span className={`tier-badge tier-${userRow.subscription_tier}`}>
                        {userRow.subscription_tier}
                      </span>
                    )}
                  </div>
                  <div className="user-card-row">
                    <span className="user-card-label">Status</span>
                    <span className="user-card-value">
                      <span className={`status-badge ${userRow.is_active ? 'active' : 'inactive'}`}>
                        {userRow.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </span>
                  </div>
                  <div className="user-card-row">
                    <span className="user-card-label">Verified</span>
                    <span className="user-card-value">
                      <span
                        className={`verified-badge ${userRow.is_verified ? 'verified' : 'unverified'}`}
                      >
                        {userRow.is_verified ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                      </span>
                    </span>
                  </div>
                  <div className="user-card-row">
                    <span className="user-card-label">Credits</span>
                    <span className="user-card-value">
                      <div className="usage-info">
                        <span className="usage-count">
                          {userRow.credits_used_this_period || 0}/
                          {userRow.monthly_credits_allocated || 0}
                        </span>
                        {userRow.monthly_overage_count > 0 && (
                          <span className="overage-count">
                            {userRow.monthly_overage_count} overages
                          </span>
                        )}
                      </div>
                    </span>
                  </div>
                  <div className="user-card-row">
                    <span className="user-card-label">Created</span>
                    <span
                      className="user-card-value"
                      title={new Date(userRow.created_at).toLocaleString()}
                    >
                      {(() => {
                        const date = new Date(userRow.created_at)
                        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
                      })()}
                    </span>
                  </div>
                  <div className="user-card-row">
                    <span className="user-card-label">Last Access</span>
                    <span
                      className="user-card-value"
                      title={userRow.last_access ? formatDateToCST(userRow.last_access) : 'Never'}
                    >
                      {userRow.last_access ? (
                        formatDateToCST(userRow.last_access)
                      ) : (
                        <span style={{ color: '#999', fontStyle: 'italic' }}>Never</span>
                      )}
                    </span>
                  </div>
                  <div className="user-card-actions">
                    <div className="action-buttons">
                      <button
                        onClick={() => toggleUserActive(userRow.id)}
                        className={`toggle-btn ${userRow.is_active ? 'deactivate' : 'activate'}`}
                      >
                        {userRow.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {!userRow.is_verified && (
                        <button onClick={() => sendVerification(userRow.id)} className="verify-btn">
                          Send Verification
                        </button>
                      )}
                      {(userRow.credits_used_this_period || 0) > 0 && (
                        <button
                          onClick={() => resetUsage(userRow.id)}
                          className="reset-usage-btn"
                          title="Reset credits to maximum for user's tier"
                        >
                          Zero Usage
                        </button>
                      )}
                      {(import.meta.env.DEV ||
                        userRow.role === 'admin' ||
                        userRow.role === 'super_admin') && (
                        <button
                          onClick={() => toggleMockMode(userRow.id)}
                          className={`mock-mode-btn ${userRow.mock_mode_enabled ? 'enabled' : 'disabled'}`}
                          title={`Mock mode is ${userRow.mock_mode_enabled ? 'enabled' : 'disabled'}`}
                        >
                          {userRow.mock_mode_enabled ? 'Mock ON' : 'Mock OFF'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteClick(userRow.id, userRow.email)}
                        className="delete-btn"
                        title="Delete user (Super Admin only)"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {users.total_pages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="page-btn"
                >
                  Previous
                </button>
                <span className="page-info">
                  Page {currentPage} of {users.total_pages}
                </span>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === users.total_pages}
                  className="page-btn"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showDeleteModal && userToDelete && (
        <div className="modal-overlay" onClick={handleDeleteCancel}>
          <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    display: 'inline-block',
                    verticalAlign: 'middle',
                    marginRight: '0.5rem',
                  }}
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                Confirm Delete
              </h2>
              <button className="modal-close-btn" onClick={handleDeleteCancel} aria-label="Close">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="delete-modal-body">
              <p className="warning-text">
                Are you sure you want to delete this user? This action cannot be undone.
              </p>
              <div className="user-to-delete">
                <strong>Email:</strong> {userToDelete.email}
              </div>
              <p className="delete-note">
                <strong>Note:</strong> Only Super Admins can delete users. All user data, history,
                and associations will be permanently removed.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={handleDeleteCancel}>
                Cancel
              </button>
              <button type="button" className="delete-confirm-btn" onClick={handleDeleteConfirm}>
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {showSelfDeleteModal && userToDelete && (
        <div className="modal-overlay" onClick={handleSelfDeleteCancel}>
          <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    display: 'inline-block',
                    verticalAlign: 'middle',
                    marginRight: '0.5rem',
                  }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Cannot Delete Self
              </h2>
              <button
                className="modal-close-btn"
                onClick={handleSelfDeleteCancel}
                aria-label="Close"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="delete-modal-body">
              <p className="warning-text">
                You cannot delete your own account. This action is not allowed for security reasons.
              </p>
              <div className="user-to-delete">
                <strong>Email:</strong> {userToDelete.email}
              </div>
              <p className="delete-note">
                <strong>Note:</strong> Super Admins cannot delete themselves. If you need to delete
                your account, please contact another Super Admin or use the account deletion feature
                in your profile settings.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={handleSelfDeleteCancel}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showTierChangeModal && tierChangeData && (
        <div className="modal-overlay" onClick={handleTierChangeCancel}>
          <div className="modal-content tier-change-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    display: 'inline-block',
                    verticalAlign: 'middle',
                    marginRight: '0.5rem',
                  }}
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                Confirm Tier Change
              </h2>
              <button
                className="modal-close-btn"
                onClick={handleTierChangeCancel}
                aria-label="Close"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="tier-change-modal-body">
              <p className="warning-text">
                You are about to change the subscription tier for this user. Please review the
                details below and confirm.
              </p>
              <div className="tier-change-details">
                <div className="tier-change-row">
                  <strong>User:</strong> {tierChangeData.email}
                </div>
                <div className="tier-change-row">
                  <strong>Current Tier:</strong>{' '}
                  <span className={`tier-badge tier-${tierChangeData.currentTier}`}>
                    {tierChangeData.currentTier}
                  </span>
                </div>
                <div className="tier-change-row">
                  <strong>New Tier:</strong>{' '}
                  <span className={`tier-badge tier-${tierChangeData.newTier}`}>
                    {tierChangeData.newTier}
                  </span>
                </div>
              </div>
              <p className="tier-change-note">
                <strong>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      display: 'inline-block',
                      verticalAlign: 'middle',
                      marginRight: '0.25rem',
                    }}
                  >
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                  Warning:
                </strong>{' '}
                This will immediately change the user's subscription tier and may affect their
                access limits, features, and billing. This action will be logged in the admin audit
                trail.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={handleTierChangeCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="tier-change-confirm-btn"
                onClick={handleTierChangeConfirm}
              >
                Confirm Tier Change
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowCreateModal(false)
            setShowPassword(false)
          }}
        >
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New User</h2>
              <button
                className="modal-close-btn"
                onClick={() => {
                  setShowCreateModal(false)
                  setShowPassword(false)
                }}
                aria-label="Close"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="create-user-form">
              <div className="form-group">
                <label htmlFor="email">Email Address *</label>
                <input
                  id="email"
                  type="email"
                  value={createUserData.email}
                  onChange={e => setCreateUserData({ ...createUserData, email: e.target.value })}
                  required
                  placeholder="user@example.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <div className="password-input-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={createUserData.password}
                    onChange={e =>
                      setCreateUserData({ ...createUserData, password: e.target.value })
                    }
                    required
                    minLength={8}
                    placeholder="Min 8 chars, uppercase, number, special char"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
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
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
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
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <small className="form-hint">
                  Must be at least 8 characters with uppercase, lowercase, numbers, and special
                  characters (!@#$%^&*()_+-=[]&#123;&#125;;':\"|,.&lt;&gt;/?)
                </small>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="role">Role *</label>
                  <select
                    id="role"
                    value={createUserData.role}
                    onChange={e => setCreateUserData({ ...createUserData, role: e.target.value })}
                    required
                  >
                    <option value="user">User</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="subscription_tier">Subscription Tier *</label>
                  <select
                    id="subscription_tier"
                    value={createUserData.subscription_tier}
                    onChange={e =>
                      setCreateUserData({ ...createUserData, subscription_tier: e.target.value })
                    }
                    required
                  >
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="starter_plus">Starter+</option>
                    <option value="pro">Pro</option>
                    <option value="pro_plus">Pro+</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="subscription_period">Subscription Period *</label>
                  <select
                    id="subscription_period"
                    value={createUserData.subscription_period}
                    onChange={e =>
                      setCreateUserData({ ...createUserData, subscription_period: e.target.value })
                    }
                    required
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={createUserData.is_active}
                      onChange={e =>
                        setCreateUserData({ ...createUserData, is_active: e.target.checked })
                      }
                    />
                    <span>Active Account</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={createUserData.is_verified}
                      onChange={e =>
                        setCreateUserData({ ...createUserData, is_verified: e.target.checked })
                      }
                    />
                    <span>Email Verified</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => {
                    setShowCreateModal(false)
                    setShowPassword(false)
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default UsersTab
