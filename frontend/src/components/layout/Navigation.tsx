import { useNavigate, useLocation } from 'react-router-dom'

import { useResponsive } from '../../hooks'
import { UserMenu } from '../auth'

interface NavigationProps {
  isAuthenticated: boolean
  isAdmin: boolean
  currentView: 'main' | 'admin'
  onViewChange?: (view: 'main' | 'admin') => void // Optional for backward compatibility
  onSignInClick: () => void
  onSignUpClick: () => void
  onTutorialClick?: () => void // Optional tutorial replay handler
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
  onTutorialClick,
}: NavigationProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Responsive state from centralized hook
  const { isMobileLayout } = useResponsive()

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
            {/* On mobile, only the icon is clickable to start tutorial */}
            {isMobileLayout && onTutorialClick && !isAuthenticated ? (
              <button
                className="logo-icon-button"
                onClick={onTutorialClick}
                title="Start Tutorial"
                aria-label="Start Tutorial"
              >
                <img
                  src="/CI_favicon.svg"
                  alt="CompareIntel Logo - Tap to start tutorial"
                  className="logo-icon"
                  width="36"
                  height="36"
                  loading="eager"
                />
              </button>
            ) : (
              <img
                src="/CI_favicon.svg"
                alt="CompareIntel Logo"
                className="logo-icon"
                width="36"
                height="36"
                loading="eager"
              />
            )}
            <div className="brand-text">
              <div className="brand-name">CompareIntel</div>
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
              {/* On mobile, tutorial is triggered via logo; on desktop, show button */}
              {onTutorialClick && !isMobileLayout && (
                <button
                  className="nav-button-text nav-button-tutorial"
                  onClick={onTutorialClick}
                  data-testid="nav-tutorial-button"
                  title="Replay tutorial"
                >
                  Tutorial
                </button>
              )}
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
