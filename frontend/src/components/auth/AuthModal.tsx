/**
 * Auth Modal Component
 * Displays login or register form in a modal
 */

import React, { useState, useEffect } from 'react'

import { ForgotPasswordForm } from './ForgotPasswordForm'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import './AuthForms.css'

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
          <LoginForm
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
        ) : mode === 'register' ? (
          <RegisterForm
            onSuccess={handleSuccess}
            onSwitchToLogin={email => {
              setLoginEmail(email || '')
              setRegisterEmail('')
              setMode('login')
            }}
            initialEmail={registerEmail}
          />
        ) : (
          <ForgotPasswordForm
            onSuccess={handleSuccess}
            onBackToLogin={() => {
              setForgotPasswordEmail('')
              setMode('login')
            }}
            onClose={handleClose}
            initialEmail={forgotPasswordEmail}
          />
        )}
      </div>
    </div>
  )
}
