import React from 'react'

import { UserMenu } from '../auth'

/**
 * Header component props
 */
export interface HeaderProps {
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** User object */
  user?: {
    is_admin?: boolean
    email?: string
  } | null
  /** Current view (main or admin) */
  currentView?: 'main' | 'admin'
  /** Callback to toggle admin view */
  onAdminToggle?: () => void
  /** Callback to open auth modal in login mode */
  onSignInClick?: () => void
  /** Callback to open auth modal in register mode */
  onSignUpClick?: () => void
}

/**
 * Application header with navigation and branding
 *
 * @example
 * ```tsx
 * <Header
 *   isAuthenticated={true}
 *   user={user}
 *   currentView="main"
 *   onAdminToggle={() => setCurrentView('admin')}
 * />
 * ```
 */
export const Header: React.FC<HeaderProps> = ({
  isAuthenticated,
  user,
  currentView = 'main',
  onAdminToggle,
  onSignInClick,
  onSignUpClick,
}) => {
  return (
    <header className="app-header">
      <nav className="navbar">
        <div className="nav-brand">
          <div className="brand-logo">
            <img
              src="/CompareIntel-48.webp"
              srcSet="/CompareIntel-48.webp 1x, /CompareIntel-96.webp 2x"
              alt="CompareIntel Logo"
              className="logo-icon"
              width="48"
              height="48"
              loading="eager"
            />
            <div className="brand-text">
              <h1>CompareIntel</h1>
              <span className="brand-tagline">AI Model Comparison Platform</span>
            </div>
          </div>
        </div>

        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              {user?.is_admin && (
                <button
                  className="admin-avatar-button"
                  onClick={onAdminToggle}
                  title={currentView === 'admin' ? 'Back to Main App' : 'Admin Panel'}
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
              <button className="nav-button-text" onClick={onSignInClick}>
                Sign In
              </button>
              <button className="nav-button-primary" onClick={onSignUpClick}>
                Sign Up
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

Header.displayName = 'Header'
