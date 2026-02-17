import { useNavigate, useLocation } from 'react-router-dom'

import { useTheme } from '../../contexts/ThemeContext'
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
  const { theme, toggleTheme } = useTheme()

  // Use React Router navigation if available, fallback to onViewChange prop
  const handleViewChange = (view: 'main' | 'admin') => {
    if (onViewChange) {
      onViewChange(view)
    } else {
      navigate(view === 'admin' ? '/admin' : '/compare')
    }
  }

  // Determine current view from location if not provided
  const actualCurrentView = currentView || (location.pathname === '/admin' ? 'admin' : 'main')

  return (
    <header className="app-header">
      <nav className="navbar">
        <div className="nav-brand">
          <div className="brand-logo">
            <img
              src="/CI_favicon.svg"
              alt="CompareIntel Logo"
              className="logo-icon"
              width="36"
              height="36"
              loading="eager"
            />
            <div className="brand-text">
              <div className="brand-name">CompareIntel</div>
              <span className="brand-tagline">AI Model Comparison Platform</span>
            </div>
          </div>
        </div>

        <div className="nav-actions">
          <button
            className="nav-button theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <button
                  className="admin-avatar-button"
                  onClick={() => handleViewChange(actualCurrentView === 'admin' ? 'main' : 'admin')}
                  title={actualCurrentView === 'admin' ? 'Back to Main App' : 'Admin Panel'}
                  aria-label={actualCurrentView === 'admin' ? 'Back to Main App' : 'Admin Panel'}
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
