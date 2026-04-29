/**
 * Auth Modal Component
 * Displays login or register form in a modal
 */

import React, { useState, useEffect, lazy, Suspense } from 'react'

import './AuthForms.css'

const LoginFormLazy = lazy(() => import('./LoginForm').then(m => ({ default: m.LoginForm })))
const RegisterFormLazy = lazy(() =>
  import('./RegisterForm').then(m => ({ default: m.RegisterForm }))
)
const ForgotPasswordFormLazy = lazy(() =>
  import('./ForgotPasswordForm').then(m => ({ default: m.ForgotPasswordForm }))
)

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'login' | 'register' | 'forgot-password'
  initialEmail?: string
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  initialEmail = '',
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password'>(initialMode)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>('')
  const [registerEmail, setRegisterEmail] = useState<string>('')
  const [loginEmail, setLoginEmail] = useState<string>('')

  // Update mode when initialMode changes (e.g., when opening modal with different button)
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode)
    }
  }, [isOpen, initialMode])

  // Reset emails when modal closes
  useEffect(() => {
    if (!isOpen) {
      setForgotPasswordEmail('')
      setRegisterEmail('')
      setLoginEmail('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSuccess = () => {
    // Reset email state on successful login/register
    setForgotPasswordEmail('')
    setRegisterEmail('')
    setLoginEmail('')
    onClose()
  }

  const handleClose = () => {
    // Reset email state when modal closes
    setForgotPasswordEmail('')
    setRegisterEmail('')
    setLoginEmail('')
    onClose()
  }

  return (
    <div className="auth-modal-overlay" role="presentation">
      <div
        className="auth-modal"
        data-testid="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
      >
        <button className="auth-modal-close" onClick={handleClose} aria-label="Close">
          ×
        </button>

        {mode === 'login' ? (
          <Suspense fallback={<div className="auth-modal-form-fallback" aria-busy="true" />}>
            <LoginFormLazy
              onSuccess={handleSuccess}
              onSwitchToRegister={email => {
                setRegisterEmail(email || '')
                setLoginEmail('')
                setMode('register')
              }}
              onForgotPassword={email => {
                setForgotPasswordEmail(email || '')
                setMode('forgot-password')
              }}
              initialEmail={loginEmail || initialEmail}
            />
          </Suspense>
        ) : mode === 'register' ? (
          <Suspense fallback={<div className="auth-modal-form-fallback" aria-busy="true" />}>
            <RegisterFormLazy
              onSuccess={handleSuccess}
              onSwitchToLogin={email => {
                setLoginEmail(email || '')
                setRegisterEmail('')
                setMode('login')
              }}
              initialEmail={registerEmail}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<div className="auth-modal-form-fallback" aria-busy="true" />}>
            <ForgotPasswordFormLazy
              onSuccess={handleSuccess}
              onBackToLogin={() => {
                setForgotPasswordEmail('')
                setMode('login')
              }}
              onClose={handleClose}
              initialEmail={forgotPasswordEmail}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
