/**
 * User Menu Component
 * Displays user info and dropdown menu when authenticated
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'

import {
  getCreditAllocation,
  getDailyCreditLimit,
  getModelLimit,
  MONTHLY_CREDIT_ALLOCATIONS,
  OVERAGE_USD_PER_CREDIT,
  TIER_PRICING,
} from '../../config/constants'
import { useAuth } from '../../contexts/AuthContext'
import { apiClient } from '../../services/api/client'
import { ApiError, isCancellationError } from '../../services/api/errors'
import {
  createBillingPortalSession,
  createSubscriptionCheckoutSession,
  getOverageSettings,
  updateOverageSettings,
  type OverageSettings,
  type PaidSubscriptionTier,
} from '../../services/billingService'
import { deleteAllConversations } from '../../services/conversationService'
import { getCreditBalance } from '../../services/creditService'
import type { CreditBalance } from '../../services/creditService'
import {
  getUserPreferences,
  updateUserPreferences,
  USER_PREFERENCES_UPDATED_EVENT,
  REQUEST_PERSIST_IMAGE_COMPOSER_ADVANCED_EVENT,
  REQUEST_PERSIST_TEXT_COMPOSER_ADVANCED_EVENT,
} from '../../services/userSettingsService'
import type { UserPreferences, UserPreferencesUpdate } from '../../services/userSettingsService'
import { SUBSCRIPTION_STATUS } from '../../types/config'
import type { User } from '../../types/user'
import { BILLING_UPDATED_EVENT } from '../../utils/billingSync'
import { formatCreditsResetAtLabel, formatLocaleDate } from '../../utils/date'
import logger from '../../utils/logger'
import { dispatchSaveStateEvent } from '../../utils/sessionState'
import { CreditsFractionInfoTrigger } from '../credits/CreditsFractionInfoTrigger'
import {
  DASHBOARD_CREDITS_EXPLAINER,
  DASHBOARD_OVERAGE_EXPLAINER,
} from '../credits/creditsTooltipCopy'
import './UserMenu.css'

type ModalType = 'dashboard' | 'settings' | 'upgrade' | null

function formatTrialRemainingLabel(trialEndsAt: string | undefined): string | null {
  if (!trialEndsAt) return null
  const end = new Date(trialEndsAt)
  if (Number.isNaN(end.getTime())) return null
  const diff = end.getTime() - Date.now()
  if (diff <= 0) return 'Trial ends today'
  const hours = diff / 3600000
  if (hours < 24) {
    const h = Math.max(1, Math.ceil(hours))
    return h === 1 ? 'About 1 hour left in trial' : `${h} hours left in trial`
  }
  const days = Math.ceil(diff / 86_400_000)
  return `${days} day${days === 1 ? '' : 's'} left in trial`
}

function subscriptionPeriodLabel(period: string | undefined): string {
  if (period === 'yearly') return 'Yearly billing'
  return 'Monthly billing'
}

function billingCycleEndIso(balance: CreditBalance | null, u: User | null): string | null {
  if (!u) return null
  return balance?.billing_period_end ?? u.billing_period_end ?? null
}

function formatOverageCapSummary(balance: CreditBalance): string {
  if (!balance.overage_enabled) return 'Off'
  if (balance.overage_limit_credits == null) return 'On · No cap'
  const usd = balance.overage_limit_credits * OVERAGE_USD_PER_CREDIT
  return `On · Cap ~${balance.overage_limit_credits.toLocaleString()} credits ($${usd.toFixed(2)})`
}

export const UserMenu: React.FC = () => {
  const { user, logout, refreshUser } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [isLoadingCredits, setIsLoadingCredits] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPlacement, setDropdownPlacement] = useState<{
    top: number
    right: number
    width: number
  } | null>(null)
  const upgradeModalSyncDoneRef = useRef(false)
  const userRef = useRef(user)
  userRef.current = user

  // Settings state
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(false)
  const [zipcode, setZipcode] = useState('')
  const [rememberState, setRememberState] = useState(false)
  const [rememberTextAdvanced, setRememberTextAdvanced] = useState(false)
  const [rememberImageAdvanced, setRememberImageAdvanced] = useState(false)
  const [isSavingPreference, setIsSavingPreference] = useState(false)
  const [preferencesError, setPreferencesError] = useState<string | null>(null)
  const [preferencesSuccess, setPreferencesSuccess] = useState<string | null>(null)
  const [isDeletingHistory, setIsDeletingHistory] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [billingBusy, setBillingBusy] = useState<string | null>(null)
  const [billingError, setBillingError] = useState<string | null>(null)

  // Overage settings state
  const [overageSettings, setOverageSettings] = useState<OverageSettings | null>(null)
  const [overageEnabled, setOverageEnabled] = useState(false)
  const [overageLimitMode, setOverageLimitMode] = useState<'unlimited' | 'capped'>('unlimited')
  const [overageDollarInput, setOverageDollarInput] = useState('')
  const [isLoadingOverage, setIsLoadingOverage] = useState(false)
  const [isSavingOverage, setIsSavingOverage] = useState(false)
  const [overageError, setOverageError] = useState<string | null>(null)

  // Fetch credit balance when menu opens
  useEffect(() => {
    if (isOpen && user?.id != null) {
      setIsLoadingCredits(true)
      getCreditBalance()
        .then(balance => {
          setCreditBalance(balance)
        })
        .catch(error => {
          if (isCancellationError(error)) return
          logger.error('Failed to fetch credit balance:', error)
          const u = userRef.current
          if (u?.monthly_credits_allocated !== undefined) {
            setCreditBalance({
              credits_allocated: u.monthly_credits_allocated || 0,
              credits_used_this_period: u.credits_used_this_period || 0,
              credits_remaining: Math.max(
                0,
                (u.monthly_credits_allocated || 0) - (u.credits_used_this_period || 0)
              ),
              total_credits_used: u.total_credits_used,
              credits_reset_at: u.credits_reset_at,
              billing_period_start: u.billing_period_start,
              billing_period_end: u.billing_period_end,
              period_type: u.billing_period_start ? 'monthly' : 'daily',
              subscription_tier: u.subscription_tier,
            })
          }
        })
        .finally(() => {
          setIsLoadingCredits(false)
        })
    }
  }, [isOpen, user?.id])

  useEffect(() => {
    if (activeModal !== 'dashboard' || user?.id == null) return
    getCreditBalance()
      .then(bal => setCreditBalance(bal))
      .catch(error => {
        if (isCancellationError(error)) return
        logger.error('Failed to fetch credits for dashboard:', error)
      })
  }, [activeModal, user?.id])

  const updateDropdownPlacement = useCallback(() => {
    if (!avatarRef.current) return
    const rect = avatarRef.current.getBoundingClientRect()
    setDropdownPlacement({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
      width: Math.min(300, window.innerWidth - 16),
    })
  }, [])

  /** Open/close menu; compute placement synchronously when opening so the portaled panel mounts on the first paint (Firefox/E2E saw a frame with isOpen && !placement). */
  const toggleUserMenu = useCallback(() => {
    setIsOpen(prev => {
      if (!prev && avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect()
        setDropdownPlacement({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right,
          width: Math.min(300, window.innerWidth - 16),
        })
      }
      return !prev
    })
  }, [])

  // Position portaled dropdown (header shell uses overflow:hidden and would clip an in-flow menu)
  useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownPlacement(null)
      return
    }
    updateDropdownPlacement()
  }, [isOpen, updateDropdownPlacement])

  useEffect(() => {
    if (!isOpen) return
    const handler = () => updateDropdownPlacement()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    const app = document.querySelector('.app')
    app?.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
      app?.removeEventListener('scroll', handler, true)
    }
  }, [isOpen, updateDropdownPlacement])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        (containerRef.current?.contains(target) ?? false) ||
        (dropdownRef.current?.contains(target) ?? false)
      ) {
        return
      }
      setIsOpen(false)
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

  useEffect(() => {
    if (user?.id == null) return
    const onBillingUpdated = () => {
      void (async () => {
        try {
          const bal = await getCreditBalance()
          setCreditBalance(bal)
        } catch (error) {
          if (isCancellationError(error)) return
          logger.error('Failed to refresh credits after billing update:', error)
        }
      })()
    }
    window.addEventListener(BILLING_UPDATED_EVENT, onBillingUpdated)
    return () => window.removeEventListener(BILLING_UPDATED_EVENT, onBillingUpdated)
  }, [user?.id])

  useEffect(() => {
    if (activeModal !== 'upgrade') {
      upgradeModalSyncDoneRef.current = false
      return
    }
    if (user?.id == null) return
    if (upgradeModalSyncDoneRef.current) return
    upgradeModalSyncDoneRef.current = true
    void (async () => {
      await refreshUser()
      try {
        const bal = await getCreditBalance()
        setCreditBalance(bal)
      } catch (error) {
        if (isCancellationError(error)) return
        logger.error('Failed to refresh plan/credits when opening upgrade modal:', error)
      }
    })()
  }, [activeModal, user?.id, refreshUser])

  // Load preferences when settings modal opens
  useEffect(() => {
    if (activeModal === 'settings' && user?.id != null) {
      setIsLoadingPreferences(true)
      setPreferencesError(null)
      setPreferencesSuccess(null)
      getUserPreferences()
        .then(prefs => {
          setPreferences(prefs)
          setZipcode(prefs.zipcode || '')
          setRememberState(prefs.remember_state_on_logout)
          setRememberTextAdvanced(prefs.remember_text_advanced_settings)
          setRememberImageAdvanced(prefs.remember_image_advanced_settings)
        })
        .catch(error => {
          logger.error('Failed to load preferences:', error)
          setPreferencesError('Failed to load settings')
        })
        .finally(() => {
          setIsLoadingPreferences(false)
        })
    }
  }, [activeModal, user?.id])

  const persistPartialPreferences = useCallback(
    async (payload: UserPreferencesUpdate, revert?: () => void) => {
      setIsSavingPreference(true)
      setPreferencesError(null)
      try {
        const updated = await updateUserPreferences(payload)
        setPreferences(updated)
        setRememberState(updated.remember_state_on_logout)
        setRememberTextAdvanced(updated.remember_text_advanced_settings)
        setRememberImageAdvanced(updated.remember_image_advanced_settings)
        setZipcode(updated.zipcode || '')
        window.dispatchEvent(new CustomEvent(USER_PREFERENCES_UPDATED_EVENT, { detail: updated }))
        if (payload.remember_text_advanced_settings === true) {
          window.dispatchEvent(new CustomEvent(REQUEST_PERSIST_TEXT_COMPOSER_ADVANCED_EVENT))
        }
        if (payload.remember_image_advanced_settings === true) {
          window.dispatchEvent(new CustomEvent(REQUEST_PERSIST_IMAGE_COMPOSER_ADVANCED_EVENT))
        }
      } catch (error: unknown) {
        logger.error('Failed to save preferences:', error)
        revert?.()
        setPreferencesError(error instanceof Error ? error.message : 'Failed to save settings')
      } finally {
        setIsSavingPreference(false)
      }
    },
    []
  )

  const handleRememberStateToggle = useCallback(() => {
    if (isSavingPreference) return
    const prev = rememberState
    const next = !prev
    setRememberState(next)
    void persistPartialPreferences({ remember_state_on_logout: next }, () => setRememberState(prev))
  }, [rememberState, isSavingPreference, persistPartialPreferences])

  const handleRememberTextAdvancedToggle = useCallback(() => {
    if (isSavingPreference) return
    const prev = rememberTextAdvanced
    const next = !prev
    setRememberTextAdvanced(next)
    if (next) {
      void persistPartialPreferences({ remember_text_advanced_settings: true }, () =>
        setRememberTextAdvanced(prev)
      )
    } else {
      void persistPartialPreferences(
        { remember_text_advanced_settings: false, text_composer_advanced: null },
        () => setRememberTextAdvanced(prev)
      )
    }
  }, [rememberTextAdvanced, isSavingPreference, persistPartialPreferences])

  const handleRememberImageAdvancedToggle = useCallback(() => {
    if (isSavingPreference) return
    const prev = rememberImageAdvanced
    const next = !prev
    setRememberImageAdvanced(next)
    if (next) {
      void persistPartialPreferences({ remember_image_advanced_settings: true }, () =>
        setRememberImageAdvanced(prev)
      )
    } else {
      void persistPartialPreferences(
        { remember_image_advanced_settings: false, image_composer_advanced: null },
        () => setRememberImageAdvanced(prev)
      )
    }
  }, [rememberImageAdvanced, isSavingPreference, persistPartialPreferences])

  const handleZipcodeBlur = useCallback(() => {
    if (!preferences || isSavingPreference) return
    const newVal = zipcode.trim() === '' ? null : zipcode.trim()
    if ((newVal || '') === (preferences.zipcode || '')) return
    const previousZip = preferences.zipcode || ''
    void persistPartialPreferences({ zipcode: newVal }, () => setZipcode(previousZip))
  }, [preferences, zipcode, isSavingPreference, persistPartialPreferences])

  const isPaidTier =
    user?.subscription_tier != null &&
    ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(user.subscription_tier)

  useEffect(() => {
    if (activeModal === 'settings' && user?.id != null && isPaidTier) {
      setIsLoadingOverage(true)
      setOverageError(null)
      getOverageSettings()
        .then(s => {
          setOverageSettings(s)
          setOverageEnabled(s.overage_enabled)
          if (s.overage_spend_limit_cents != null) {
            setOverageLimitMode('capped')
            setOverageDollarInput((s.overage_spend_limit_cents / 100).toFixed(2))
          } else {
            setOverageLimitMode('unlimited')
            setOverageDollarInput('')
          }
        })
        .catch(err => {
          logger.error('Failed to load overage settings:', err)
          setOverageError('Failed to load overage settings')
        })
        .finally(() => setIsLoadingOverage(false))
    }
  }, [activeModal, user?.id, isPaidTier])

  const handleOverageToggle = useCallback(async () => {
    if (isSavingOverage) return
    const next = !overageEnabled
    setOverageEnabled(next)
    setIsSavingOverage(true)
    setOverageError(null)
    try {
      const updated = await updateOverageSettings({ overage_enabled: next })
      setOverageSettings(updated)
      if (!next) {
        setOverageLimitMode('unlimited')
        setOverageDollarInput('')
      }
    } catch {
      setOverageEnabled(!next)
      setOverageError('Failed to update overage setting')
    } finally {
      setIsSavingOverage(false)
    }
  }, [overageEnabled, isSavingOverage])

  const handleOverageLimitModeChange = useCallback(
    async (mode: 'unlimited' | 'capped') => {
      if (isSavingOverage) return
      setOverageLimitMode(mode)
      if (mode === 'unlimited') {
        setIsSavingOverage(true)
        setOverageError(null)
        try {
          const updated = await updateOverageSettings({ overage_limit_mode: 'unlimited' })
          setOverageSettings(updated)
          setOverageDollarInput('')
        } catch {
          setOverageError('Failed to update limit mode')
        } finally {
          setIsSavingOverage(false)
        }
      }
    },
    [isSavingOverage]
  )

  const handleOverageDollarBlur = useCallback(async () => {
    if (isSavingOverage || overageLimitMode !== 'capped') return
    const val = parseFloat(overageDollarInput)
    if (isNaN(val) || val < 0.5) {
      setOverageError('Minimum overage limit is $0.50')
      return
    }
    if (val > 500) {
      setOverageError('Maximum overage limit is $500.00')
      return
    }
    setIsSavingOverage(true)
    setOverageError(null)
    try {
      const updated = await updateOverageSettings({
        overage_limit_mode: 'capped',
        overage_spend_limit_dollars: val,
      })
      setOverageSettings(updated)
      setOverageDollarInput(val.toFixed(2))
    } catch {
      setOverageError('Failed to save spending limit')
    } finally {
      setIsSavingOverage(false)
    }
  }, [overageDollarInput, overageLimitMode, isSavingOverage])

  const overageCreditPreview = (() => {
    const val = parseFloat(overageDollarInput)
    if (isNaN(val) || val <= 0) return null
    return Math.floor(val / OVERAGE_USD_PER_CREDIT)
  })()

  // Handle delete all history
  const handleDeleteAllHistory = useCallback(async () => {
    setIsDeletingHistory(true)
    setPreferencesError(null)
    try {
      const result = await deleteAllConversations()
      setPreferencesSuccess(`${result.deleted_count} conversation(s) deleted`)
      // Invalidate the conversations cache so the UI updates
      apiClient.deleteCache('GET:/conversations')
      setShowDeleteConfirm(false)
      setTimeout(() => setPreferencesSuccess(null), 3000)
    } catch (error: unknown) {
      logger.error('Failed to delete conversations:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete history'
      setPreferencesError(errorMessage)
    } finally {
      setIsDeletingHistory(false)
    }
  }, [])

  const subscribeTier = useCallback(async (tier: PaidSubscriptionTier) => {
    setBillingError(null)
    setBillingBusy(`sub-${tier}`)
    try {
      const url = await createSubscriptionCheckoutSession(tier)
      window.location.href = url
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Checkout could not start.'
      setBillingError(msg)
      setBillingBusy(null)
    }
  }, [])

  const openBillingPortal = useCallback(async () => {
    setBillingError(null)
    setBillingBusy('portal')
    try {
      const url = await createBillingPortalSession()
      window.location.href = url
    } catch (err) {
      await refreshUser()
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Billing portal could not be opened.'
      setBillingError(msg)
      setBillingBusy(null)
    }
  }, [refreshUser])

  const trustedCreditBalance =
    user != null &&
    creditBalance != null &&
    creditBalance.subscription_tier === user.subscription_tier
      ? creditBalance
      : null

  const trialRemainingLabel = useMemo(
    () => (user?.trial_ends_at ? formatTrialRemainingLabel(user.trial_ends_at) : null),
    [user?.trial_ends_at]
  )

  const billingCycleEnd = useMemo(
    () => billingCycleEndIso(trustedCreditBalance, user ?? null),
    [trustedCreditBalance, user]
  )

  const dashboardCreditMetrics = useMemo(() => {
    if (user == null || trustedCreditBalance == null) return null
    const allocated = trustedCreditBalance.credits_allocated
    const used = Math.round(trustedCreditBalance.credits_used_this_period ?? 0)
    const remaining = Math.round(trustedCreditBalance.credits_remaining)
    const pctIncludedUsed =
      allocated > 0 ? Math.min(100, Math.round((used / allocated) * 1000) / 10) : 0
    const poolLow = remaining > 0 && allocated > 0 && remaining / allocated < 0.2
    const poolExhausted = remaining <= 0 && allocated > 0
    const periodWord = trustedCreditBalance.period_type === 'monthly' ? 'month' : 'day'
    return {
      allocated,
      used,
      remaining,
      pctIncludedUsed,
      poolLow,
      poolExhausted,
      periodWord,
    }
  }, [user, trustedCreditBalance])

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
      case 'unregistered':
        return 'Unregistered'
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
    setBillingError(null)
  }

  const canOpenStripeBillingPortal = Boolean(user.stripe_customer_id || user.stripe_subscription_id)

  const usagePeriodLabel =
    trustedCreditBalance?.period_type === 'monthly' || user.billing_period_start
      ? 'Usage This Month'
      : 'Usage Today'

  const showTrialBanner = user.is_trial_active === true && Boolean(user.trial_ends_at)

  const dropdownPanel = (
    <div
      ref={dropdownRef}
      className="user-menu-dropdown user-menu-dropdown--portaled"
      style={
        dropdownPlacement
          ? {
              top: dropdownPlacement.top,
              right: dropdownPlacement.right,
              width: dropdownPlacement.width,
            }
          : undefined
      }
    >
      <div className="user-menu-header">
        <div className="user-info">
          <div className="user-email">{user.email}</div>
          <div className="user-tier-row">
            <div className={`tier-badge ${getTierBadgeClass(user.subscription_tier)}`}>
              {getTierDisplay(user.subscription_tier)}
            </div>
            <div className="daily-limit-info">
              {trustedCreditBalance
                ? `${trustedCreditBalance.credits_allocated} ${trustedCreditBalance.period_type === 'monthly' ? 'credits/month' : 'credits/day'}`
                : user.monthly_credits_allocated
                  ? `${user.monthly_credits_allocated} credits/month`
                  : `${getCreditAllocation(user.subscription_tier)} credits/${getDailyCreditLimit(user.subscription_tier) > 0 ? 'day' : 'month'}`}
            </div>
          </div>
        </div>
      </div>

      {showTrialBanner && trialRemainingLabel ? (
        <div className="trial-countdown-banner" role="status">
          <span className="trial-countdown-icon" aria-hidden>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </span>
          <span className="trial-countdown-text">{trialRemainingLabel}</span>
        </div>
      ) : null}

      <div className="user-menu-divider"></div>

      <div className="usage-section">
        <div className="usage-header">{usagePeriodLabel}</div>
        <div className="usage-stats-grid">
          {/* Credits Display (Primary) */}
          <div className="usage-stat">
            <div className="usage-stat-label">Credits</div>
            {isLoadingCredits ? (
              <div className="usage-stat-value" style={{ opacity: 0.6 }}>
                Loading...
              </div>
            ) : trustedCreditBalance ? (
              <>
                <div className="usage-stat-value">
                  <span className="usage-current">
                    {Math.round(trustedCreditBalance.credits_remaining)}
                  </span>
                  <span className="usage-separator">/</span>
                  <span className="usage-limit">{trustedCreditBalance.credits_allocated}</span>
                  <CreditsFractionInfoTrigger
                    tooltipPlacement="below"
                    className="usage-credits-fraction-info"
                  />
                </div>
                <div className="usage-credits-meta">
                  {Math.round(trustedCreditBalance.credits_used_this_period ?? 0)} used this period
                </div>
                {(trustedCreditBalance.credits_used_this_period ?? 0) > 0 && (
                  <div className="usage-progress-bar">
                    <div
                      className="usage-progress-fill"
                      style={{
                        width: `${Math.min(100, ((trustedCreditBalance.credits_used_this_period ?? 0) / trustedCreditBalance.credits_allocated) * 100)}%`,
                      }}
                    ></div>
                  </div>
                )}
                {trustedCreditBalance.credits_reset_at &&
                  !(
                    isPaidTier &&
                    billingCycleEnd &&
                    trustedCreditBalance.period_type === 'monthly'
                  ) && (
                    <div
                      className="usage-reset-info"
                      style={{
                        fontSize: '0.75rem',
                        marginTop: '0.25rem',
                      }}
                    >
                      Resets{' '}
                      {formatCreditsResetAtLabel(trustedCreditBalance.credits_reset_at, {
                        useUtc: trustedCreditBalance.credits_reset_shows_utc === true,
                      })}
                    </div>
                  )}
              </>
            ) : (
              <div className="usage-stat-value">
                <span className="usage-current">
                  {user.credits_used_this_period !== undefined
                    ? Math.round(
                        Math.max(
                          0,
                          (user.monthly_credits_allocated || 0) -
                            (user.credits_used_this_period || 0)
                        )
                      )
                    : '—'}
                </span>
                <span className="usage-separator">/</span>
                <span className="usage-limit">
                  {user.monthly_credits_allocated || getCreditAllocation(user.subscription_tier)}
                </span>
                <CreditsFractionInfoTrigger
                  tooltipPlacement="below"
                  className="usage-credits-fraction-info"
                />
              </div>
            )}
          </div>
        </div>

        <div className="account-snapshot" aria-label="Billing snapshot">
          <div className="account-snapshot-row">
            <span className="account-snapshot-label">
              {isPaidTier && billingCycleEnd ? 'Billing period ends' : 'Credits reset'}
            </span>
            <span className="account-snapshot-value">
              {isLoadingCredits
                ? '…'
                : isPaidTier && billingCycleEnd
                  ? formatLocaleDate(billingCycleEnd, 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : (trustedCreditBalance?.credits_reset_at ?? user.credits_reset_at)
                    ? formatCreditsResetAtLabel(
                        trustedCreditBalance?.credits_reset_at ?? user.credits_reset_at,
                        {
                          useUtc: trustedCreditBalance?.credits_reset_shows_utc === true,
                        }
                      )
                    : '—'}
            </span>
          </div>
          {isPaidTier ? (
            trustedCreditBalance ? (
              <>
                <div className="account-snapshot-row">
                  <span className="account-snapshot-label">Overage billing</span>
                  <span className="account-snapshot-value account-snapshot-value--small">
                    {formatOverageCapSummary(trustedCreditBalance)}
                  </span>
                </div>
                <div className="account-snapshot-row account-snapshot-row--overage">
                  <span className="account-snapshot-label">Overage used</span>
                  <span className="account-snapshot-value">
                    <span
                      className={
                        (trustedCreditBalance.overage_credits_used_this_period ?? 0) > 0
                          ? 'overage-active-text snapshot-numeric'
                          : 'snapshot-numeric'
                      }
                    >
                      {(
                        trustedCreditBalance.overage_credits_used_this_period ?? 0
                      ).toLocaleString()}{' '}
                      credits
                    </span>
                    {(trustedCreditBalance.overage_credits_used_this_period ?? 0) > 0 ? (
                      <span className="overage-cost-badge">
                        ~$
                        {(
                          (trustedCreditBalance.overage_credits_used_this_period ?? 0) *
                          OVERAGE_USD_PER_CREDIT
                        ).toFixed(2)}
                      </span>
                    ) : null}
                  </span>
                </div>
                {trustedCreditBalance.overage_enabled === true &&
                trustedCreditBalance.overage_limit_credits != null ? (
                  <div className="usage-progress-bar account-snapshot-progress">
                    <div
                      className="usage-progress-fill overage-progress"
                      style={{
                        width: `${Math.min(
                          100,
                          ((trustedCreditBalance.overage_credits_used_this_period ?? 0) /
                            trustedCreditBalance.overage_limit_credits) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="account-snapshot-row">
                <span className="account-snapshot-label">Overage billing</span>
                <span className="account-snapshot-value account-snapshot-muted">
                  {isLoadingCredits ? '…' : '—'}
                </span>
              </div>
            )
          ) : null}
        </div>

        {/* Legacy Model Response Display (Hidden by default, can be shown for transition period) */}
        {/* eslint-disable-next-line no-constant-binary-expression */}
        {false && user && (
          <div className="usage-stat" style={{ marginTop: '0.5rem', opacity: 0.7 }}>
            <div className="usage-stat-label" style={{ fontSize: '0.75rem' }}>
              Model Responses (Legacy)
            </div>
            <div className="usage-stat-value" style={{ fontSize: '0.875rem' }}>
              <span className="usage-current">{user!.credits_used_this_period ?? 0}</span>
              <span className="usage-separator">/</span>
              <span className="usage-limit">{getDailyCreditLimit(user!.subscription_tier)}</span>
            </div>
          </div>
        )}

        {/* Burn-rate projection (paid monthly tiers) */}
        {isPaidTier &&
          trustedCreditBalance?.period_type === 'monthly' &&
          (() => {
            const periodStart = trustedCreditBalance.billing_period_start
              ? new Date(trustedCreditBalance.billing_period_start)
              : null
            const periodEnd = trustedCreditBalance.credits_reset_at
              ? new Date(trustedCreditBalance.credits_reset_at)
              : null
            if (!periodStart || !periodEnd) return null
            const now = new Date()
            const daysElapsed = Math.max(1, (now.getTime() - periodStart.getTime()) / 86_400_000)
            const used = trustedCreditBalance.credits_used_this_period ?? 0
            if (used <= 0) return null
            const dailyBurn = used / daysElapsed
            const remaining = trustedCreditBalance.credits_remaining
            const daysUntilEmpty = dailyBurn > 0 ? remaining / dailyBurn : Infinity
            const exhaustionDate = new Date(now.getTime() + daysUntilEmpty * 86_400_000)
            const daysLeft = Math.round((periodEnd.getTime() - now.getTime()) / 86_400_000)
            const willExhaustBeforePeriodEnd = daysUntilEmpty < daysLeft && remaining > 0
            if (!willExhaustBeforePeriodEnd && remaining > 0) return null

            return (
              <div className="burn-rate-projection">
                <span className="burn-rate-icon">📊</span>
                <span>
                  ~{Math.round(dailyBurn)} credits/day
                  {remaining > 0 && daysUntilEmpty < 999
                    ? ` · runs out ~${exhaustionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : remaining <= 0
                      ? ' · pool exhausted'
                      : ''}
                  {trustedCreditBalance.overage_enabled && remaining <= 0
                    ? ' · overage active'
                    : !trustedCreditBalance.overage_enabled && willExhaustBeforePeriodEnd
                      ? ' · enable overages in Settings'
                      : ''}
                </span>
              </div>
            )
          })()}
      </div>

      <nav className="user-menu-nav user-menu-nav--usage-follow">
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
        onClick={async () => {
          // Check if user wants to remember state on logout
          if (preferences?.remember_state_on_logout || rememberState) {
            // Dispatch event to save state before logout
            dispatchSaveStateEvent()
            // Small delay to ensure state is saved
            await new Promise(resolve => setTimeout(resolve, 50))
          }
          logout()
          setIsOpen(false)
        }}
        data-testid="logout-button"
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
  )

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        ref={avatarRef}
        className="user-avatar"
        onClick={toggleUserMenu}
        aria-expanded={isOpen}
        aria-haspopup="true"
        data-testid="user-menu-button"
      >
        {user.email.charAt(0).toUpperCase()}
      </button>

      {isOpen && dropdownPlacement && createPortal(dropdownPanel, document.body)}

      {/* Modals - rendered via portal to body for correct positioning */}
      {activeModal === 'dashboard' &&
        createPortal(
          <div className="modal-overlay" onClick={closeModal}>
            <div
              className="modal-content settings-modal dashboard-modal"
              onClick={e => e.stopPropagation()}
            >
              <button className="modal-close" onClick={closeModal} aria-label="Close modal">
                ×
              </button>
              <div className="settings-modal-header dashboard-modal-header">
                <div className="modal-icon">
                  <svg
                    width="48"
                    height="48"
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
                <div className="dashboard-modal-header-text">
                  <h2 className="modal-title">Account overview</h2>
                  <p className="modal-subtitle dashboard-modal-email">{user.email}</p>
                </div>
              </div>

              <div className="settings-modal-body dashboard-modal-body">
                <div className="settings-content dashboard-content">
                  <p className="dashboard-lede">
                    Your plan, included usage, and billing—explained without the jargon.
                  </p>

                  {user.subscription_status !== SUBSCRIPTION_STATUS.ACTIVE ? (
                    <div className="settings-message dashboard-status-banner" role="status">
                      <span>
                        <strong>Heads up:</strong> your subscription is listed as{' '}
                        <strong>
                          {user.subscription_status === SUBSCRIPTION_STATUS.CANCELLED
                            ? 'cancelled'
                            : user.subscription_status === SUBSCRIPTION_STATUS.EXPIRED
                              ? 'expired'
                              : user.subscription_status}
                        </strong>
                        . Use <strong>Manage billing</strong> for invoices and payment methods, or{' '}
                        <strong>Upgrade plan</strong> to pick a new tier.
                      </span>
                    </div>
                  ) : null}

                  <section className="dashboard-hero-card" aria-label="Usage summary">
                    <div className="dashboard-hero-top">
                      <div className="dashboard-hero-plan">
                        <div className="dashboard-hero-plan-row">
                          <div
                            className={`tier-badge ${getTierBadgeClass(user.subscription_tier)}`}
                          >
                            {getTierDisplay(user.subscription_tier)}
                          </div>
                          {isPaidTier ? (
                            <span className="dashboard-hero-billing-tag">
                              {subscriptionPeriodLabel(user.subscription_period)}
                            </span>
                          ) : (
                            <span className="dashboard-hero-billing-tag dashboard-hero-billing-tag--muted">
                              Free plan
                            </span>
                          )}
                        </div>
                        <p className="dashboard-hero-plan-caption">
                          {isPaidTier
                            ? 'Paid plan with a monthly pool of included credits, then optional pay-as-you-go.'
                            : 'Daily included credits for comparisons. Upgrade anytime for a larger monthly pool.'}
                        </p>
                      </div>
                      {showTrialBanner && trialRemainingLabel ? (
                        <div className="dashboard-hero-trial-chip" role="status">
                          <span className="dashboard-hero-trial-chip-icon" aria-hidden>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                          </span>
                          <span>{trialRemainingLabel}</span>
                        </div>
                      ) : null}
                    </div>

                    {trustedCreditBalance && dashboardCreditMetrics ? (
                      <>
                        <div className="dashboard-hero-meter">
                          <div className="dashboard-hero-stat">
                            <span className="dashboard-hero-stat-label">
                              Included credits left
                              <CreditsFractionInfoTrigger
                                tooltipPlacement="below"
                                className="dashboard-hero-info-trigger"
                              />
                            </span>
                            <span className="dashboard-hero-stat-value">
                              {dashboardCreditMetrics.remaining.toLocaleString()}
                            </span>
                            <span className="dashboard-hero-stat-sub">
                              of {dashboardCreditMetrics.allocated.toLocaleString()} this{' '}
                              {dashboardCreditMetrics.periodWord} ·{' '}
                              {dashboardCreditMetrics.used.toLocaleString()} used
                            </span>
                          </div>
                          <div className="dashboard-hero-progress-block">
                            <div className="usage-progress-bar dashboard-hero-progress-bar">
                              <div
                                className={`usage-progress-fill${
                                  dashboardCreditMetrics.poolLow
                                    ? ' dashboard-progress-fill--warn'
                                    : ''
                                }${
                                  dashboardCreditMetrics.poolExhausted
                                    ? ' dashboard-progress-fill--drain'
                                    : ''
                                }`}
                                style={{
                                  width: `${dashboardCreditMetrics.pctIncludedUsed}%`,
                                }}
                              />
                            </div>
                            <div className="dashboard-hero-progress-foot">
                              <span>
                                {dashboardCreditMetrics.pctIncludedUsed}% of your included pool used
                              </span>
                              {dashboardCreditMetrics.poolExhausted &&
                              isPaidTier &&
                              trustedCreditBalance.overage_enabled ? (
                                <span className="dashboard-hero-progress-foot-note">
                                  Pool exhausted — extra usage is pay-as-you-go
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {dashboardCreditMetrics.poolLow && !dashboardCreditMetrics.poolExhausted ? (
                          <div className="dashboard-callout dashboard-callout--warn" role="status">
                            <span className="dashboard-callout-icon" aria-hidden>
                              !
                            </span>
                            <p>
                              <strong>Running low.</strong> You have less than 20% of this period’s
                              included credits left. Consider upgrading for a larger pool, or pace
                              usage until your included credits refresh.
                            </p>
                          </div>
                        ) : null}

                        {dashboardCreditMetrics.poolExhausted && isPaidTier ? (
                          trustedCreditBalance.overage_enabled ? (
                            <div
                              className="dashboard-callout dashboard-callout--info"
                              role="status"
                            >
                              <span className="dashboard-callout-icon" aria-hidden>
                                ✓
                              </span>
                              <p>
                                <strong>Included pool used.</strong> Pay-as-you-go is on, so you can
                                keep comparing. Extra credits are billed at{' '}
                                <strong>${OVERAGE_USD_PER_CREDIT}</strong> each on your next
                                invoice. Review your cap in Settings.
                              </p>
                            </div>
                          ) : (
                            <div
                              className="dashboard-callout dashboard-callout--warn"
                              role="status"
                            >
                              <span className="dashboard-callout-icon" aria-hidden>
                                !
                              </span>
                              <p>
                                <strong>Included pool used.</strong> Comparisons are blocked until
                                your credits reset unless you turn on pay-as-you-go in{' '}
                                <strong>Settings</strong>, or upgrade for a bigger monthly
                                allowance.
                              </p>
                            </div>
                          )
                        ) : null}

                        {dashboardCreditMetrics.poolExhausted && !isPaidTier ? (
                          <div className="dashboard-callout dashboard-callout--info" role="status">
                            <span className="dashboard-callout-icon" aria-hidden>
                              i
                            </span>
                            <p>
                              <strong>Daily limit reached.</strong> Your included credits refresh on
                              the schedule below. For more room each day and premium features,
                              consider upgrading.
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="dashboard-hero-loading">
                        <div className="settings-spinner" aria-hidden />
                        <span>Loading your usage…</span>
                      </div>
                    )}
                  </section>

                  {showTrialBanner && user.trial_ends_at ? (
                    <p className="dashboard-trial-footnote">
                      Trial access to premium models ends on{' '}
                      <strong>
                        {formatLocaleDate(user.trial_ends_at, 'en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </strong>
                      . After that, your account follows the Free plan unless you subscribe.
                    </p>
                  ) : null}

                  <div className="dashboard-panels">
                    <section
                      className="dashboard-panel dashboard-panel--guide"
                      aria-labelledby="dash-credits-guide"
                    >
                      <h3 className="dashboard-panel-title" id="dash-credits-guide">
                        How credits work
                      </h3>
                      <p className="dashboard-panel-body">{DASHBOARD_CREDITS_EXPLAINER}</p>
                      <p className="dashboard-panel-tip">
                        <strong>Tip:</strong> More models in one comparison use more credits than a
                        single-model run. Check your selections before you send.
                      </p>
                    </section>

                    <section className="dashboard-panel" aria-labelledby="dash-period">
                      <h3 className="dashboard-panel-title" id="dash-period">
                        This period
                      </h3>
                      {trustedCreditBalance && dashboardCreditMetrics ? (
                        <ul className="dashboard-checklist">
                          <li>
                            <span className="dashboard-checklist-label">Resets</span>
                            <span className="dashboard-checklist-value">
                              {isPaidTier && billingCycleEnd ? (
                                <>
                                  {formatLocaleDate(billingCycleEnd, 'en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}{' '}
                                  <span className="dashboard-checklist-hint">(period end)</span>
                                </>
                              ) : trustedCreditBalance.credits_reset_at ? (
                                formatCreditsResetAtLabel(trustedCreditBalance.credits_reset_at, {
                                  useUtc: trustedCreditBalance.credits_reset_shows_utc === true,
                                })
                              ) : (
                                '—'
                              )}
                            </span>
                          </li>
                          <li>
                            <span className="dashboard-checklist-label">Included used</span>
                            <span className="dashboard-checklist-value">
                              {dashboardCreditMetrics.used.toLocaleString()} /{' '}
                              {dashboardCreditMetrics.allocated.toLocaleString()}
                            </span>
                          </li>
                          <li>
                            <span className="dashboard-checklist-label">Remaining</span>
                            <span className="dashboard-checklist-value dashboard-checklist-value--accent">
                              {dashboardCreditMetrics.remaining.toLocaleString()}
                            </span>
                          </li>
                          {user.total_credits_used != null ? (
                            <li>
                              <span className="dashboard-checklist-label">Lifetime total</span>
                              <span className="dashboard-checklist-value">
                                {user.total_credits_used.toLocaleString()} credits
                              </span>
                            </li>
                          ) : null}
                        </ul>
                      ) : (
                        <p className="dashboard-panel-body">Loading…</p>
                      )}
                    </section>
                  </div>

                  {isPaidTier ? (
                    <section
                      className="dashboard-panel dashboard-panel--overage"
                      aria-labelledby="dash-overage"
                    >
                      <h3 className="dashboard-panel-title" id="dash-overage">
                        After your included credits
                      </h3>
                      {trustedCreditBalance ? (
                        <>
                          <p className="dashboard-panel-body">{DASHBOARD_OVERAGE_EXPLAINER}</p>
                          <div className="dashboard-overage-grid">
                            <div className="dashboard-overage-item">
                              <span className="dashboard-overage-item-label">Pay-as-you-go</span>
                              <span className="dashboard-overage-item-value">
                                {trustedCreditBalance.overage_enabled ? (
                                  <span className="dashboard-status-pill dashboard-status-pill--on">
                                    On
                                  </span>
                                ) : (
                                  <span className="dashboard-status-pill dashboard-status-pill--off">
                                    Off
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="dashboard-overage-item">
                              <span className="dashboard-overage-item-label">Spending cap</span>
                              <span className="dashboard-overage-item-value">
                                {trustedCreditBalance.overage_enabled ? (
                                  trustedCreditBalance.overage_limit_credits == null ? (
                                    'No cap (monitor usage in Settings)'
                                  ) : (
                                    <>
                                      ~{trustedCreditBalance.overage_limit_credits.toLocaleString()}{' '}
                                      credits (~$
                                      {(
                                        trustedCreditBalance.overage_limit_credits *
                                        OVERAGE_USD_PER_CREDIT
                                      ).toFixed(2)}
                                      )
                                    </>
                                  )
                                ) : (
                                  '—'
                                )}
                              </span>
                            </div>
                            <div className="dashboard-overage-item">
                              <span className="dashboard-overage-item-label">Overage used</span>
                              <span
                                className={`dashboard-overage-item-value${
                                  (trustedCreditBalance.overage_credits_used_this_period ?? 0) > 0
                                    ? ' dashboard-overage-item-value--highlight'
                                    : ''
                                }`}
                              >
                                {(
                                  trustedCreditBalance.overage_credits_used_this_period ?? 0
                                ).toLocaleString()}{' '}
                                credits (~$
                                {(
                                  (trustedCreditBalance.overage_credits_used_this_period ?? 0) *
                                  OVERAGE_USD_PER_CREDIT
                                ).toFixed(2)}
                                )
                              </span>
                            </div>
                            <div className="dashboard-overage-item">
                              <span className="dashboard-overage-item-label">Rate</span>
                              <span className="dashboard-overage-item-value">
                                ${OVERAGE_USD_PER_CREDIT} per credit
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="dashboard-panel-body">Loading overage details…</p>
                      )}
                    </section>
                  ) : (
                    <section
                      className="dashboard-panel dashboard-panel--upgrade-nudge"
                      aria-labelledby="dash-paid-nudge"
                    >
                      <h3 className="dashboard-panel-title" id="dash-paid-nudge">
                        Need more room or pay-as-you-go?
                      </h3>
                      <p className="dashboard-panel-body">
                        Paid plans include a larger <strong>monthly</strong> pool of included
                        credits and optional pay-as-you-go after that, with a cap you control.
                        Upgrade to choose a tier that fits how often you compare models.
                      </p>
                    </section>
                  )}

                  <footer className="dashboard-rail" aria-label="Quick actions">
                    <span className="dashboard-rail-label">Jump to</span>
                    <div className="dashboard-rail-links">
                      <button
                        type="button"
                        className="dashboard-rail-link"
                        onClick={() => {
                          setActiveModal('settings')
                        }}
                      >
                        Account &amp; overage settings
                      </button>
                      <span className="dashboard-rail-sep" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        className="dashboard-rail-link"
                        onClick={() => setActiveModal('upgrade')}
                      >
                        Compare plans &amp; upgrade
                      </button>
                      {canOpenStripeBillingPortal ? (
                        <>
                          <span className="dashboard-rail-sep" aria-hidden>
                            ·
                          </span>
                          <button
                            type="button"
                            className="dashboard-rail-link"
                            disabled={billingBusy !== null}
                            onClick={() => void openBillingPortal()}
                          >
                            Invoices &amp; payment methods
                          </button>
                        </>
                      ) : null}
                    </div>
                  </footer>
                </div>
              </div>

              <div className="settings-modal-footer dashboard-modal-footer">
                {billingError ? (
                  <div className="settings-message settings-error dashboard-footer-error">
                    {billingError}
                  </div>
                ) : null}
                <div className="dashboard-footer-actions">
                  <div className="dashboard-footer-actions-start">
                    <button
                      type="button"
                      className="dashboard-footer-btn dashboard-footer-btn--secondary"
                      onClick={closeModal}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="dashboard-footer-btn dashboard-footer-btn--secondary"
                      onClick={() => setActiveModal('settings')}
                    >
                      Settings
                    </button>
                  </div>
                  <div className="dashboard-footer-actions-end">
                    {canOpenStripeBillingPortal ? (
                      <button
                        type="button"
                        className="dashboard-footer-btn dashboard-footer-btn--primary"
                        disabled={billingBusy !== null}
                        onClick={() => void openBillingPortal()}
                      >
                        {billingBusy === 'portal' ? 'Opening…' : 'Manage billing'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={
                        canOpenStripeBillingPortal
                          ? 'dashboard-footer-btn dashboard-footer-btn--secondary'
                          : 'dashboard-footer-btn dashboard-footer-btn--primary'
                      }
                      onClick={() => setActiveModal('upgrade')}
                    >
                      {isPaidTier ? 'Change plan' : 'View plans & upgrade'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {activeModal === 'settings' &&
        createPortal(
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={closeModal} aria-label="Close modal">
                ×
              </button>
              <div className="settings-modal-header">
                <div className="modal-icon">
                  <svg
                    width="48"
                    height="48"
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
              </div>

              <div className="settings-modal-body">
                {isLoadingPreferences ? (
                  <div className="settings-loading">
                    <div className="settings-spinner" />
                    <span>Loading settings...</span>
                  </div>
                ) : (
                  <div className="settings-content">
                    {/* Status Messages */}
                    {preferencesError && (
                      <div className="settings-message settings-error">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        {preferencesError}
                      </div>
                    )}
                    {preferencesSuccess && (
                      <div className="settings-message settings-success">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        {preferencesSuccess}
                      </div>
                    )}

                    {/* Location Settings */}
                    <div className="settings-section">
                      <h3 className="settings-section-title">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        Location
                      </h3>
                      <div className="settings-item">
                        <div className="settings-item-info">
                          <label htmlFor="zipcode-input" className="settings-label">
                            Zipcode
                          </label>
                          <p className="settings-description">
                            Enter your zipcode for more precise location-based model results
                          </p>
                        </div>
                        <input
                          id="zipcode-input"
                          type="text"
                          className="settings-input"
                          placeholder="12345"
                          value={zipcode}
                          onChange={e => setZipcode(e.target.value)}
                          onBlur={handleZipcodeBlur}
                          maxLength={10}
                          disabled={isSavingPreference}
                        />
                      </div>
                    </div>

                    {/* Session Settings */}
                    <div className="settings-section">
                      <h3 className="settings-section-title">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                        </svg>
                        Session
                      </h3>
                      <div className="settings-item settings-item-toggle">
                        <div className="settings-item-info">
                          <span className="settings-label">Remember state on logout</span>
                          <p className="settings-description">
                            Preserve model responses, model selections, follow-up mode, text
                            entered, and web search state when you log out
                          </p>
                        </div>
                        <button
                          className={`settings-toggle ${rememberState ? 'active' : ''}`}
                          onClick={handleRememberStateToggle}
                          aria-pressed={rememberState}
                          role="switch"
                          type="button"
                          disabled={isSavingPreference}
                          aria-busy={isSavingPreference}
                        >
                          <span className="settings-toggle-slider" />
                        </button>
                      </div>
                    </div>

                    {/* Composer advanced settings persistence */}
                    <div className="settings-section">
                      <h3 className="settings-section-title">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        Comparison defaults
                      </h3>
                      <div className="settings-item settings-item-toggle">
                        <div className="settings-item-info">
                          <span className="settings-label">
                            Remember text model advanced settings
                          </span>
                          <p className="settings-description">
                            Save temperature, top P, and max tokens to your account so they return
                            after a refresh or the next time you sign in. When off, those values are
                            not stored on the server; they still apply for the rest of this visit.
                          </p>
                        </div>
                        <button
                          className={`settings-toggle ${rememberTextAdvanced ? 'active' : ''}`}
                          onClick={handleRememberTextAdvancedToggle}
                          aria-pressed={rememberTextAdvanced}
                          role="switch"
                          type="button"
                          disabled={isSavingPreference}
                          aria-busy={isSavingPreference}
                        >
                          <span className="settings-toggle-slider" />
                        </button>
                      </div>
                      <div className="settings-item settings-item-toggle">
                        <div className="settings-item-info">
                          <span className="settings-label">
                            Remember image model advanced settings
                          </span>
                          <p className="settings-description">
                            Keep aspect ratio and image size across page refreshes and future
                            logins.
                          </p>
                        </div>
                        <button
                          className={`settings-toggle ${rememberImageAdvanced ? 'active' : ''}`}
                          onClick={handleRememberImageAdvancedToggle}
                          aria-pressed={rememberImageAdvanced}
                          role="switch"
                          type="button"
                          disabled={isSavingPreference}
                          aria-busy={isSavingPreference}
                        >
                          <span className="settings-toggle-slider" />
                        </button>
                      </div>
                    </div>

                    {/* Billing & Overages (paid tiers only) */}
                    {isPaidTier && (
                      <div className="settings-section">
                        <h3 className="settings-section-title">
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                            <line x1="1" y1="10" x2="23" y2="10" />
                          </svg>
                          Billing &amp; Overages
                        </h3>

                        {canOpenStripeBillingPortal && (
                          <div className="settings-billing-manage-row">
                            <button
                              type="button"
                              className="modal-button-primary settings-manage-billing-btn"
                              disabled={billingBusy !== null}
                              onClick={() => openBillingPortal()}
                            >
                              {billingBusy === 'portal' ? 'Opening…' : 'Manage Billing'}
                            </button>
                          </div>
                        )}

                        {billingError && (
                          <div
                            className="settings-message settings-error"
                            style={{ marginBottom: '0.75rem' }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <line x1="15" y1="9" x2="9" y2="15" />
                              <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            {billingError}
                          </div>
                        )}

                        <p className="settings-description" style={{ marginBottom: '0.75rem' }}>
                          When your monthly credits run out, overages let you keep using the service
                          at <strong>${OVERAGE_USD_PER_CREDIT}/credit</strong> ( ~
                          {Math.floor(1 / OVERAGE_USD_PER_CREDIT)} credits per $1). Overage usage
                          resets each billing period.
                        </p>

                        {isLoadingOverage ? (
                          <div className="settings-loading" style={{ padding: '0.5rem 0' }}>
                            <div className="settings-spinner" />
                            <span>Loading overage settings...</span>
                          </div>
                        ) : (
                          <>
                            <div className="settings-item settings-item-toggle">
                              <div className="settings-item-info">
                                <span className="settings-label">Enable overages</span>
                                <p className="settings-description">
                                  Allow pay-as-you-go usage after your monthly credit pool is
                                  exhausted. Charged at the overage rate on your next invoice.
                                </p>
                              </div>
                              <button
                                className={`settings-toggle ${overageEnabled ? 'active' : ''}`}
                                onClick={handleOverageToggle}
                                aria-pressed={overageEnabled}
                                role="switch"
                                type="button"
                                disabled={isSavingOverage}
                                aria-busy={isSavingOverage}
                              >
                                <span className="settings-toggle-slider" />
                              </button>
                            </div>

                            {overageEnabled && (
                              <div className="overage-limit-section">
                                <span className="settings-label">Overages Spending Limit</span>
                                <div className="overage-limit-options">
                                  <label className="overage-radio-label">
                                    <input
                                      type="radio"
                                      name="overage-limit"
                                      checked={overageLimitMode === 'unlimited'}
                                      onChange={() => handleOverageLimitModeChange('unlimited')}
                                      disabled={isSavingOverage}
                                    />
                                    <span>No limit (pay as you go until period ends)</span>
                                  </label>
                                  <label className="overage-radio-label">
                                    <input
                                      type="radio"
                                      name="overage-limit"
                                      checked={overageLimitMode === 'capped'}
                                      onChange={() => handleOverageLimitModeChange('capped')}
                                      disabled={isSavingOverage}
                                    />
                                    <span>Set a spending cap</span>
                                  </label>
                                  {overageLimitMode === 'capped' && (
                                    <div className="overage-dollar-input-row">
                                      <div className="overage-dollar-input-wrapper">
                                        <span className="overage-dollar-prefix">$</span>
                                        <input
                                          type="number"
                                          className="settings-input overage-dollar-input"
                                          placeholder="0.00"
                                          value={overageDollarInput}
                                          onChange={e => setOverageDollarInput(e.target.value)}
                                          onBlur={handleOverageDollarBlur}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleOverageDollarBlur()
                                          }}
                                          min="0.50"
                                          max="500"
                                          step="0.50"
                                          disabled={isSavingOverage}
                                        />
                                      </div>
                                      {overageCreditPreview != null && (
                                        <span className="overage-credit-preview">
                                          ≈ {overageCreditPreview.toLocaleString()} additional
                                          credits
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {overageSettings &&
                                  overageSettings.overage_credits_used_this_period > 0 && (
                                    <div className="overage-usage-summary">
                                      <span className="overage-usage-label">
                                        Overage this period:
                                      </span>
                                      <span className="overage-usage-value">
                                        {overageSettings.overage_credits_used_this_period.toLocaleString()}{' '}
                                        credits ($
                                        {(
                                          overageSettings.overage_credits_used_this_period *
                                          OVERAGE_USD_PER_CREDIT
                                        ).toFixed(2)}
                                        )
                                      </span>
                                    </div>
                                  )}
                              </div>
                            )}

                            {overageError && (
                              <div
                                className="settings-message settings-error"
                                style={{ marginTop: '0.5rem' }}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="15" y1="9" x2="9" y2="15" />
                                  <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                                {overageError}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Danger Zone - Delete History */}
                    <div className="settings-section settings-danger-zone">
                      <h3 className="settings-section-title danger">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Danger Zone
                      </h3>
                      <div className="settings-item">
                        <div className="settings-item-info">
                          <span className="settings-label">Delete all comparison history</span>
                          <p className="settings-description">
                            Permanently delete all your saved model comparison conversations. This
                            action cannot be undone.
                          </p>
                        </div>
                        {!showDeleteConfirm ? (
                          <button
                            className="settings-delete-btn"
                            onClick={() => setShowDeleteConfirm(true)}
                          >
                            Delete All
                          </button>
                        ) : (
                          <div className="settings-delete-confirm">
                            <span className="settings-delete-warning">Are you sure?</span>
                            <button
                              className="settings-delete-btn confirm"
                              onClick={handleDeleteAllHistory}
                              disabled={isDeletingHistory}
                            >
                              {isDeletingHistory ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                            <button
                              className="settings-delete-btn cancel"
                              onClick={() => setShowDeleteConfirm(false)}
                              disabled={isDeletingHistory}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="settings-modal-footer">
                <button className="modal-button-secondary" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {activeModal === 'upgrade' &&
        createPortal(
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
                    <strong>Current plan:</strong> {getTierDisplay(user.subscription_tier)}
                    {user.subscription_status && user.subscription_status !== 'active' ? (
                      <>
                        {' '}
                        <span style={{ color: '#666' }}>({user.subscription_status})</span>
                      </>
                    ) : null}
                  </p>
                  <p
                    className="modal-subtitle"
                    style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: '#666' }}
                  >
                    You currently have:{' '}
                    <strong>
                      {trustedCreditBalance
                        ? `${trustedCreditBalance.credits_allocated} ${trustedCreditBalance.period_type === 'monthly' ? 'credits/month' : 'credits/day'}`
                        : user.monthly_credits_allocated
                          ? `${user.monthly_credits_allocated} credits/month`
                          : `${getCreditAllocation(user.subscription_tier)} credits/${getDailyCreditLimit(user.subscription_tier) > 0 ? 'day' : 'month'}`}
                    </strong>{' '}
                    • <strong>{getModelLimit(user.subscription_tier)} models max</strong> per
                    comparison
                  </p>
                </div>

                <div className="pricing-tiers">
                  <div
                    className={`pricing-tier tier-starter${user.subscription_tier === 'starter' ? ' pricing-tier-current' : ''}`}
                  >
                    <div
                      className={`pricing-tier-top-slot ${
                        user.subscription_tier === 'starter'
                          ? 'pricing-tier-current-banner'
                          : 'pricing-tier-top-align-spacer'
                      }`}
                      role={user.subscription_tier === 'starter' ? 'status' : undefined}
                      aria-hidden={user.subscription_tier !== 'starter'}
                    >
                      {user.subscription_tier === 'starter' ? 'Your current plan' : '\u00A0'}
                    </div>
                    <div className="tier-header">
                      <h3 className="tier-name">Starter</h3>
                      <div className="tier-badge tier-badge-starter">POPULAR</div>
                    </div>
                    <div className="tier-features">
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">
                          <strong>
                            {MONTHLY_CREDIT_ALLOCATIONS.starter.toLocaleString()} credits
                          </strong>{' '}
                          per month (~{Math.round(MONTHLY_CREDIT_ALLOCATIONS.starter / 5)}{' '}
                          exchanges/month at ~5 credits each)
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
                          Pay-as-you-go overages (${OVERAGE_USD_PER_CREDIT}/credit)
                        </span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">Email support</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">
                          <strong>10 conversations</strong> saved
                        </span>
                      </div>
                    </div>
                    <div className="tier-checkout-actions" style={{ marginTop: '1rem' }}>
                      <p style={{ fontWeight: 600, margin: 0 }}>${TIER_PRICING.starter}/month</p>
                      {user.subscription_tier === 'starter' ? (
                        canOpenStripeBillingPortal ? (
                          <button
                            type="button"
                            className="modal-button-primary tier-checkout-button tier-checkout-manage-billing"
                            style={{ width: '100%', marginTop: '0.5rem' }}
                            disabled={billingBusy !== null}
                            onClick={() => openBillingPortal()}
                          >
                            {billingBusy === 'portal' ? 'Opening…' : 'Manage billing'}
                          </button>
                        ) : (
                          <p
                            style={{
                              marginTop: '0.75rem',
                              marginBottom: 0,
                              color: '#666',
                              fontSize: '0.95rem',
                            }}
                          >
                            Current plan
                          </p>
                        )
                      ) : (
                        <button
                          type="button"
                          className="modal-button-primary tier-checkout-button"
                          style={{ width: '100%', marginTop: '0.5rem' }}
                          disabled={billingBusy !== null}
                          onClick={() => subscribeTier('starter')}
                        >
                          {billingBusy === 'sub-starter' ? 'Redirecting…' : 'Subscribe with Stripe'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    className={`pricing-tier tier-starter${user.subscription_tier === 'starter_plus' ? ' pricing-tier-current' : ''}`}
                  >
                    <div
                      className={`pricing-tier-top-slot ${
                        user.subscription_tier === 'starter_plus'
                          ? 'pricing-tier-current-banner'
                          : 'pricing-tier-top-align-spacer'
                      }`}
                      role={user.subscription_tier === 'starter_plus' ? 'status' : undefined}
                      aria-hidden={user.subscription_tier !== 'starter_plus'}
                    >
                      {user.subscription_tier === 'starter_plus' ? 'Your current plan' : '\u00A0'}
                    </div>
                    <div className="tier-header">
                      <h3 className="tier-name">Starter+</h3>
                    </div>
                    <div className="tier-features">
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">
                          <strong>
                            {MONTHLY_CREDIT_ALLOCATIONS.starter_plus.toLocaleString()} credits
                          </strong>{' '}
                          per month (~{Math.round(MONTHLY_CREDIT_ALLOCATIONS.starter_plus / 5)}{' '}
                          exchanges/month at ~5 credits each)
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
                          Pay-as-you-go overages (${OVERAGE_USD_PER_CREDIT}/credit)
                        </span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">Email support</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">
                          <strong>20 conversations</strong> saved
                        </span>
                      </div>
                    </div>
                    <div className="tier-checkout-actions" style={{ marginTop: '1rem' }}>
                      <p style={{ fontWeight: 600, margin: 0 }}>
                        ${TIER_PRICING.starter_plus}/month
                      </p>
                      {user.subscription_tier === 'starter_plus' ? (
                        canOpenStripeBillingPortal ? (
                          <button
                            type="button"
                            className="modal-button-primary tier-checkout-button tier-checkout-manage-billing"
                            style={{ width: '100%', marginTop: '0.5rem' }}
                            disabled={billingBusy !== null}
                            onClick={() => openBillingPortal()}
                          >
                            {billingBusy === 'portal' ? 'Opening…' : 'Manage billing'}
                          </button>
                        ) : (
                          <p
                            style={{
                              marginTop: '0.75rem',
                              marginBottom: 0,
                              color: '#666',
                              fontSize: '0.95rem',
                            }}
                          >
                            Current plan
                          </p>
                        )
                      ) : (
                        <button
                          type="button"
                          className="modal-button-primary tier-checkout-button"
                          style={{ width: '100%', marginTop: '0.5rem' }}
                          disabled={billingBusy !== null}
                          onClick={() => subscribeTier('starter_plus')}
                        >
                          {billingBusy === 'sub-starter_plus'
                            ? 'Redirecting…'
                            : 'Subscribe with Stripe'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    className={`pricing-tier tier-pro${user.subscription_tier === 'pro' ? ' pricing-tier-current' : ''}`}
                  >
                    <div
                      className={`pricing-tier-top-slot ${
                        user.subscription_tier === 'pro'
                          ? 'pricing-tier-current-banner'
                          : 'pricing-tier-top-align-spacer'
                      }`}
                      role={user.subscription_tier === 'pro' ? 'status' : undefined}
                      aria-hidden={user.subscription_tier !== 'pro'}
                    >
                      {user.subscription_tier === 'pro' ? 'Your current plan' : '\u00A0'}
                    </div>
                    <div className="tier-header">
                      <h3 className="tier-name">Pro</h3>
                    </div>
                    <div className="tier-features">
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">
                          <strong>{MONTHLY_CREDIT_ALLOCATIONS.pro.toLocaleString()} credits</strong>{' '}
                          per month (~{Math.round(MONTHLY_CREDIT_ALLOCATIONS.pro / 5)}{' '}
                          exchanges/month at ~5 credits each)
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
                          Pay-as-you-go overages (${OVERAGE_USD_PER_CREDIT}/credit)
                        </span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">Priority email support</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">
                          <strong>40 conversations</strong> saved
                        </span>
                      </div>
                    </div>
                    <div className="tier-checkout-actions" style={{ marginTop: '1rem' }}>
                      <p style={{ fontWeight: 600, margin: 0 }}>${TIER_PRICING.pro}/month</p>
                      {user.subscription_tier === 'pro' ? (
                        canOpenStripeBillingPortal ? (
                          <button
                            type="button"
                            className="modal-button-primary tier-checkout-button tier-checkout-manage-billing"
                            style={{ width: '100%', marginTop: '0.5rem' }}
                            disabled={billingBusy !== null}
                            onClick={() => openBillingPortal()}
                          >
                            {billingBusy === 'portal' ? 'Opening…' : 'Manage billing'}
                          </button>
                        ) : (
                          <p
                            style={{
                              marginTop: '0.75rem',
                              marginBottom: 0,
                              color: '#666',
                              fontSize: '0.95rem',
                            }}
                          >
                            Current plan
                          </p>
                        )
                      ) : (
                        <button
                          type="button"
                          className="modal-button-primary tier-checkout-button"
                          style={{ width: '100%', marginTop: '0.5rem' }}
                          disabled={billingBusy !== null}
                          onClick={() => subscribeTier('pro')}
                        >
                          {billingBusy === 'sub-pro' ? 'Redirecting…' : 'Subscribe with Stripe'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    className={`pricing-tier tier-pro${user.subscription_tier === 'pro_plus' ? ' pricing-tier-current' : ''}`}
                  >
                    <div
                      className={`pricing-tier-top-slot ${
                        user.subscription_tier === 'pro_plus'
                          ? 'pricing-tier-current-banner'
                          : 'pricing-tier-top-align-spacer'
                      }`}
                      role={user.subscription_tier === 'pro_plus' ? 'status' : undefined}
                      aria-hidden={user.subscription_tier !== 'pro_plus'}
                    >
                      {user.subscription_tier === 'pro_plus' ? 'Your current plan' : '\u00A0'}
                    </div>
                    <div className="tier-header">
                      <h3 className="tier-name">Pro+</h3>
                      <div className="tier-badge tier-badge-pro">BEST VALUE</div>
                    </div>
                    <div className="tier-features">
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">
                          <strong>
                            {MONTHLY_CREDIT_ALLOCATIONS.pro_plus.toLocaleString()} credits
                          </strong>{' '}
                          per month (~{Math.round(MONTHLY_CREDIT_ALLOCATIONS.pro_plus / 5)}{' '}
                          exchanges/month at ~5 credits each)
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
                          Pay-as-you-go overages (${OVERAGE_USD_PER_CREDIT}/credit)
                        </span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">Priority email support</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">✓</span>
                        <span className="feature-text">
                          <strong>80 conversations</strong> saved
                        </span>
                      </div>
                    </div>
                    <div className="tier-checkout-actions" style={{ marginTop: '1rem' }}>
                      <p style={{ fontWeight: 600, margin: 0 }}>${TIER_PRICING.pro_plus}/month</p>
                      {user.subscription_tier === 'pro_plus' ? (
                        canOpenStripeBillingPortal ? (
                          <button
                            type="button"
                            className="modal-button-primary tier-checkout-button tier-checkout-manage-billing"
                            style={{ width: '100%', marginTop: '0.5rem' }}
                            disabled={billingBusy !== null}
                            onClick={() => openBillingPortal()}
                          >
                            {billingBusy === 'portal' ? 'Opening…' : 'Manage billing'}
                          </button>
                        ) : (
                          <p
                            style={{
                              marginTop: '0.75rem',
                              marginBottom: 0,
                              color: '#666',
                              fontSize: '0.95rem',
                            }}
                          >
                            Current plan
                          </p>
                        )
                      ) : (
                        <button
                          type="button"
                          className="modal-button-primary tier-checkout-button"
                          style={{ width: '100%', marginTop: '0.5rem' }}
                          disabled={billingBusy !== null}
                          onClick={() => subscribeTier('pro_plus')}
                        >
                          {billingBusy === 'sub-pro_plus'
                            ? 'Redirecting…'
                            : 'Subscribe with Stripe'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="upgrade-modal-footer">
                  {billingError && (
                    <p className="pricing-notice" style={{ color: '#c62828' }}>
                      {billingError}
                    </p>
                  )}
                  <p className="pricing-notice">
                    💡 <strong>How credits work:</strong> we convert provider-reported API cost in
                    USD (or list prices) into credits at a fixed rate. Multiple models in one
                    comparison add up; we charge whole credits rounded up (at least 1 when anything
                    succeeds).
                  </p>
                  <button className="modal-button-primary" onClick={closeModal}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
