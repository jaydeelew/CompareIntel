/**
 * Authentication Context for CompareIntel
 * Manages user authentication state, login, logout, and token refresh
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

import type { User, AuthContextType, LoginCredentials, RegisterData, AuthResponse } from '../types'
import logger from '../utils/logger'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// API base URL with smart fallback
const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Ref to prevent duplicate auth initialization logging in React StrictMode
  const authInitializedRef = useRef(false)

  // Note: Tokens are now stored in HTTP-only cookies set by the backend
  // We no longer need to manage tokens in localStorage
  // Cookies are automatically sent with requests, so we don't need to read them

  // Fetch current user from API
  // Cookies are automatically sent with the request, no need to include Authorization header
  const fetchCurrentUser = useCallback(async (): Promise<User | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include', // Important: Include cookies in request
      })

      if (!response.ok) {
        // 401 (Unauthorized) is expected when user is not authenticated - handle silently
        if (response.status === 401) {
          return null
        }
        // For other errors, return null silently (don't throw)
        return null
      }

      const userData = await response.json()
      return userData
    } catch (_error) {
      // Silently handle all errors (network errors, cancellation, etc.)
      // These are expected in various scenarios (no network, component unmount, etc.)
      return null
    }
  }, [])

  // Refresh access token using refresh token from cookies
  const refreshToken = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // Important: Include cookies (refresh token) in request
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // 401 (Unauthorized) and 500 (Internal Server Error) are expected when:
        // - User is not authenticated (no refresh token in cookies)
        // - Refresh token is invalid/expired
        // Handle silently without logging errors
        if (response.status === 401 || response.status === 500) {
          setUser(null)
          setIsLoading(false)
          return
        }
        logger.warn(`Token refresh failed with status ${response.status}`)
        setUser(null)
        setIsLoading(false)
        return
      }

      // Tokens are now set in cookies by the backend, no need to save them
      // Fetch user data after refreshing token
      const userData = await fetchCurrentUser()
      if (userData) {
        setUser(userData)
      } else {
        // If we can't fetch user, user is not authenticated
        setUser(null)
      }
    } catch (_error) {
      // Network errors and other exceptions - handle silently
      // These are expected in various scenarios (no network, etc.)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [fetchCurrentUser])

  // Login function
  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include', // Important: Include cookies in request/response
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      })

      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = 'Login failed'
        const contentType = response.headers.get('content-type')

        try {
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json()
            errorMessage = error.detail || error.message || JSON.stringify(error)
          } else {
            // Try to read as text for non-JSON responses
            const errorText = await response.text()
            errorMessage = errorText || `Server error (${response.status})`
          }
        } catch (_parseError) {
          errorMessage = `Server error (${response.status}): ${response.statusText}`
        }

        throw new Error(errorMessage)
      }

      // Tokens are now set in HTTP-only cookies by the backend
      // No need to save them to localStorage
      // Consume the response to ensure it's fully read
      await response.json()

      // Fetch user data - retry with delays to ensure cookies are available
      // Cookies may not be immediately available after response, so we retry
      let userData: User | null = null
      const maxRetries = 3
      const retryDelay = 100 // Start with 100ms delay

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Add delay before each attempt (cookies need time to be set, especially first attempt)
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
          } else {
            // Small delay even for first attempt to ensure cookies are set
            await new Promise(resolve => setTimeout(resolve, 50))
          }

          userData = await fetchCurrentUser()
          if (userData) {
            setUser(userData)
            // Re-allow PWA install prompt (best practice: re-prompt after meaningful engagement)
            window.dispatchEvent(new CustomEvent('auth-signed-in'))
            break // Success, exit retry loop
          }
        } catch (_userFetchError) {
          // Continue to next retry attempt
          if (attempt === maxRetries - 1) {
            // Last attempt failed, retry in background without blocking
            fetchCurrentUser()
              .then(backgroundUserData => {
                if (backgroundUserData) {
                  setUser(backgroundUserData)
                }
              })
              .catch(() => {
                // Silently fail background retry
              })
          }
        }
      }

      // If we still don't have user data after retries, set loading to false anyway
      // The background retry will update user when it succeeds
      setIsLoading(false)
    } catch (error) {
      setIsLoading(false)
      throw error
    }
  }

  // Register function
  const register = async (data: RegisterData) => {
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        credentials: 'include', // Important: Include cookies in request/response
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          recaptcha_token: data.recaptcha_token,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Registration failed')
      }

      // Tokens are now set in HTTP-only cookies by the backend
      const responseData: AuthResponse = await response.json()

      // Clear any stale token from URL (legacy cleanup)
      const url = new URL(window.location.href)
      if (url.searchParams.has('token')) {
        url.searchParams.delete('token')
        window.history.replaceState({}, '', url.toString())
      }

      setUser(responseData.user)
      setIsLoading(false)

      // Re-allow PWA install prompt (best practice: re-prompt after meaningful engagement)
      window.dispatchEvent(new CustomEvent('auth-signed-in'))

      // Clear trial welcome modal flag for this email to ensure new registrations see the modal
      // This handles the case where a user deletes their account and re-registers with the same email
      if (responseData.user?.email) {
        const trialSeenKey = `trial-welcome-seen-${responseData.user.email}`
        localStorage.removeItem(trialSeenKey)
      }

      // Dispatch event to notify that registration is complete
      // Use setTimeout to ensure React has flushed state updates before event fires
      // This triggers model refetch and trial welcome modal
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('registration-complete'))
      }, 0)
    } catch (error) {
      logger.error('Registration error:', error)
      setIsLoading(false)
      throw error
    }
  }

  // Logout function
  const logout = async () => {
    try {
      // Call logout endpoint to clear cookies on server
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include', // Important: Include cookies in request
      })
    } catch (error) {
      logger.error('Error during logout:', error)
      // Continue with logout even if request fails
    }

    setUser(null)
    setIsLoading(false)
    // Redirect to home page after logout instead of reloading
    // This prevents the offline modal from appearing when logging out from /admin
    window.location.href = '/'
  }

  // Update user data
  const updateUser = (updatedUser: User) => {
    setUser(updatedUser)
  }

  // Refresh user data from server
  const refreshUser = useCallback(async () => {
    const userData = await fetchCurrentUser()
    if (userData) {
      setUser(userData)
    }
  }, [fetchCurrentUser])

  // Initialize auth state on mount
  // Use AbortController for proper cleanup in React StrictMode
  useEffect(() => {
    // Prevent duplicate initialization in React StrictMode
    if (authInitializedRef.current) return
    authInitializedRef.current = true

    const abortController = new AbortController()
    const AUTH_TIMEOUT_MS = 15000

    const timeoutId = setTimeout(() => {
      abortController.abort()
      setIsLoading(false)
      setUser(null)
    }, AUTH_TIMEOUT_MS)

    const initAuth = async () => {
      try {
        // Try to fetch user (cookies are automatically sent)
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include',
          signal: abortController.signal,
        })

        if (abortController.signal.aborted) return

        if (response.ok) {
          clearTimeout(timeoutId)
          const userData = await response.json()
          if (abortController.signal.aborted) return

          setUser(userData)
          setIsLoading(false)
        } else if (response.status === 401) {
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
          })

          if (abortController.signal.aborted) return

          if (refreshResponse.ok) {
            // Refresh succeeded, fetch user again
            const retryResponse = await fetch(`${API_BASE_URL}/auth/me`, {
              credentials: 'include',
              signal: abortController.signal,
            })

            if (abortController.signal.aborted) return

            if (retryResponse.ok) {
              clearTimeout(timeoutId)
              const userData = await retryResponse.json()
              if (abortController.signal.aborted) return

              setUser(userData)
              setIsLoading(false)
            }
          }
          // If refresh failed or retry didn't return user, user remains null
          clearTimeout(timeoutId)
          setIsLoading(false)
        } else {
          // Other error, user not authenticated
          clearTimeout(timeoutId)
          setIsLoading(false)
        }
      } catch (error) {
        clearTimeout(timeoutId)
        // Ignore abort errors (from cleanup or timeout - timeout handler sets loading false)
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        // Network errors, etc. - user not authenticated
        setIsLoading(false)
      }
    }

    initAuth()

    return () => {
      clearTimeout(timeoutId)
      abortController.abort()
      // Reset so initAuth can run again on remount (e.g. React StrictMode double-mount)
      // Without this, the first run gets aborted and the second run exits early, leaving isLoading stuck true
      authInitializedRef.current = false
    }
  }, []) // Only run once on mount

  // Set up token refresh interval (refresh every 14 minutes, tokens expire in 15)
  useEffect(() => {
    if (!user) return

    const interval = setInterval(
      () => {
        refreshToken()
      },
      14 * 60 * 1000
    ) // 14 minutes

    return () => clearInterval(interval)
  }, [user, refreshToken])

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    refreshToken,
    updateUser,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Custom hook to use auth context
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper hook to get auth headers for API calls
// Note: With cookie-based auth, tokens are automatically sent with requests
// This hook is kept for backward compatibility but no longer adds Authorization header
// eslint-disable-next-line react-refresh/only-export-components
export const useAuthHeaders = () => {
  const getHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      // Tokens are now in HTTP-only cookies, automatically sent by browser
    }
  }, [])

  return getHeaders
}
