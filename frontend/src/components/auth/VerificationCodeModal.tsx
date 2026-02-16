/**
 * Verification Code Modal Component
 * Displays a modal for users to enter their 6-digit email verification code
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import logger from '../../utils/logger'
import './VerificationCodeModal.css'

// API base URL with smart fallback
const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'
const RESEND_COOLDOWN_SECONDS = 60

interface VerificationCodeModalProps {
  isOpen: boolean
  onClose: () => void
  onVerified: () => void
  onUseDifferentEmail?: () => void
  userEmail?: string
}

export const VerificationCodeModal: React.FC<VerificationCodeModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  onUseDifferentEmail,
  userEmail,
}) => {
  const { refreshUser, logout } = useAuth()
  const [code, setCode] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setTimeout(() => {
        setCooldownRemaining(cooldownRemaining - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldownRemaining])

  // Modal is non-dismissible - no escape key or backdrop click
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle code input - allow only digits
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(value)
    setError('')
  }

  // Handle paste - extract digits
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')
    const digits = pastedText.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    setError('')
  }

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) {
      setError('Please enter the 6-digit code')
      return
    }

    setIsVerifying(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: code }),
      })

      if (response.ok) {
        // Refresh user data to update verification status
        await refreshUser()
        onVerified()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Verification failed. Please try again.')
      }
    } catch (err) {
      logger.error('Verification error:', err)
      setError('Failed to verify. Please check your connection and try again.')
    } finally {
      setIsVerifying(false)
    }
  }, [code, refreshUser, onVerified])

  const handleResendCode = useCallback(async () => {
    if (!userEmail || cooldownRemaining > 0) return

    setIsResending(true)
    setResendMessage('')
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: userEmail }),
      })

      if (response.ok) {
        setResendMessage('A new code has been sent to your email.')
        setCooldownRemaining(RESEND_COOLDOWN_SECONDS)
        setCode('')

        // Clear success message after 5 seconds
        setTimeout(() => setResendMessage(''), 5000)
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to resend code. Please try again.')
      }
    } catch (err) {
      logger.error('Resend error:', err)
      setError('Failed to resend code. Please check your connection.')
    } finally {
      setIsResending(false)
    }
  }, [userEmail, cooldownRemaining])

  // Handle Enter key to submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && code.length === 6) {
      handleVerify()
    }
  }

  const handleLogout = useCallback(async () => {
    onClose()
    await logout()
  }, [onClose, logout])

  const handleUseDifferentEmail = useCallback(() => {
    onClose()
    onUseDifferentEmail?.()
  }, [onClose, onUseDifferentEmail])

  if (!isOpen) return null

  return (
    <div
      className="verification-code-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-code-title"
      aria-describedby="verification-code-description"
    >
      <div className="verification-code-modal" onClick={e => e.stopPropagation()} ref={modalRef}>
        <div className="verification-code-header">
          <div className="verification-code-icon-container">
            {/* Animated glow rings */}
            <div className="verification-glow-ring verification-glow-ring-1" />
            <div className="verification-glow-ring verification-glow-ring-2" />
            <div className="verification-glow-ring verification-glow-ring-3" />

            {/* Floating particles */}
            <div className="verification-particle verification-particle-1" />
            <div className="verification-particle verification-particle-2" />
            <div className="verification-particle verification-particle-3" />
            <div className="verification-particle verification-particle-4" />

            {/* Main envelope icon */}
            <div className="verification-envelope-wrapper">
              <svg
                className="verification-envelope-icon"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Envelope body with gradient */}
                <defs>
                  <linearGradient id="envelopeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e0e7ff" />
                  </linearGradient>
                  <linearGradient id="flapGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#c7d2fe" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                  <filter id="envelopeShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="3" floodOpacity="0.2" />
                  </filter>
                </defs>

                {/* Envelope back */}
                <rect
                  x="6"
                  y="16"
                  width="52"
                  height="36"
                  rx="4"
                  fill="url(#envelopeGradient)"
                  filter="url(#envelopeShadow)"
                  className="verification-envelope-body"
                />

                {/* Envelope flap (animated) */}
                <path
                  d="M6 20 L32 38 L58 20 L58 16 Q58 12 54 12 L10 12 Q6 12 6 16 Z"
                  fill="url(#flapGradient)"
                  className="verification-envelope-flap"
                />

                {/* Envelope bottom fold lines */}
                <path
                  d="M6 48 L26 32"
                  stroke="#a5b4fc"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.6"
                />
                <path
                  d="M58 48 L38 32"
                  stroke="#a5b4fc"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              </svg>

              {/* Animated @ symbol emerging from envelope */}
              <div className="verification-at-symbol">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="url(#atGradient)"
                    strokeWidth="2"
                    fill="none"
                  />
                  <defs>
                    <linearGradient id="atGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="50%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C13.2 16 14.27 15.45 15 14.58V16C15 17.1 14.1 18 13 18H11C9.9 18 9 17.1 9 16"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <circle cx="12" cy="12" r="2" fill="#ef4444" />
                </svg>
              </div>
            </div>
          </div>
          <h2 id="verification-code-title">Verify Your Email</h2>
        </div>

        <div className="verification-code-content" id="verification-code-description">
          <p className="verification-code-intro">We've sent a 6-digit verification code to:</p>
          <p className="verification-code-email">{userEmail}</p>

          <div className="verification-code-input-container">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={code}
              onChange={handleCodeChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              placeholder="000000"
              className={`verification-code-input ${error ? 'error' : ''}`}
              maxLength={6}
              disabled={isVerifying}
            />
          </div>

          {error && <p className="verification-code-error">{error}</p>}

          {resendMessage && <p className="verification-code-success">{resendMessage}</p>}

          <div className="verification-code-note">
            <p>
              <strong>⏰ Code expires in 15 minutes</strong>
            </p>
            <p>Check your spam folder if you don't see the email.</p>
          </div>
        </div>

        <div className="verification-code-footer">
          <button
            className="verification-code-button primary"
            onClick={handleVerify}
            disabled={code.length !== 6 || isVerifying}
            type="button"
          >
            {isVerifying ? 'Verifying...' : 'Verify Email'}
          </button>

          <button
            className="verification-code-button secondary"
            onClick={handleResendCode}
            disabled={isResending || cooldownRemaining > 0}
            type="button"
          >
            {isResending
              ? 'Sending...'
              : cooldownRemaining > 0
                ? `Resend code (${cooldownRemaining}s)`
                : 'Resend code'}
          </button>

          <div className="verification-code-escape-hatches">
            {onUseDifferentEmail && (
              <button
                className="verification-code-button tertiary"
                onClick={handleUseDifferentEmail}
                type="button"
              >
                Use different email
              </button>
            )}
            <button
              className="verification-code-button tertiary"
              onClick={handleLogout}
              type="button"
              data-testid="verification-modal-logout-button"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
