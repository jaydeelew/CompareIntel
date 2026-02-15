import { useState, useEffect } from 'react'

import { getAnonymousMockModeStatus } from '../services/compareService'
import type { User } from '../types'

interface UseAuthModalsProps {
  isAuthenticated: boolean
  user: User | null
  authLoading: boolean
}

export function useAuthModals({ isAuthenticated, user, authLoading }: UseAuthModalsProps) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login')
  const [anonymousMockModeEnabled, setAnonymousMockModeEnabled] = useState(false)
  const [loginEmail, setLoginEmail] = useState<string>('')
  const [showVerificationCodeModal, setShowVerificationCodeModal] = useState(false)
  const [showVerificationSuccessModal, setShowVerificationSuccessModal] = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const path = window.location.pathname
    return !!(token && path.includes('reset-password'))
  })

  const openLogin = () => {
    setAuthModalMode('login')
    setIsAuthModalOpen(true)
  }

  const openRegister = () => {
    setAuthModalMode('register')
    setIsAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setIsAuthModalOpen(false)
    setLoginEmail('')
  }

  const handlePasswordResetClose = (email?: string) => {
    setShowPasswordReset(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.pushState({}, '', url)
    if (email) {
      setLoginEmail(email)
    }
    setAuthModalMode('login')
    setIsAuthModalOpen(true)
  }

  const openLoginAfterVerificationCode = () => {
    setShowVerificationCodeModal(false)
    setAuthModalMode('login')
    setIsAuthModalOpen(true)
  }

  const handleVerified = () => {
    setShowVerificationCodeModal(false)
    setShowVerificationSuccessModal(true)
    window.dispatchEvent(new CustomEvent('verification-complete'))
  }

  useEffect(() => {
    if (isAuthenticated && user && !user.is_verified && !authLoading) {
      const timeout = setTimeout(() => {
        setShowVerificationCodeModal(true)
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [isAuthenticated, user, authLoading])

  useEffect(() => {
    const fetchAnonymousMockModeSetting = async () => {
      if (isAuthenticated || !import.meta.env.DEV || authLoading) {
        if (isAuthenticated || authLoading) {
          setAnonymousMockModeEnabled(false)
        }
        return
      }

      try {
        const data = await getAnonymousMockModeStatus()
        if (data.is_development && data.anonymous_mock_mode_enabled) {
          setAnonymousMockModeEnabled(true)
        } else {
          setAnonymousMockModeEnabled(false)
        }
      } catch {
        // Silently fail - development-only feature
      }
    }

    fetchAnonymousMockModeSetting()
  }, [isAuthenticated, authLoading])

  return {
    isAuthModalOpen,
    setIsAuthModalOpen,
    authModalMode,
    setAuthModalMode,
    loginEmail,
    setLoginEmail,
    showVerificationCodeModal,
    setShowVerificationCodeModal,
    showVerificationSuccessModal,
    setShowVerificationSuccessModal,
    showPasswordReset,
    setShowPasswordReset,
    anonymousMockModeEnabled,
    openLogin,
    openRegister,
    closeAuthModal,
    handlePasswordResetClose,
    openLoginAfterVerificationCode,
    handleVerified,
  }
}
