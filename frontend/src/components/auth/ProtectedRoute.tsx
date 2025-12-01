/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 */

import React from 'react'

import { useAuth } from '../../contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, fallback }) => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '200px',
        }}
      >
        <div>Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div
        style={{
          textAlign: 'center',
          padding: '2rem',
          maxWidth: '500px',
          margin: '0 auto',
        }}
      >
        <h2>Authentication Required</h2>
        <p>Please sign in to access this feature.</p>
      </div>
    )
  }

  return <>{children}</>
}
