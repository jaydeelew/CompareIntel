import { useNavigate, useLocation } from 'react-router-dom'

import { UserMenu } from '../auth'

interface NavigationProps {
  isAuthenticated: boolean
  isAdmin: boolean
  currentView: 'main' | 'admin'
  onViewChange?: (view: 'main' | 'admin') => void // Optional for backward compatibility
  onSignInClick: () => void
  onSignUpClick: () => void
}

/**
 * Navigation - Main navigation bar with logo, brand, and auth actions
 */
export function Navigation({
  isAuthenticated,
  isAdmin,
  currentView,
  onViewChange,
  onSignInClick,
  onSignUpClick,
}: NavigationProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Use React Router navigation if available, fallback to onViewChange prop
  const handleViewChange = (view: 'main' | 'admin') => {
    if (onViewChange) {
      onViewChange(view)
    } else {
      navigate(view === 'admin' ? '/admin' : '/')
    }
  }

  // Determine current view from location if not provided
  const actualCurrentView = currentView || (location.pathname === '/admin' ? 'admin' : 'main')

  return (
    <header className="app-header">
      <nav className="navbar">
        <div className="nav-brand">
          <div className="brand-logo">
            <img src="/CompareIntel.png" alt="CompareIntel Logo" className="logo-icon" />
            <div className="brand-text">
              <h1>CompareIntel</h1>
              <span className="brand-tagline">AI Model Comparison Platform</span>
            </div>
          </div>
        </div>

        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <button
                  className="admin-avatar-button"
                  onClick={() => handleViewChange(actualCurrentView === 'admin' ? 'main' : 'admin')}
                  title={actualCurrentView === 'admin' ? 'Back to Main App' : 'Admin Panel'}
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
                    <path d="M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
                    <path d="M14 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6Z" />
                    <path d="M4 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2Z" />
                    <path d="M14 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2Z" />
                  </svg>
                </button>
              )}
              <UserMenu />
            </>
          ) : (
            <>
              <button
                className="nav-button-text"
                onClick={onSignInClick}
                data-testid="nav-sign-in-button"
              >
                Sign In
              </button>
              <button
                className="nav-button-primary"
                onClick={onSignUpClick}
                data-testid="nav-sign-up-button"
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
