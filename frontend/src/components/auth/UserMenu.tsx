/**
 * User Menu Component
 * Displays user info and dropdown menu when authenticated
 */

import React, { useState, useRef, useEffect } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import { getCreditAllocation, getDailyCreditLimit, getMonthlyCreditAllocation } from '../../config/constants'
import { getCreditBalance } from '../../services/creditService'
import type { CreditBalance } from '../../services/creditService'
import './UserMenu.css'

type ModalType = 'dashboard' | 'settings' | 'upgrade' | null

export const UserMenu: React.FC = () => {
  const { user, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [isLoadingCredits, setIsLoadingCredits] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Daily model response limits per subscription tier (legacy - for backward compatibility)
  const getDailyLimit = (tier: string): number => {
    const limits = {
      free: 20,
      starter: 50,
      starter_plus: 100,
      pro: 200,
      pro_plus: 400,
    }
    return limits[tier as keyof typeof limits] || 20
  }


  // Fetch credit balance when menu opens
  useEffect(() => {
    if (isOpen && user) {
      setIsLoadingCredits(true)
      getCreditBalance()
        .then((balance) => {
          setCreditBalance(balance)
        })
        .catch((error) => {
          console.error('Failed to fetch credit balance:', error)
          // Fallback to user object data if available
          if (user.monthly_credits_allocated !== undefined) {
            setCreditBalance({
              credits_allocated: user.monthly_credits_allocated || 0,
              credits_used_this_period: user.credits_used_this_period || 0,
              credits_remaining: Math.max(0, (user.monthly_credits_allocated || 0) - (user.credits_used_this_period || 0)),
              total_credits_used: user.total_credits_used,
              credits_reset_at: user.credits_reset_at,
              billing_period_start: user.billing_period_start,
              billing_period_end: user.billing_period_end,
              period_type: user.billing_period_start ? 'monthly' : 'daily',
              subscription_tier: user.subscription_tier,
            })
          }
        })
        .finally(() => {
          setIsLoadingCredits(false)
        })
    }
  }, [isOpen, user])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (activeModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [activeModal])

  if (!user) return null

  const getTierBadgeClass = (tier: string) => {
    switch (tier) {
      case 'pro':
      case 'pro_plus':
        return 'tier-badge-pro'
      case 'starter':
      case 'starter_plus':
        return 'tier-badge-starter'
      default:
        return 'tier-badge-free'
    }
  }

  const getTierDisplay = (tier: string) => {
    switch (tier) {
      case 'pro':
        return 'Pro'
      case 'pro_plus':
        return 'Pro+'
      case 'starter':
        return 'Starter'
      case 'starter_plus':
        return 'Starter+'
      default:
        return 'Free'
    }
  }

  const handleMenuItemClick = (modalType: ModalType) => {
    setActiveModal(modalType)
    setIsOpen(false)
  }

  const closeModal = () => {
    setActiveModal(null)
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-avatar"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user.email.charAt(0).toUpperCase()}
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <div className="user-info">
              <div className="user-email">{user.email}</div>
              <div className="user-tier-row">
                <div className={`tier-badge ${getTierBadgeClass(user.subscription_tier)}`}>
                  {getTierDisplay(user.subscription_tier)}
                </div>
                <div className="daily-limit-info">
                  {creditBalance
                    ? `${creditBalance.credits_allocated} ${creditBalance.period_type === 'monthly' ? 'credits/month' : 'credits/day'}`
                    : user.monthly_credits_allocated
                    ? `${user.monthly_credits_allocated} credits/month`
                    : `${getCreditAllocation(user.subscription_tier)} credits/${getDailyCreditLimit(user.subscription_tier) > 0 ? 'day' : 'month'}`}
                </div>
              </div>
            </div>
          </div>

          <div className="user-menu-divider"></div>

          <div className="usage-section">
            <div className="usage-header">
              {creditBalance?.period_type === 'monthly' ? 'Usage This Month' : 'Usage Today'}
            </div>
            <div className="usage-stats-grid">
              {/* Credits Display (Primary) */}
              <div className="usage-stat">
                <div className="usage-stat-label">Credits</div>
                {isLoadingCredits ? (
                  <div className="usage-stat-value" style={{ opacity: 0.6 }}>
                    Loading...
                  </div>
                ) : creditBalance ? (
                  <>
                    <div className="usage-stat-value">
                      <span className="usage-current">
                        {Math.round(creditBalance.credits_remaining)}
                      </span>
                      <span className="usage-separator">/</span>
                      <span className="usage-limit">
                        {creditBalance.credits_allocated}
                      </span>
                    </div>
                    <div className="usage-progress-bar">
                      <div
                        className="usage-progress-fill"
                        style={{
                          width: `${Math.min(100, (creditBalance.credits_used_this_period / creditBalance.credits_allocated) * 100)}%`,
                        }}
                      ></div>
                    </div>
                    {creditBalance.credits_reset_at && (
                      <div className="usage-reset-info" style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)', marginTop: '0.25rem' }}>
                        Resets {new Date(creditBalance.credits_reset_at).toLocaleDateString()}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="usage-stat-value">
                    <span className="usage-current">
                      {user.credits_used_this_period !== undefined
                        ? Math.round(Math.max(0, (user.monthly_credits_allocated || 0) - (user.credits_used_this_period || 0)))
                        : '—'}
                    </span>
                    <span className="usage-separator">/</span>
                    <span className="usage-limit">
                      {user.monthly_credits_allocated || getCreditAllocation(user.subscription_tier)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Legacy Model Response Display (Hidden by default, can be shown for transition period) */}
            {false && (
              <div className="usage-stat" style={{ marginTop: '0.5rem', opacity: 0.7 }}>
                <div className="usage-stat-label" style={{ fontSize: '0.75rem' }}>
                  Model Responses (Legacy)
                </div>
                <div className="usage-stat-value" style={{ fontSize: '0.875rem' }}>
                  <span className="usage-current">{user.credits_used_this_period || 0}</span>
                  <span className="usage-separator">/</span>
                  <span className="usage-limit">{getDailyLimit(user.subscription_tier)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="user-menu-divider"></div>

          <nav className="user-menu-nav">
            <button className="menu-item" onClick={() => handleMenuItemClick('dashboard')}>
              <span className="menu-icon">
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
                  <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
                </svg>
              </span>
              <span>Dashboard</span>
            </button>
            <button className="menu-item" onClick={() => handleMenuItemClick('upgrade')}>
              <span className="menu-icon">
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
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </span>
              <span>Upgrade Plan</span>
            </button>
            <button className="menu-item" onClick={() => handleMenuItemClick('settings')}>
              <span className="menu-icon">
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
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </span>
              <span>Settings</span>
            </button>
            <a
              href="mailto:support@compareintel.com"
              className="menu-item"
              onClick={() => {
                setIsOpen(false)
              }}
            >
              <span className="menu-icon">
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
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </span>
              <span>Contact Support</span>
            </a>
          </nav>

          <div className="user-menu-divider"></div>

          <button
            className="menu-item logout-btn"
            onClick={() => {
              logout()
              setIsOpen(false)
            }}
          >
            <span className="menu-icon">
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
                <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
            </span>
            <span>Sign Out</span>
          </button>
        </div>
      )}

      {/* Modals */}
      {activeModal === 'dashboard' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content coming-soon-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal} aria-label="Close modal">
              ×
            </button>
            <div className="modal-icon">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
              </svg>
            </div>
            <h2 className="modal-title">Dashboard</h2>
            <p className="modal-description">
              The Dashboard feature is coming soon! Track your usage analytics, view comparison
              history, and gain insights into your AI model evaluations all in one place.
            </p>
            <button className="modal-button-primary" onClick={closeModal}>
              Got it
            </button>
          </div>
        </div>
      )}

      {activeModal === 'settings' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content coming-soon-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal} aria-label="Close modal">
              ×
            </button>
            <div className="modal-icon">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </div>
            <h2 className="modal-title">Settings</h2>
            <p className="modal-description">
              The Settings feature is coming soon! Customize your experience, manage your account
              preferences, and configure notifications to suit your workflow.
            </p>
            <button className="modal-button-primary" onClick={closeModal}>
              Got it
            </button>
          </div>
        </div>
      )}

      {activeModal === 'upgrade' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content upgrade-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal} aria-label="Close modal">
              ×
            </button>
            <div className="upgrade-modal-scrollable">
              <div className="upgrade-modal-header">
                <h2 className="modal-title">Upgrade Your Plan</h2>
                <p className="modal-subtitle">
                  Get more capacity and compare more models simultaneously
                </p>
                <p
                  className="modal-subtitle"
                  style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: '#666' }}
                >
                  You currently have:{' '}
                  <strong>
                    {creditBalance
                      ? `${creditBalance.credits_allocated} ${creditBalance.period_type === 'monthly' ? 'credits/month' : 'credits/day'}`
                      : user.monthly_credits_allocated
                      ? `${user.monthly_credits_allocated} credits/month`
                      : `${getCreditAllocation(user.subscription_tier)} credits/${getDailyCreditLimit(user.subscription_tier) > 0 ? 'day' : 'month'}`}
                  </strong>{' '}
                  • <strong>3 models max</strong> per comparison
                </p>
              </div>

              <div className="pricing-tiers">
                <div className="pricing-tier tier-starter">
                  <div className="tier-header">
                    <h3 className="tier-name">Starter</h3>
                    <div className="tier-badge tier-badge-starter">POPULAR</div>
                  </div>
                  <div className="tier-features">
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>1,200 credits</strong> per month (~240 exchanges/month)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        Compare up to <strong>6 models</strong> simultaneously (2x more)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>10 extended interactions</strong> per day
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">Overage options available</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        Email support (<strong>48-hour</strong> response)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>10 conversations</strong> saved
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pricing-tier tier-starter">
                  <div className="tier-header">
                    <h3 className="tier-name">Starter+</h3>
                  </div>
                  <div className="tier-features">
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>2,500 credits</strong> per month (~500 exchanges/month)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        Compare up to <strong>6 models</strong> simultaneously (2x more)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>20 extended interactions</strong> per day
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">Overage options available</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        Email support (<strong>48-hour</strong> response)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>20 conversations</strong> saved
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pricing-tier tier-pro">
                  <div className="tier-header">
                    <h3 className="tier-name">Pro</h3>
                    <div className="tier-badge tier-badge-pro">BEST VALUE</div>
                  </div>
                  <div className="tier-features">
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>5,000 credits</strong> per month (~1,000 exchanges/month)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        Compare up to <strong>9 models</strong> simultaneously (3x more)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>40 extended interactions</strong> per day
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">Overage options available</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        Priority email support (<strong>24-hour</strong> response)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>40 conversations</strong> saved
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pricing-tier tier-pro">
                  <div className="tier-header">
                    <h3 className="tier-name">Pro+</h3>
                  </div>
                  <div className="tier-features">
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>10,000 credits</strong> per month (~2,000 exchanges/month)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        Compare up to <strong>12 models</strong> simultaneously (4x more)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>80 extended interactions</strong> per day
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">Overage options available</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        Priority email support (<strong>24-hour</strong> response)
                      </span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">
                        <strong>80 conversations</strong> saved
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="upgrade-modal-footer">
                <p className="pricing-notice">
                  💡 <strong>Credit-based pricing:</strong> Credits are calculated based on token usage. 
                  Each comparison uses credits based on the number of models and response size. 
                  Higher tiers give you more monthly credits AND let you compare more models at once!
                </p>
                <p className="pricing-notice" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  <strong>How credits work:</strong> 1 credit = 1,000 effective tokens. 
                  Effective tokens = input tokens + (output tokens × 2.5). 
                  Average comparison uses ~5 credits.
                </p>
                <p className="pricing-notice" style={{ marginTop: '0.75rem' }}>
                  Paid tiers and pricing will be available soon. We're working hard to bring you the
                  best value and features!
                </p>
                <button className="modal-button-primary" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
