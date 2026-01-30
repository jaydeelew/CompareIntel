/**
 * Tests for useModalManagement hook
 *
 * Tests centralized modal state management that consolidates
 * scattered modal states from the main component.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import { useModalManagement } from '../../hooks/useModalManagement'

describe('useModalManagement', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock window.location
    delete (window as unknown as { location?: Location }).location
    window.location = {
      ...originalLocation,
      href: 'http://localhost/',
      pathname: '/',
      search: '',
    } as Location

    // Mock window.history.pushState
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
  })

  afterEach(() => {
    window.location = originalLocation
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with all modals closed', () => {
      const { result } = renderHook(() => useModalManagement())

      expect(result.current.isAuthModalOpen).toBe(false)
      expect(result.current.showVerificationCodeModal).toBe(false)
      expect(result.current.showVerificationSuccessModal).toBe(false)
      expect(result.current.showPasswordReset).toBe(false)
      expect(result.current.showTrialWelcomeModal).toBe(false)
      expect(result.current.showWelcomeModal).toBe(false)
      expect(result.current.showPremiumModelsToggleModal).toBe(false)
      expect(result.current.disabledButtonInfo.button).toBe(null)
    })

    it('should initialize with default auth modal mode as login', () => {
      const { result } = renderHook(() => useModalManagement())

      expect(result.current.authModalMode).toBe('login')
    })

    it('should initialize with empty login email', () => {
      const { result } = renderHook(() => useModalManagement())

      expect(result.current.loginEmail).toBe('')
    })

    it('should detect password reset from URL', () => {
      // Mock URL with reset token
      window.location.search = '?token=abc123'
      window.location.pathname = '/reset-password'

      const { result } = renderHook(() => useModalManagement())

      expect(result.current.showPasswordReset).toBe(true)
    })
  })

  describe('Auth Modal', () => {
    it('should open auth modal in login mode', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.openAuthModal('login')
      })

      expect(result.current.isAuthModalOpen).toBe(true)
      expect(result.current.authModalMode).toBe('login')
    })

    it('should open auth modal in register mode', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.openAuthModal('register')
      })

      expect(result.current.isAuthModalOpen).toBe(true)
      expect(result.current.authModalMode).toBe('register')
    })

    it('should open auth modal with pre-filled email', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.openAuthModal('login', 'test@example.com')
      })

      expect(result.current.isAuthModalOpen).toBe(true)
      expect(result.current.loginEmail).toBe('test@example.com')
    })

    it('should close auth modal and clear email', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.openAuthModal('login', 'test@example.com')
      })

      act(() => {
        result.current.closeAuthModal()
      })

      expect(result.current.isAuthModalOpen).toBe(false)
      expect(result.current.loginEmail).toBe('')
    })

    it('should call onAuthModalOpen callback', () => {
      const onAuthModalOpen = vi.fn()
      const { result } = renderHook(() => useModalManagement({ onAuthModalOpen }))

      act(() => {
        result.current.openAuthModal('register')
      })

      expect(onAuthModalOpen).toHaveBeenCalledWith('register')
    })
  })

  describe('Verification Modals', () => {
    it('should open and close verification code modal', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.openVerificationCodeModal()
      })
      expect(result.current.showVerificationCodeModal).toBe(true)

      act(() => {
        result.current.closeVerificationCodeModal()
      })
      expect(result.current.showVerificationCodeModal).toBe(false)
    })

    it('should open and close verification success modal', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.openVerificationSuccessModal()
      })
      expect(result.current.showVerificationSuccessModal).toBe(true)

      act(() => {
        result.current.closeVerificationSuccessModal()
      })
      expect(result.current.showVerificationSuccessModal).toBe(false)
    })
  })

  describe('Password Reset', () => {
    it('should close password reset and clean URL', () => {
      // Setup: have a reset token in URL
      window.location.search = '?token=abc123'
      window.location.pathname = '/reset-password'
      window.location.href = 'http://localhost/reset-password?token=abc123'

      const { result } = renderHook(() => useModalManagement())

      expect(result.current.showPasswordReset).toBe(true)

      act(() => {
        result.current.closePasswordReset()
      })

      expect(result.current.showPasswordReset).toBe(false)
      expect(window.history.pushState).toHaveBeenCalled()
    })

    it('should call onPasswordResetComplete and open auth modal with email', () => {
      window.location.search = '?token=abc123'
      window.location.pathname = '/reset-password'

      const onPasswordResetComplete = vi.fn()
      const { result } = renderHook(() => useModalManagement({ onPasswordResetComplete }))

      act(() => {
        result.current.closePasswordReset('user@example.com')
      })

      expect(onPasswordResetComplete).toHaveBeenCalledWith('user@example.com')
      expect(result.current.isAuthModalOpen).toBe(true)
      expect(result.current.authModalMode).toBe('login')
      expect(result.current.loginEmail).toBe('user@example.com')
    })
  })

  describe('Trial Welcome Modal', () => {
    it('should open and close trial welcome modal', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.openTrialWelcomeModal()
      })
      expect(result.current.showTrialWelcomeModal).toBe(true)

      act(() => {
        result.current.closeTrialWelcomeModal()
      })
      expect(result.current.showTrialWelcomeModal).toBe(false)
    })
  })

  describe('Welcome Modal', () => {
    it('should set welcome modal visibility', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.setShowWelcomeModal(true)
      })
      expect(result.current.showWelcomeModal).toBe(true)

      act(() => {
        result.current.setShowWelcomeModal(false)
      })
      expect(result.current.showWelcomeModal).toBe(false)
    })
  })

  describe('Premium Models Toggle Modal', () => {
    it('should open and close premium models toggle modal', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.openPremiumModelsToggleModal()
      })
      expect(result.current.showPremiumModelsToggleModal).toBe(true)

      act(() => {
        result.current.closePremiumModelsToggleModal()
      })
      expect(result.current.showPremiumModelsToggleModal).toBe(false)
    })
  })

  describe('Disabled Button Info Modal', () => {
    it('should set and clear disabled button info', () => {
      const { result } = renderHook(() => useModalManagement())

      act(() => {
        result.current.setDisabledButtonInfo({
          button: 'collapse-all',
          message: 'Cannot collapse while loading',
        })
      })

      expect(result.current.disabledButtonInfo.button).toBe('collapse-all')
      expect(result.current.disabledButtonInfo.message).toBe('Cannot collapse while loading')

      act(() => {
        result.current.closeDisabledButtonModal()
      })

      expect(result.current.disabledButtonInfo.button).toBe(null)
      expect(result.current.disabledButtonInfo.message).toBe('')
    })
  })

  describe('Pending Trial Modal State', () => {
    it('should manage pending trial modal after verification', () => {
      const { result } = renderHook(() => useModalManagement())

      expect(result.current.pendingTrialModalAfterVerification).toBe(false)

      act(() => {
        result.current.setPendingTrialModalAfterVerification(true)
      })

      expect(result.current.pendingTrialModalAfterVerification).toBe(true)

      act(() => {
        result.current.setPendingTrialModalAfterVerification(false)
      })

      expect(result.current.pendingTrialModalAfterVerification).toBe(false)
    })

    it('should provide verification completed ref', () => {
      const { result } = renderHook(() => useModalManagement())

      expect(result.current.verificationCompletedAtRef.current).toBe(null)

      result.current.verificationCompletedAtRef.current = Date.now()

      expect(result.current.verificationCompletedAtRef.current).toBeGreaterThan(0)
    })
  })
})
