import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuth, useAuthHeaders } from '../../contexts/AuthContext'
import {
  getAppSettings,
  toggleAnonymousMockMode as toggleAnonymousMockModeService,
  type AppSettings,
  getSearchProviders,
  setActiveSearchProvider,
  testSearchProvider,
  testSearchProviderWithQuery,
  type SearchProvidersResponse,
  type SearchProviderTestResult,
} from '../../services/adminService'
import type { AvailableModelsResponse } from '../../services/modelsService'
import type { Model } from '../../types/models'
import { LoadingSpinner } from '../shared/LoadingSpinner'
import './AdminPanel.css'

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
}

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

interface AdminUserListResponse {
  users: AdminUser[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

interface AdminActionLog {
  id: number
  admin_user_id: number
  admin_user_email: string | null
  target_user_id: number | null
  target_user_email: string | null
  action_type: string
  action_description: string
  details: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

interface AdminPanelProps {
  onClose?: () => void
}

type AdminTab = 'users' | 'models' | 'logs' | 'analytics' | 'search-providers'

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const { user, refreshUser, logout } = useAuth()
  const getAuthHeaders = useAuthHeaders()
  const location = useLocation()
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const isDevelopment = import.meta.env.DEV
  // Persist activeTab in sessionStorage to survive remounts
  const getInitialTab = (): AdminTab => {
    if (typeof window !== 'undefined') {
      const savedTab = sessionStorage.getItem('adminPanel_activeTab')
      if (
        savedTab &&
        ['users', 'models', 'logs', 'analytics', 'search-providers'].includes(savedTab)
      ) {
        return savedTab as AdminTab
      }
    }
    return 'users'
  }
  const [activeTab, setActiveTab] = useState<AdminTab>(getInitialTab)
  // State for collapsed breakdown sections on mobile
  const [breakdownCollapsed, setBreakdownCollapsed] = useState<{ [key: string]: boolean }>(() => {
    // Start collapsed on mobile by default
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      return { tier: true, role: true }
    }
    return { tier: false, role: false }
  })
  // Toggle breakdown section collapse state
  const toggleBreakdown = (section: 'tier' | 'role') => {
    setBreakdownCollapsed(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }
  // Keep track of whether we're in a model operation to prevent tab changes
  const isModelOperationRef = useRef(false)
  // Ref to track scroll position
  const scrollPositionRef = useRef<number>(0)
  const adminPanelRef = useRef<HTMLDivElement>(null)
  // Ref to store AbortController for canceling model addition
  const addModelAbortControllerRef = useRef<AbortController | null>(null)
  // Ref to store reader for canceling stream reading
  const addModelReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  // Update collapsed state when window is resized
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth <= 768
      setBreakdownCollapsed(prev => ({
        tier: isMobile ? prev.tier : false,
        role: isMobile ? prev.role : false,
      }))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Save activeTab to sessionStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('adminPanel_activeTab', activeTab)
    }
  }, [activeTab])

  // Save scroll position before operations and restore after
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
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (adminPanelRef.current) {
            adminPanelRef.current.scrollTop = scrollPos
          }
        })
      }
    }
  }

  // Helper to wait for server to come back up after model_runner.py is modified
  // This is needed because uvicorn --reload restarts the server when the file changes
  const waitForServerRestart = async (maxRetries = 20, delayMs = 500): Promise<boolean> => {
    const headers = getAuthHeaders()

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch('/api/admin/models', {
          headers,
          credentials: 'include',
        })
        if (response.ok) {
          return true
        }
      } catch {
        // Server not ready yet, wait and retry
      }
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    return false
  }

  // Save scroll position on scroll
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

  // Ensure we stay on /admin route - prevent navigation away
  // But don't navigate if we're in the middle of an operation
  useEffect(() => {
    if (location.pathname !== '/admin' && user?.is_admin && !isModelOperationRef.current) {
      navigate('/admin', { replace: true })
    }
  }, [location.pathname, user?.is_admin, navigate])

  // On mount, restore activeTab and scroll position from sessionStorage (in case component remounted)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTab = sessionStorage.getItem('adminPanel_activeTab')
      if (savedTab && ['users', 'models', 'logs', 'analytics'].includes(savedTab)) {
        setActiveTab(savedTab as AdminTab)
      }
      // Restore scroll position after a brief delay to ensure DOM is ready
      setTimeout(() => {
        restoreScrollPosition()
      }, 100)
    }
  }, [])
  const [actionLogs, setActionLogs] = useState<AdminActionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [visitorAnalytics, setVisitorAnalytics] = useState<VisitorAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(1)
  const [logsPerPage] = useState(50)
  const [logsSearchTerm, setLogsSearchTerm] = useState('')
  const [selectedActionType, setSelectedActionType] = useState('')
  const [selectedLog, setSelectedLog] = useState<AdminActionLog | null>(null)
  const [showLogDetailModal, setShowLogDetailModal] = useState(false)

  // Helper function to format tier and role names for display
  const formatName = (name: string): string => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  const [users, setUsers] = useState<AdminUserListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)

  // Models management state
  const [models, setModels] = useState<AvailableModelsResponse | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [newModelId, setNewModelId] = useState('')
  const [addingModel, setAddingModel] = useState(false)
  const [modelProgress, setModelProgress] = useState<{
    stage: string
    message: string
    progress: number
  } | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [modelSuccess, setModelSuccess] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [modelToDelete, setModelToDelete] = useState<{ id: string; name: string } | null>(null)

  // Search providers state
  const [searchProviders, setSearchProviders] = useState<SearchProvidersResponse | null>(null)
  const [searchProvidersLoading, setSearchProvidersLoading] = useState(false)
  const [testingProvider, setTestingProvider] = useState(false)
  const [settingActiveProvider, setSettingActiveProvider] = useState<string | null>(null)
  const [testQuery, setTestQuery] = useState('test query')
  const [testResult, setTestResult] = useState<SearchProviderTestResult | null>(null)
  const [deletingModel, setDeletingModel] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const headers = getAuthHeaders()

      const response = await fetch('/api/admin/stats', {
        headers,
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else {
          throw new Error(`Failed to fetch admin stats (${response.status})`)
        }
      }

      const data = await response.json()
      setStats(data)
    } catch (err) {
      console.error('Error fetching admin stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch stats')
    }
  }, [getAuthHeaders])

  const fetchAppSettings = useCallback(async () => {
    try {
      const data = await getAppSettings()
      setAppSettings(data)
      // Set creditsReset based on whether there's any anonymous usage to reset
      // Only relevant in development mode where anonymous credit reset is available
      if (data.is_development) {
        const hasAnonymousUsage =
          data.anonymous_users_with_usage > 0 || data.anonymous_db_usage_count > 0
        setCreditsReset(!hasAnonymousUsage)
      }
    } catch (err) {
      console.error('Error fetching app settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch app settings')
    }
  }, [])

  const fetchActionLogs = useCallback(
    async (page = 1, actionType?: string) => {
      try {
        setLogsLoading(true)
        const headers = getAuthHeaders()

        const params = new URLSearchParams({
          page: page.toString(),
          per_page: logsPerPage.toString(),
        })

        if (actionType) {
          params.append('action_type', actionType)
        }

        const response = await fetch(`/api/admin/action-logs?${params}`, {
          headers,
          credentials: 'include',
        })

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Authentication required. Please log in again.')
          } else if (response.status === 403) {
            throw new Error('Access denied. Admin privileges required.')
          } else {
            throw new Error(`Failed to fetch action logs (${response.status})`)
          }
        }

        const data = await response.json()
        setActionLogs(data)
      } catch (err) {
        console.error('Error fetching action logs:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch action logs')
      } finally {
        setLogsLoading(false)
      }
    },
    [getAuthHeaders, logsPerPage]
  )

  useEffect(() => {
    if (activeTab === 'logs' && user?.is_admin) {
      fetchActionLogs(logsPage, selectedActionType || undefined)
    }
  }, [activeTab, logsPage, selectedActionType, user?.is_admin, fetchActionLogs])

  const fetchVisitorAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true)
      const headers = getAuthHeaders()

      const response = await fetch('/api/admin/analytics/visitors', {
        headers,
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else {
          throw new Error(`Failed to fetch visitor analytics (${response.status})`)
        }
      }

      const data = await response.json()
      setVisitorAnalytics(data)
    } catch (err) {
      console.error('Error fetching visitor analytics:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch visitor analytics')
    } finally {
      setAnalyticsLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    if (activeTab === 'analytics' && user?.is_admin) {
      fetchVisitorAnalytics()
    }
  }, [activeTab, user?.is_admin, fetchVisitorAnalytics])

  const fetchSearchProviders = useCallback(async () => {
    try {
      setSearchProvidersLoading(true)
      const data = await getSearchProviders()
      setSearchProviders(data)
    } catch (err) {
      console.error('Error fetching search providers:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch search providers')
    } finally {
      setSearchProvidersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'search-providers' && user?.is_admin) {
      fetchSearchProviders()
    }
  }, [activeTab, user?.is_admin, fetchSearchProviders])

  const handleSetActiveProvider = async (provider: string) => {
    try {
      setSettingActiveProvider(provider)
      console.log('[AdminPanel] Setting active provider:', provider)
      const result = await setActiveSearchProvider(provider)
      console.log('[AdminPanel] Provider set successfully:', result)
      await fetchSearchProviders()
      setModelSuccess(`Active search provider set to ${provider}`)
      setTimeout(() => setModelSuccess(null), 5000)
    } catch (err) {
      console.error('[AdminPanel] Error setting active provider:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to set active provider'
      setModelError(errorMessage)
      setTimeout(() => setModelError(null), 5000)
    } finally {
      setSettingActiveProvider(null)
    }
  }

  const handleTestProvider = async (provider?: string, query?: string) => {
    try {
      setTestingProvider(true)
      setTestResult(null)
      let result: SearchProviderTestResult
      if (provider && query) {
        result = await testSearchProviderWithQuery(provider, query)
      } else {
        result = await testSearchProvider()
      }
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        provider: provider || 'unknown',
        error: err instanceof Error ? err.message : 'Failed to test provider',
      })
    } finally {
      setTestingProvider(false)
    }
  }

  const fetchModels = useCallback(async () => {
    try {
      setModelsLoading(true)
      const headers = getAuthHeaders()

      const response = await fetch('/api/admin/models', {
        headers,
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else {
          throw new Error(`Failed to fetch models (${response.status})`)
        }
      }

      const data = await response.json()
      setModels(data)
    } catch (err) {
      console.error('Error fetching models:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch models')
    } finally {
      setModelsLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    if (activeTab === 'models' && user?.is_admin) {
      fetchModels()
    }
  }, [activeTab, user?.is_admin, fetchModels])

  const handleAddModel = async () => {
    if (!newModelId.trim()) {
      setModelError('Please enter a model ID')
      return
    }

    // Save scroll position BEFORE starting the operation
    saveScrollPosition()

    // Ensure we're on /admin route BEFORE starting the operation
    if (location.pathname !== '/admin') {
      navigate('/admin', { replace: true })
    }

    // Save to sessionStorage immediately so it persists even if component remounts
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('adminPanel_activeTab', 'models')
    }
    // Ensure we stay on Models tab
    setActiveTab('models')
    isModelOperationRef.current = true

    setAddingModel(true)
    setModelError(null)
    setModelSuccess(null)
    setModelProgress({ stage: 'validating', message: 'Validating model...', progress: 0 })

    // Create AbortController for cancellation
    const abortController = new AbortController()
    addModelAbortControllerRef.current = abortController

    try {
      const headers = getAuthHeaders()

      // First validate the model with OpenRouter
      const validateResponse = await fetch('/api/admin/models/validate', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model_id: newModelId.trim() }),
        credentials: 'include',
        signal: abortController.signal,
      })

      const validateData = await validateResponse.json()

      if (!validateResponse.ok) {
        throw new Error(validateData.detail || 'Model validation failed')
      }

      // Check the validation response body to ensure model is valid
      if (!validateData.valid) {
        throw new Error(
          validateData.message || `Model ${newModelId.trim()} is not valid in OpenRouter`
        )
      }

      // Use streaming endpoint to add the model with progress updates
      const response = await fetch('/api/admin/models/add-stream', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model_id: newModelId.trim() }),
        credentials: 'include',
        signal: abortController.signal,
      })

      if (!response.ok) {
        // Try to get error message from response
        try {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Failed to start model addition')
        } catch {
          throw new Error(`Failed to start model addition: ${response.statusText}`)
        }
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('Response body is not readable')
      }

      // Store reader reference for cancellation
      addModelReaderRef.current = reader

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'progress') {
                setModelProgress({
                  stage: data.stage || 'processing',
                  message: data.message || 'Processing...',
                  progress: data.progress || 0,
                })
              } else if (data.type === 'success') {
                setModelSuccess(`Model ${data.model_id || newModelId.trim()} added successfully!`)
                setNewModelId('')
                // Wait for server to restart (uvicorn --reload triggers when model_runner.py changes)
                setModelProgress({
                  stage: 'restarting',
                  message: 'Waiting for server to restart...',
                  progress: 95,
                })
                await waitForServerRestart()
                await fetchModels()
                setModelProgress(null)
                setAddingModel(false)
                addModelAbortControllerRef.current = null
                addModelReaderRef.current = null
                isModelOperationRef.current = false
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('adminPanel_activeTab', 'models')
                }
                setActiveTab('models')
                setTimeout(() => {
                  restoreScrollPosition()
                }, 50)
                return
              } else if (data.type === 'error') {
                throw new Error(data.message || 'Failed to add model')
              }
            } catch (e) {
              // Skip invalid JSON
              if (e instanceof SyntaxError) continue
              throw e
            }
          }
        }
      }

      // If we get here without success, something went wrong
      throw new Error('Stream ended unexpectedly')
    } catch (err) {
      // Don't show error if it was a cancellation
      if (err instanceof Error && err.name === 'AbortError') {
        setModelError('Model addition cancelled')
      } else {
        setModelError(err instanceof Error ? err.message : 'Failed to add model')
      }
      setModelProgress(null)
      setAddingModel(false)
      addModelAbortControllerRef.current = null
      addModelReaderRef.current = null
      isModelOperationRef.current = false
      // Ensure Models tab stays active even on error
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('adminPanel_activeTab', 'models')
      }
      setActiveTab('models')
      setTimeout(() => {
        restoreScrollPosition()
      }, 50)
    }
  }

  const handleCancelAddModel = () => {
    if (addModelAbortControllerRef.current) {
      addModelAbortControllerRef.current.abort()
      addModelAbortControllerRef.current = null
    }
    if (addModelReaderRef.current) {
      addModelReaderRef.current.cancel()
      addModelReaderRef.current = null
    }
    setModelProgress(null)
    setAddingModel(false)
    isModelOperationRef.current = false
    setModelError('Model addition cancelled')
  }

  const handleDeleteModel = async () => {
    if (!modelToDelete) return

    // Save scroll position BEFORE starting the operation
    saveScrollPosition()

    // Ensure we're on /admin route BEFORE starting the operation
    if (location.pathname !== '/admin') {
      navigate('/admin', { replace: true })
    }

    // Save to sessionStorage immediately so it persists even if component remounts
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('adminPanel_activeTab', 'models')
    }
    // Ensure we stay on Models tab
    setActiveTab('models')
    isModelOperationRef.current = true

    setDeletingModel(true)
    setModelError(null)
    setModelSuccess(null)

    try {
      const headers = getAuthHeaders()

      const response = await fetch('/api/admin/models/delete', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model_id: modelToDelete.id }),
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete model')
      }

      setModelSuccess(`Model ${modelToDelete.id} deleted successfully!`)
      setShowDeleteConfirm(false)
      setModelToDelete(null)
      // Wait for server to restart (uvicorn --reload triggers when model_runner.py changes)
      await waitForServerRestart()
      await fetchModels()
      // Ensure Models tab stays active
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('adminPanel_activeTab', 'models')
      }
      setActiveTab('models')
    } catch (err) {
      setModelError(err instanceof Error ? err.message : 'Failed to delete model')
      // Ensure Models tab stays active even on error
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('adminPanel_activeTab', 'models')
      }
      setActiveTab('models')
    } finally {
      setDeletingModel(false)
      isModelOperationRef.current = false
      // Ensure Models tab stays active after deletion completes
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('adminPanel_activeTab', 'models')
      }
      setActiveTab('models')
      // Restore scroll position after operation completes
      setTimeout(() => {
        restoreScrollPosition()
      }, 50)
      // Note: Route protection useEffect will handle staying on /admin
    }
  }

  const fetchUsersInitial = useCallback(
    async (page = 1) => {
      try {
        const headers = getAuthHeaders()

        const params = new URLSearchParams({
          page: page.toString(),
          per_page: '20',
        })

        const response = await fetch(`/api/admin/users?${params}`, {
          headers,
          credentials: 'include',
        })

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Authentication required. Please log in again.')
          } else if (response.status === 403) {
            throw new Error('Access denied. Admin privileges required.')
          } else {
            throw new Error(`Failed to fetch users (${response.status})`)
          }
        }

        const data = await response.json()
        setUsers(data)
      } catch (err) {
        console.error('Error fetching users:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch users')
      }
    },
    [getAuthHeaders]
  )

  useEffect(() => {
    const loadData = async () => {
      // Only load data if user is properly authenticated and is admin
      if (!user?.is_admin) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null) // Clear any previous errors

      try {
        await Promise.all([fetchStats(), fetchUsersInitial(currentPage), fetchAppSettings()])
      } catch (err) {
        console.error('Error loading admin data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [currentPage, user?.is_admin, fetchStats, fetchUsersInitial, fetchAppSettings])

  const handleManualSearch = async () => {
    try {
      const headers = getAuthHeaders()

      const params = new URLSearchParams({
        page: '1',
        per_page: '20',
      })

      if (searchTerm) params.append('search', searchTerm)
      if (selectedRole) params.append('role', selectedRole)
      if (selectedTier) params.append('tier', selectedTier)

      const response = await fetch(`/api/admin/users?${params}`, {
        headers,
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else {
          throw new Error(`Failed to fetch users (${response.status})`)
        }
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
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else {
          throw new Error(`Failed to toggle user status (${response.status})`)
        }
      }

      // Refresh both users list and stats
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
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else {
          throw new Error(`Failed to send verification email (${response.status})`)
        }
      }

      // Verification email sent successfully

      // Refresh both users list and stats
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
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else {
          throw new Error(`Failed to reset usage (${response.status})`)
        }
      }

      // Refresh both users list and stats
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])

      // If the admin reset their own usage, refresh their user data in AuthContext
      // This ensures the UserMenu dropdown shows the updated count
      if (user && userId === user.id) {
        await refreshUser()
      }
    } catch (err) {
      console.error('Error resetting usage:', err)
      setError(err instanceof Error ? err.message : 'Failed to reset usage')
    }
  }

  const toggleAnonymousMockMode = async () => {
    try {
      const data = await toggleAnonymousMockModeService()

      // Update state immediately from the toggle response
      if (appSettings) {
        setAppSettings({
          ...appSettings,
          anonymous_mock_mode_enabled: data.anonymous_mock_mode_enabled,
        })
      } else {
        // If appSettings is null, fetch it to get is_development
        await fetchAppSettings()
      }
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
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else {
          throw new Error(`Failed to reset anonymous credits (${response.status})`)
        }
      }

      await response.json()
      setCreditsReset(true)

      // Dispatch custom event to notify components to refresh usage display
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
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else if (response.status === 400) {
          const errorData = await response.json()
          throw new Error(
            errorData.detail || 'Mock mode can only be enabled for admin/super-admin users'
          )
        } else {
          throw new Error(`Failed to toggle mock mode (${response.status})`)
        }
      }

      // Refresh both users list and stats
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])

      // If toggling own mock mode, refresh user data to update UI
      if (user && userId === user.id) {
        await refreshUser()
      }
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
    if (currentTier === newTier) {
      return // No change needed
    }
    setTierChangeData({ userId, email, currentTier, newTier })
    setShowTierChangeModal(true)
  }

  const handleTierChangeCancel = () => {
    setShowTierChangeModal(false)
    setTierChangeData(null)
    // Refresh the page to reset the dropdown to the original value
    fetchUsersInitial(currentPage)
  }

  const handleTierChangeConfirm = async () => {
    if (!tierChangeData) return

    try {
      const headers = getAuthHeaders()

      const response = await fetch(`/api/admin/users/${tierChangeData.userId}/change-tier`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription_tier: tierChangeData.newTier }),
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Super admin privileges required.')
        } else {
          throw new Error(`Failed to change tier (${response.status})`)
        }
      }

      // Close modal and reset data
      setShowTierChangeModal(false)
      setTierChangeData(null)

      // Refresh both users list and stats
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])

      // If the admin changed their own tier, refresh their user data in AuthContext
      if (user && tierChangeData.userId === user.id) {
        await refreshUser()
      }
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
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createUserData),
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json()
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.')
        } else if (response.status === 400) {
          throw new Error(errorData.detail || 'Invalid user data')
        } else {
          throw new Error(`Failed to create user (${response.status})`)
        }
      }

      // Reset form and close modal
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

      // Refresh both users list and stats
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])

      // User created successfully
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err instanceof Error ? err.message : 'Failed to create user')
    }
  }

  const handleDeleteClick = (userId: number, email: string) => {
    // Check if user is trying to delete themselves
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

      const deleteUrl = `/api/admin/users/${userToDelete.id}`

      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Super Admin privileges required to delete users.')
        } else if (response.status === 400) {
          throw new Error(errorData.detail || 'Cannot delete user')
        } else if (response.status === 404) {
          throw new Error('User not found')
        } else {
          throw new Error(`Failed to delete user (${response.status})`)
        }
      }

      // Close modal and reset state
      setShowDeleteModal(false)
      setUserToDelete(null)

      // Refresh both users list and stats
      await Promise.all([fetchUsersInitial(currentPage), fetchStats()])

      // User deleted successfully
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

  // Check if user is admin
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
      <div className="admin-panel">
        <div className="loading-message">Loading admin panel...</div>
      </div>
    )
  }

  return (
    <div className="admin-panel" ref={adminPanelRef}>
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

      {/* Stats Dashboard */}
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

      {/* Tabs Navigation */}
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => {
            // Prevent tab switching during model operations
            if (!isModelOperationRef.current && !addingModel && !deletingModel) {
              setActiveTab('users')
            }
          }}
          disabled={isModelOperationRef.current || addingModel || deletingModel}
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
          onClick={() => {
            // Prevent tab switching during model operations
            if (!isModelOperationRef.current && !addingModel && !deletingModel) {
              setActiveTab('logs')
            }
          }}
          disabled={isModelOperationRef.current || addingModel || deletingModel}
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
          onClick={() => {
            // Prevent tab switching during model operations
            if (!isModelOperationRef.current && !addingModel && !deletingModel) {
              setActiveTab('analytics')
            }
          }}
          disabled={isModelOperationRef.current || addingModel || deletingModel}
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
          onClick={() => {
            // Prevent tab switching during model operations
            if (!isModelOperationRef.current && !addingModel && !deletingModel) {
              setActiveTab('search-providers')
            }
          }}
          disabled={isModelOperationRef.current || addingModel || deletingModel}
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
      </div>

      {/* Models Section */}
      {activeTab === 'models' && (
        <div className="logs-management">
          <div className="logs-management-header">
            <h2>Model Management</h2>
            <button className="refresh-logs-btn" onClick={fetchModels} disabled={modelsLoading}>
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
            </button>
          </div>

          {/* Add Model Section - Only in Development */}
          {isDevelopment && (
            <div
              style={{
                marginBottom: '2rem',
                padding: '1.5rem',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                Add New Model
              </h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Enter model ID (e.g., x-ai/grok-4.1-fast)"
                    value={newModelId}
                    onChange={e => {
                      setNewModelId(e.target.value)
                      setModelError(null)
                      setModelSuccess(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !addingModel) {
                        handleAddModel()
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                    }}
                    disabled={addingModel}
                  />
                  {modelError && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        color: 'var(--error-color)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {modelError}
                    </div>
                  )}
                  {modelSuccess && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        color: 'var(--success-color)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {modelSuccess}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleAddModel}
                  disabled={addingModel || !newModelId.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: addingModel
                      ? 'var(--bg-tertiary)'
                      : 'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
                    color: 'white',
                    fontWeight: 600,
                    cursor: addingModel || !newModelId.trim() ? 'not-allowed' : 'pointer',
                    opacity: addingModel || !newModelId.trim() ? 0.6 : 1,
                  }}
                >
                  {addingModel ? 'Adding...' : 'Add Model'}
                </button>
              </div>
            </div>
          )}

          {/* Info message in production */}
          {!isDevelopment && (
            <div
              style={{
                marginBottom: '2rem',
                padding: '1.5rem',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
              }}
            >
              <p style={{ margin: 0 }}>
                Model management (add/delete) is only available in development environment. Models
                should be added via development and deployed to production.
              </p>
            </div>
          )}

          {/* Models List by Provider */}
          {modelsLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              Loading models...
            </div>
          ) : models && models.models_by_provider ? (
            <div>
              <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
                Current Models
              </h3>
              {Object.entries(models.models_by_provider).map(([provider, providerModels]) => (
                <div key={provider} style={{ marginBottom: '2rem' }}>
                  <div
                    style={{
                      padding: '1rem 1.5rem',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-lg)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <h4
                        style={{
                          margin: 0,
                          color: 'var(--text-primary)',
                          fontSize: '1.1rem',
                          fontWeight: 600,
                        }}
                      >
                        {provider}
                      </h4>
                      <span
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          fontSize: '0.875rem',
                        }}
                      >
                        {providerModels.length} model{providerModels.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    {providerModels.map((model: Model) => (
                      <div
                        key={model.id}
                        style={{
                          padding: '1rem',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              marginBottom: '0.25rem',
                            }}
                          >
                            {model.name}
                          </div>
                          <div
                            style={{
                              fontSize: '0.875rem',
                              color: 'var(--text-secondary)',
                              fontFamily: 'monospace',
                            }}
                          >
                            {model.id}
                          </div>
                        </div>
                        {/* Only show delete button in development */}
                        {isDevelopment && (
                          <button
                            onClick={() => {
                              setModelToDelete({ id: model.id, name: model.name })
                              setShowDeleteConfirm(true)
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              borderRadius: 'var(--radius-md)',
                              border: 'none',
                              background: 'var(--error-color)',
                              color: 'white',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No models found
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && modelToDelete && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              border: '1px solid var(--border-color)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-primary)' }}>
              Confirm Deletion
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Are you sure you want to delete <strong>{modelToDelete.name}</strong> (
              {modelToDelete.id})?
              <br />
              This will remove the model from model_runner.py and delete its renderer configuration.
            </p>
            {modelError && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: 'var(--error-color)',
                  color: 'white',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                }}
              >
                {modelError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setModelToDelete(null)
                  setModelError(null)
                }}
                disabled={deletingModel}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: deletingModel ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteModel}
                disabled={deletingModel}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: deletingModel ? 'var(--bg-tertiary)' : 'var(--error-color)',
                  color: 'white',
                  fontWeight: 600,
                  cursor: deletingModel ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingModel ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Section */}
      {activeTab === 'logs' && (
        <div className="logs-management">
          <div className="logs-management-header">
            <h2>Admin Action Logs</h2>
            <button
              className="refresh-logs-btn"
              onClick={() => fetchActionLogs(logsPage, selectedActionType || undefined)}
              disabled={logsLoading}
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
              Refresh
            </button>
          </div>

          {/* Logs Search and Filters */}
          <div className="logs-search-form">
            <div className="logs-search-controls">
              <input
                type="text"
                placeholder="Search by description..."
                value={logsSearchTerm}
                onChange={e => setLogsSearchTerm(e.target.value)}
                className="search-input"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setLogsPage(1)
                    fetchActionLogs(1, selectedActionType || undefined)
                  }
                }}
              />

              <select
                value={selectedActionType}
                onChange={e => {
                  setSelectedActionType(e.target.value)
                  setLogsPage(1)
                  fetchActionLogs(1, e.target.value || undefined)
                }}
                className="filter-select"
              >
                <option value="">All Action Types</option>
                <option value="user_create">User Create</option>
                <option value="user_update">User Update</option>
                <option value="user_delete">User Delete</option>
                <option value="password_reset">Password Reset</option>
                <option value="send_verification">Send Verification</option>
                <option value="toggle_active">Toggle Active</option>
                <option value="reset_usage">Reset Usage</option>
                <option value="toggle_mock_mode">Toggle Mock Mode</option>
                <option value="change_tier">Change Tier</option>
                <option value="toggle_anonymous_mock_mode">Toggle Anonymous Mock Mode</option>
              </select>

              <button
                type="button"
                className="search-btn"
                onClick={() => {
                  setLogsPage(1)
                  fetchActionLogs(1, selectedActionType || undefined)
                }}
                disabled={logsLoading}
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
                Search
              </button>
            </div>
          </div>

          {/* Logs Table */}
          {logsLoading ? (
            <div className="loading-message">Loading logs...</div>
          ) : actionLogs.length === 0 ? (
            <div className="empty-state">
              <p>No logs found.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="logs-table-container">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action Type</th>
                      <th>Description</th>
                      <th>Admin</th>
                      <th>Target User</th>
                      <th>IP Address</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionLogs
                      .filter(
                        log =>
                          !logsSearchTerm ||
                          log.action_description
                            .toLowerCase()
                            .includes(logsSearchTerm.toLowerCase()) ||
                          log.action_type.toLowerCase().includes(logsSearchTerm.toLowerCase())
                      )
                      .map(log => (
                        <tr key={log.id}>
                          <td>
                            <span title={new Date(log.created_at).toLocaleString()}>
                              {new Date(log.created_at).toLocaleDateString()}{' '}
                              {new Date(log.created_at).toLocaleTimeString()}
                            </span>
                          </td>
                          <td>
                            <span className={`action-type-badge action-${log.action_type}`}>
                              {log.action_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="log-description">{log.action_description}</td>
                          <td>
                            <span className="log-user-email">
                              {log.admin_user_email || 'Unknown'}
                            </span>
                          </td>
                          <td>
                            {log.target_user_email ? (
                              <span className="log-user-email">{log.target_user_email}</span>
                            ) : (
                              <span className="log-na">N/A</span>
                            )}
                          </td>
                          <td className="log-ip">{log.ip_address || 'N/A'}</td>
                          <td>
                            <button
                              onClick={() => {
                                setSelectedLog(log)
                                setShowLogDetailModal(true)
                              }}
                              className="view-details-btn"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="logs-cards-mobile">
                {actionLogs
                  .filter(
                    log =>
                      !logsSearchTerm ||
                      log.action_description.toLowerCase().includes(logsSearchTerm.toLowerCase()) ||
                      log.action_type.toLowerCase().includes(logsSearchTerm.toLowerCase())
                  )
                  .map(log => (
                    <div key={log.id} className="log-card">
                      <div className="log-card-header">
                        <div className="log-card-timestamp">
                          {new Date(log.created_at).toLocaleDateString()}{' '}
                          {new Date(log.created_at).toLocaleTimeString()}
                        </div>
                        <div className="log-card-action-type">
                          <span className={`action-type-badge action-${log.action_type}`}>
                            {log.action_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="log-card-row">
                        <span className="log-card-label">Description</span>
                        <span className="log-card-value">{log.action_description}</span>
                      </div>

                      <div className="log-card-row">
                        <span className="log-card-label">Admin</span>
                        <span className="log-card-value">{log.admin_user_email || 'Unknown'}</span>
                      </div>

                      <div className="log-card-row">
                        <span className="log-card-label">Target User</span>
                        <span className="log-card-value">{log.target_user_email || 'N/A'}</span>
                      </div>

                      <div className="log-card-row">
                        <span className="log-card-label">IP Address</span>
                        <span className="log-card-value log-ip">{log.ip_address || 'N/A'}</span>
                      </div>

                      <div className="log-card-actions">
                        <button
                          onClick={() => {
                            setSelectedLog(log)
                            setShowLogDetailModal(true)
                          }}
                          className="view-details-btn"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Logs Pagination */}
              <div className="pagination">
                <button
                  onClick={() => {
                    if (logsPage > 1) {
                      setLogsPage(logsPage - 1)
                      fetchActionLogs(logsPage - 1, selectedActionType || undefined)
                    }
                  }}
                  disabled={logsPage === 1 || logsLoading}
                  className="page-btn"
                >
                  Previous
                </button>

                <span className="page-info">Page {logsPage}</span>

                <button
                  onClick={() => {
                    setLogsPage(logsPage + 1)
                    fetchActionLogs(logsPage + 1, selectedActionType || undefined)
                  }}
                  disabled={actionLogs.length < logsPerPage || logsLoading}
                  className="page-btn"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Visitor Analytics Section */}
      {activeTab === 'analytics' && (
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
              {/* Overall Stats */}
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

              {/* Time-based Stats */}
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

              {/* Visitor Type Breakdown */}
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

              {/* Daily Breakdown Chart */}
              <div className="analytics-daily-breakdown">
                <h3>Daily Breakdown (Last 30 Days)</h3>
                <div className="daily-chart-container">
                  <div className="daily-chart">
                    {visitorAnalytics.daily_breakdown.map((day, index) => {
                      const maxVisitors = Math.max(
                        ...visitorAnalytics.daily_breakdown.map(d => d.unique_visitors),
                        1
                      )
                      const barHeight =
                        maxVisitors > 0 ? (day.unique_visitors / maxVisitors) * 100 : 0
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

              {/* Daily Breakdown Table */}
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
                              <td className="number-cell">
                                {day.unique_visitors.toLocaleString()}
                              </td>
                              <td className="number-cell">
                                {day.total_comparisons.toLocaleString()}
                              </td>
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
      )}

      {/* Search Providers Section */}
      {activeTab === 'search-providers' && (
        <div className="search-providers-management">
          <div className="search-providers-management-header">
            <h2>Search Providers</h2>
            <button
              className="refresh-providers-btn"
              onClick={fetchSearchProviders}
              disabled={searchProvidersLoading}
            >
              {searchProvidersLoading ? (
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

          {searchProvidersLoading && !searchProviders && (
            <div className="loading-message">
              <p>Loading search providers...</p>
            </div>
          )}

          {/* Error and Success Messages */}
          {modelError && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                background: 'var(--error-bg, #fee)',
                border: '1px solid var(--error-color, #dc3545)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--error-color, #dc3545)',
                fontSize: '0.875rem',
              }}
            >
              {modelError}
            </div>
          )}
          {modelSuccess && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                background: 'var(--success-bg, #efe)',
                border: '1px solid var(--success-color, #28a745)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--success-color, #28a745)',
                fontSize: '0.875rem',
              }}
            >
              {modelSuccess}
            </div>
          )}

          {searchProviders && (
            <>
              {/* Providers List */}
              <div className="providers-list">
                {searchProviders.providers.map(provider => (
                  <div
                    key={provider.name}
                    className="provider-card"
                    style={{
                      padding: '1.5rem',
                      marginBottom: '1rem',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-lg)',
                      opacity: !searchProviders.is_development && !provider.is_active ? 0.6 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1rem',
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            margin: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}
                        >
                          {provider.display_name}
                          {provider.is_active && (
                            <span
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: 'var(--success-color, #28a745)',
                                color: 'white',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                              }}
                            >
                              Active
                            </span>
                          )}
                        </h3>
                        <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)' }}>
                          {provider.is_configured ? (
                            <span style={{ color: 'var(--success-color, #28a745)' }}>
                              ✓ API key configured
                            </span>
                          ) : (
                            <span style={{ color: 'var(--error-color, #dc3545)' }}>
                              ✗ API key not configured
                            </span>
                          )}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleSetActiveProvider(provider.name)}
                          disabled={
                            !provider.is_configured ||
                            provider.is_active ||
                            settingActiveProvider === provider.name
                          }
                          className="set-active-btn"
                          style={{
                            padding: '0.5rem 1rem',
                            background:
                              provider.is_active ||
                              !provider.is_configured ||
                              settingActiveProvider === provider.name
                                ? 'var(--bg-disabled)'
                                : 'var(--primary-color)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor:
                              provider.is_active ||
                              !provider.is_configured ||
                              settingActiveProvider === provider.name
                                ? 'not-allowed'
                                : 'pointer',
                            opacity:
                              provider.is_active ||
                              !provider.is_configured ||
                              settingActiveProvider === provider.name
                                ? 0.6
                                : 1,
                          }}
                          title={
                            provider.is_active
                              ? 'Already active'
                              : !provider.is_configured
                                ? 'API key not configured'
                                : settingActiveProvider === provider.name
                                  ? 'Setting active provider...'
                                  : 'Set as active provider'
                          }
                        >
                          {settingActiveProvider === provider.name
                            ? 'Setting...'
                            : provider.is_active
                              ? 'Active'
                              : 'Set Active'}
                        </button>
                        <button
                          onClick={() => handleTestProvider(provider.name, testQuery)}
                          disabled={!provider.is_configured || testingProvider}
                          className="test-provider-btn"
                          style={{
                            padding: '0.5rem 1rem',
                            background: provider.is_configured
                              ? 'var(--primary-color)'
                              : 'var(--bg-disabled)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: provider.is_configured ? 'pointer' : 'not-allowed',
                            opacity: provider.is_configured ? 1 : 0.6,
                          }}
                          title={
                            provider.is_configured ? 'Test provider' : 'API key not configured'
                          }
                        >
                          Test
                        </button>
                      </div>
                    </div>

                    {/* Test Query Input */}
                    {provider.is_configured && (
                      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          value={testQuery}
                          onChange={e => setTestQuery(e.target.value)}
                          placeholder="Enter test query..."
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                          }}
                        />
                        <button
                          onClick={() => handleTestProvider(provider.name, testQuery)}
                          disabled={testingProvider || !testQuery.trim()}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--primary-color)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor:
                              testingProvider || !testQuery.trim() ? 'not-allowed' : 'pointer',
                            opacity: testingProvider || !testQuery.trim() ? 0.6 : 1,
                          }}
                        >
                          Test Query
                        </button>
                      </div>
                    )}

                    {/* Test Results */}
                    {testResult && testResult.provider === provider.name && (
                      <div
                        style={{
                          marginTop: '1rem',
                          padding: '1rem',
                          background: testResult.success
                            ? 'var(--bg-success, #d4edda)'
                            : 'var(--bg-error, #f8d7da)',
                          border: `1px solid ${testResult.success ? 'var(--success-color, #28a745)' : 'var(--error-color, #dc3545)'}`,
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        {testResult.success ? (
                          <>
                            <p
                              style={{
                                margin: 0,
                                fontWeight: 'bold',
                                color: 'var(--success-color, #28a745)',
                              }}
                            >
                              ✓ Test successful - {testResult.results_count} results found
                            </p>
                            {testResult.results && testResult.results.length > 0 && (
                              <div style={{ marginTop: '0.5rem' }}>
                                {testResult.results.slice(0, 3).map((result, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      marginTop: '0.5rem',
                                      padding: '0.5rem',
                                      background: 'white',
                                      borderRadius: 'var(--radius-sm)',
                                    }}
                                  >
                                    <a
                                      href={result.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}
                                    >
                                      {result.title}
                                    </a>
                                    <p
                                      style={{
                                        margin: '0.25rem 0 0 0',
                                        fontSize: '0.9rem',
                                        color: '#666',
                                      }}
                                    >
                                      {result.snippet}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <p style={{ margin: 0, color: 'var(--error-color, #dc3545)' }}>
                            ✗ Test failed: {testResult.error || 'Unknown error'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Current Active Provider Info */}
              {searchProviders.active_provider && (
                <div
                  style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: 'var(--bg-info, #d1ecf1)',
                    border: '1px solid var(--info-color, #17a2b8)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-info, #0c5460)',
                  }}
                >
                  <strong>Current Active Provider:</strong> {searchProviders.active_provider}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Anonymous Settings - Development Only */}
      {appSettings && appSettings.is_development && activeTab === 'users' && (
        <div className="admin-stats" style={{ marginBottom: '2rem' }}>
          <h2>Anonymous Users (Development Mode Only)</h2>
          <div className="stats-grid">
            <div className="stat-card anonymous-settings-card-wrapper">
              <div className="anonymous-settings-container">
                {/* Anonymous Mock Mode Section */}
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
                    title={`Anonymous mock mode is ${appSettings.anonymous_mock_mode_enabled ? 'enabled' : 'disabled'} - ${appSettings.anonymous_mock_mode_enabled ? 'Anonymous users get mock responses' : 'Anonymous users use real API calls'}`}
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
                      ? 'Anonymous users will receive mock responses'
                      : 'Anonymous users will use real API calls'}
                  </p>
                </div>

                {/* Anonymous Zero Usage Section */}
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
                    title="Reset all anonymous user credits to maximum (50 credits)"
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
                      ? 'All anonymous user credits have been reset to maximum'
                      : 'Resets all anonymous user credits to 50'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Management */}
      {activeTab === 'users' && (
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

          {/* Search and Filters */}
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

          {/* Users Table */}
          {users && (
            <>
              {/* Desktop Table View */}
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
                              const month = String(date.getMonth() + 1).padStart(2, '0')
                              const day = String(date.getDate()).padStart(2, '0')
                              const year = date.getFullYear()
                              return `${month}/${day}/${year}`
                            })()}
                          </span>
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
                            {/* Mock mode toggle - available for any user in development mode, admin/super-admin in production */}
                            {(import.meta.env.DEV ||
                              userRow.role === 'admin' ||
                              userRow.role === 'super_admin') && (
                              <button
                                onClick={() => toggleMockMode(userRow.id)}
                                className={`mock-mode-btn ${userRow.mock_mode_enabled ? 'enabled' : 'disabled'}`}
                                title={`Mock mode is ${userRow.mock_mode_enabled ? 'enabled' : 'disabled'} - ${userRow.mock_mode_enabled ? 'Using mock responses' : 'Using real API calls'}${import.meta.env.DEV ? ' (Dev Mode)' : ''}`}
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

              {/* Mobile Card View */}
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
                        <span
                          className={`status-badge ${userRow.is_active ? 'active' : 'inactive'}`}
                        >
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
                          const month = String(date.getMonth() + 1).padStart(2, '0')
                          const day = String(date.getDate()).padStart(2, '0')
                          const year = date.getFullYear()
                          return `${month}/${day}/${year}`
                        })()}
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
                        {/* Mock mode toggle - available for any user in development mode, admin/super-admin in production */}
                        {(import.meta.env.DEV ||
                          userRow.role === 'admin' ||
                          userRow.role === 'super_admin') && (
                          <button
                            onClick={() => toggleMockMode(userRow.id)}
                            className={`mock-mode-btn ${userRow.mock_mode_enabled ? 'enabled' : 'disabled'}`}
                            title={`Mock mode is ${userRow.mock_mode_enabled ? 'enabled' : 'disabled'} - ${userRow.mock_mode_enabled ? 'Using mock responses' : 'Using real API calls'}${import.meta.env.DEV ? ' (Dev Mode)' : ''}`}
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

              {/* Pagination */}
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
      )}

      {/* Delete Confirmation Modal */}
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

      {/* Self-Deletion Warning Modal */}
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

      {/* Tier Change Confirmation Modal */}
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
                  <strong>Current Tier:</strong>
                  <span className={`tier-badge tier-${tierChangeData.currentTier}`}>
                    {tierChangeData.currentTier}
                  </span>
                </div>
                <div className="tier-change-row">
                  <strong>New Tier:</strong>
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

      {/* Create User Modal */}
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
                  characters (!@#$%^&*()_+-=[]{};':\"|,.&lt;&gt;/?)
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

      {/* Log Detail Modal */}
      {showLogDetailModal && selectedLog && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowLogDetailModal(false)
            setSelectedLog(null)
          }}
        >
          <div className="modal-content log-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Log Details</h2>
              <button
                className="modal-close-btn"
                onClick={() => {
                  setShowLogDetailModal(false)
                  setSelectedLog(null)
                }}
              >
                ×
              </button>
            </div>

            <div className="log-detail-body">
              <div className="log-detail-section">
                <h3>Basic Information</h3>
                <div className="log-detail-grid">
                  <div className="log-detail-item">
                    <strong>Log ID:</strong>
                    <span>{selectedLog.id}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Timestamp:</strong>
                    <span>{new Date(selectedLog.created_at).toLocaleString()}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Action Type:</strong>
                    <span className={`action-type-badge action-${selectedLog.action_type}`}>
                      {selectedLog.action_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Description:</strong>
                    <span>{selectedLog.action_description}</span>
                  </div>
                </div>
              </div>

              <div className="log-detail-section">
                <h3>User Information</h3>
                <div className="log-detail-grid">
                  <div className="log-detail-item">
                    <strong>Admin User:</strong>
                    <span className="log-user-email-main">
                      {selectedLog.admin_user_email || 'Unknown'}
                    </span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Target User:</strong>
                    <span className="log-user-email-main">
                      {selectedLog.target_user_email || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="log-detail-section">
                <h3>Request Information</h3>
                <div className="log-detail-grid">
                  <div className="log-detail-item full-width">
                    <strong>IP Address:</strong>
                    <span>{selectedLog.ip_address || 'N/A'}</span>
                  </div>
                  <div className="log-detail-item full-width">
                    <strong>User Agent:</strong>
                    <span className="log-user-agent">{selectedLog.user_agent || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {selectedLog.details && (
                <div className="log-detail-section">
                  <h3>Details (JSON)</h3>
                  <pre className="log-details-json">
                    {(() => {
                      try {
                        const parsed = JSON.parse(selectedLog.details)
                        return JSON.stringify(parsed, null, 2)
                      } catch {
                        return selectedLog.details
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setShowLogDetailModal(false)
                  setSelectedLog(null)
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Model Loading Modal */}
      {addingModel && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
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
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                Adding Model
              </h2>
            </div>
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: '1.5rem',
                }}
              >
                <LoadingSpinner size="large" modern={true} />
              </div>
              <p
                style={{
                  marginTop: '0',
                  color: 'var(--text-primary)',
                  fontSize: '1rem',
                  fontWeight: 500,
                }}
              >
                Adding model <strong>{newModelId.trim() || '...'}</strong>
              </p>
              {modelProgress && (
                <>
                  <p
                    style={{
                      marginTop: '1rem',
                      color: 'var(--text-primary)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                    }}
                  >
                    {modelProgress.message}
                  </p>
                  <div
                    style={{
                      marginTop: '1rem',
                      width: '100%',
                      height: '8px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${modelProgress.progress}%`,
                        height: '100%',
                        background:
                          'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
                        transition: 'width 0.3s ease',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                  <p
                    style={{
                      marginTop: '0.5rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.75rem',
                    }}
                  >
                    {Math.round(modelProgress.progress)}% complete
                  </p>
                </>
              )}
              {!modelProgress && (
                <p
                  style={{
                    marginTop: '0.5rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                  }}
                >
                  Please wait while we validate and add the model to your system.
                </p>
              )}
              <div
                style={{
                  marginTop: '2rem',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '1rem',
                }}
              >
                <button
                  onClick={handleCancelAddModel}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)'
                    e.currentTarget.style.borderColor = 'var(--error-color)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--bg-secondary)'
                    e.currentTarget.style.borderColor = 'var(--border-color)'
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel
