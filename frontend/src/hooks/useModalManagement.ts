/**
 * Custom hook for managing modal states
 *
 * This hook consolidates modal-related state management that was previously
 * scattered across MainPage. By centralizing modal state, we reduce the
 * cognitive load of the main component and make modal interactions more predictable.
 *
 * Key improvements:
 * 1. All modal states in one place
 * 2. Clear open/close functions with proper cleanup
 * 3. No useEffect for modal state synchronization (direct handlers instead)
 */

import { useState, useCallback, useRef, useEffect } from 'react'

export interface UseModalManagementConfig {
  /** Called when password reset modal closes with email */
  onPasswordResetComplete?: (email: string) => void
  /** Called when auth modal is about to open */
  onAuthModalOpen?: (mode: 'login' | 'register') => void
}

export interface UseModalManagementReturn {
  // Auth modal
  isAuthModalOpen: boolean
  authModalMode: 'login' | 'register'
  loginEmail: string
  openAuthModal: (mode: 'login' | 'register', email?: string) => void
  closeAuthModal: () => void

  // Verification modals
  showVerificationCodeModal: boolean
  showVerificationSuccessModal: boolean
  openVerificationCodeModal: () => void
  closeVerificationCodeModal: () => void
  openVerificationSuccessModal: () => void
  closeVerificationSuccessModal: () => void

  // Password reset
  showPasswordReset: boolean
  closePasswordReset: (email?: string) => void

  // Trial welcome modal
  showTrialWelcomeModal: boolean
  openTrialWelcomeModal: () => void
  closeTrialWelcomeModal: () => void

  // Welcome modal (tutorial)
  showWelcomeModal: boolean
  setShowWelcomeModal: (show: boolean) => void

  // Premium models toggle modal
  showPremiumModelsToggleModal: boolean
  openPremiumModelsToggleModal: () => void
  closePremiumModelsToggleModal: () => void

  // Disabled button info modal
  disabledButtonInfo: { button: 'collapse-all' | 'clear-all' | null; message: string }
  setDisabledButtonInfo: (info: {
    button: 'collapse-all' | 'clear-all' | null
    message: string
  }) => void
  closeDisabledButtonModal: () => void

  // Pending trial modal state (for post-verification flow)
  pendingTrialModalAfterVerification: boolean
  setPendingTrialModalAfterVerification: (pending: boolean) => void
  verificationCompletedAtRef: React.MutableRefObject<number | null>
}

export function useModalManagement(
  config: UseModalManagementConfig = {}
): UseModalManagementReturn {
  const { onPasswordResetComplete, onAuthModalOpen } = config

  // Auth modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login')
  const [loginEmail, setLoginEmail] = useState<string>('')

  // Verification modal state
  const [showVerificationCodeModal, setShowVerificationCodeModal] = useState(false)
  const [showVerificationSuccessModal, setShowVerificationSuccessModal] = useState(false)

  // Password reset state (check URL for reset token on mount)
  const [showPasswordReset, setShowPasswordReset] = useState(() => {
    if (typeof window === 'undefined') return false
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const path = window.location.pathname
    return !!(token && path.includes('reset-password'))
  })

  // Trial welcome modal
  const [showTrialWelcomeModal, setShowTrialWelcomeModal] = useState(false)

  // Welcome modal (for tutorial)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)

  // Premium models toggle modal
  const [showPremiumModelsToggleModal, setShowPremiumModelsToggleModal] = useState(false)

  // Disabled button info modal
  const [disabledButtonInfo, setDisabledButtonInfo] = useState<{
    button: 'collapse-all' | 'clear-all' | null
    message: string
  }>({ button: null, message: '' })

  // Pending trial modal state
  const [pendingTrialModalAfterVerification, setPendingTrialModalAfterVerification] =
    useState(false)
  const verificationCompletedAtRef = useRef<number | null>(null)

  // Auth modal handlers
  const openAuthModal = useCallback(
    (mode: 'login' | 'register', email?: string) => {
      setAuthModalMode(mode)
      if (email) {
        setLoginEmail(email)
      }
      setIsAuthModalOpen(true)
      onAuthModalOpen?.(mode)
    },
    [onAuthModalOpen]
  )

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false)
    setLoginEmail('')
  }, [])

  // Verification modal handlers
  const openVerificationCodeModal = useCallback(() => {
    setShowVerificationCodeModal(true)
  }, [])

  const closeVerificationCodeModal = useCallback(() => {
    setShowVerificationCodeModal(false)
  }, [])

  const openVerificationSuccessModal = useCallback(() => {
    setShowVerificationSuccessModal(true)
  }, [])

  const closeVerificationSuccessModal = useCallback(() => {
    setShowVerificationSuccessModal(false)
  }, [])

  // Password reset handler
  const closePasswordReset = useCallback(
    (email?: string) => {
      setShowPasswordReset(false)

      // Clean up URL
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('token')
        window.history.pushState({}, '', url)
      }

      // If email provided, open login modal with it
      if (email) {
        onPasswordResetComplete?.(email)
        setLoginEmail(email)
        setAuthModalMode('login')
        setIsAuthModalOpen(true)
      }
    },
    [onPasswordResetComplete]
  )

  // Trial welcome modal handlers
  const openTrialWelcomeModal = useCallback(() => {
    setShowTrialWelcomeModal(true)
  }, [])

  const closeTrialWelcomeModal = useCallback(() => {
    setShowTrialWelcomeModal(false)
  }, [])

  // Premium models toggle modal handlers
  const openPremiumModelsToggleModal = useCallback(() => {
    setShowPremiumModelsToggleModal(true)
  }, [])

  const closePremiumModelsToggleModal = useCallback(() => {
    setShowPremiumModelsToggleModal(false)
  }, [])

  // Disabled button modal handler
  const closeDisabledButtonModal = useCallback(() => {
    setDisabledButtonInfo({ button: null, message: '' })
  }, [])

  return {
    // Auth modal
    isAuthModalOpen,
    authModalMode,
    loginEmail,
    openAuthModal,
    closeAuthModal,

    // Verification modals
    showVerificationCodeModal,
    showVerificationSuccessModal,
    openVerificationCodeModal,
    closeVerificationCodeModal,
    openVerificationSuccessModal,
    closeVerificationSuccessModal,

    // Password reset
    showPasswordReset,
    closePasswordReset,

    // Trial welcome modal
    showTrialWelcomeModal,
    openTrialWelcomeModal,
    closeTrialWelcomeModal,

    // Welcome modal
    showWelcomeModal,
    setShowWelcomeModal,

    // Premium models toggle modal
    showPremiumModelsToggleModal,
    openPremiumModelsToggleModal,
    closePremiumModelsToggleModal,

    // Disabled button info modal
    disabledButtonInfo,
    setDisabledButtonInfo,
    closeDisabledButtonModal,

    // Pending trial modal state
    pendingTrialModalAfterVerification,
    setPendingTrialModalAfterVerification,
    verificationCompletedAtRef,
  }
}

/**
 * Hook to handle verification modal display based on auth state
 * This replaces the useEffect in MainPage that shows verification modal
 * when user is logged in but not verified
 */
export function useVerificationModalTrigger(
  isAuthenticated: boolean,
  user: { is_verified?: boolean } | null,
  authLoading: boolean,
  showPasswordReset: boolean,
  openVerificationCodeModal: () => void
) {
  useEffect(() => {
    if (isAuthenticated && user && !user.is_verified && !authLoading && !showPasswordReset) {
      // Small delay to let page settle
      const timeout = setTimeout(() => {
        openVerificationCodeModal()
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [isAuthenticated, user, authLoading, showPasswordReset, openVerificationCodeModal])
}
