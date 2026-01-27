/**
 * Verification Code Modal Component
 * Displays a modal for users to enter their 6-digit email verification code
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import './VerificationCodeModal.css'

// API base URL with smart fallback
const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'
const RESEND_COOLDOWN_SECONDS = 60

interface VerificationCodeModalProps {
  isOpen: boolean
  onClose: () => void
  onVerified: () => void
  userEmail?: string
}

export const VerificationCodeModal: React.FC<VerificationCodeModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  userEmail,
}) => {
  const { refreshUser } = useAuth()
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

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

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
      console.error('Verification error:', err)
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
      console.error('Resend error:', err)
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

  if (!isOpen) return null

  return (
    <div
      className="verification-code-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-code-title"
    >
      <div className="verification-code-modal" onClick={e => e.stopPropagation()} ref={modalRef}>
        <div className="verification-code-header">
          <div className="verification-code-icon">📧</div>
          <h2 id="verification-code-title">Verify Your Email</h2>
          <button
            className="verification-code-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="verification-code-content">
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
        </div>
      </div>
    </div>
  )
}
