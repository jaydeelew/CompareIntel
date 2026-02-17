import { lazy, Suspense, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { Navigation } from '../components/layout'
import { LoadingSpinner } from '../components/shared'
import { useAuth } from '../contexts/AuthContext'

const AdminPanel = lazy(() => import('../components/admin/AdminPanel'))

/**
 * Admin page - protected route for admin users.
 * Renders the admin panel with navigation. Non-admin users are redirected to /compare.
 */
export function AdminPage() {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated || !user?.is_admin) {
      navigate('/compare', { replace: true })
    }
  }, [isAuthenticated, user, authLoading, navigate])

  if (authLoading || !user?.is_admin) {
    return (
      <div className="app">
        <LoadingSpinner size="large" message="Loading..." />
      </div>
    )
  }

  return (
    <div className="app">
      <Navigation
        isAuthenticated={isAuthenticated}
        isAdmin={true}
        currentView="admin"
        onSignInClick={() => {}}
        onSignUpClick={() => {}}
      />
      <Suspense
        fallback={<LoadingSpinner size="large" modern={true} message="Loading admin panel..." />}
      >
        <AdminPanel onClose={() => navigate('/compare')} />
      </Suspense>
    </div>
  )
}
