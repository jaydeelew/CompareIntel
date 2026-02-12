/**
 * Forgot Password Form Component
 * Allows users to request a password reset email
 */

import React, { useState, useEffect } from 'react'
import './AuthForms.css'

// API URL with smart fallback
const API_URL = import.meta.env.VITE_API_URL || '/api'

interface ForgotPasswordFormProps {
  onSuccess?: () => void
  onBackToLogin?: () => void
  onClose?: () => void
  initialEmail?: string
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  onBackToLogin,
  onClose,
  initialEmail = '',
}) => {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Update email when initialEmail prop changes (including when it's reset to empty)
  useEffect(() => {
    setEmail(initialEmail)
    // Also reset success state when email changes (new session)
    if (initialEmail === '') {
      setSuccess(false)
      setError('')
    }
  }, [initialEmail])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to send reset email')
      }

      setSuccess(true)
      // Don't auto-close anymore - let user close manually or via reset link
    } catch (err) {
      console.error('Password reset request error:', err)
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to send reset email. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-form-container">
        <div className="auth-form-header">
          <h2 id="auth-dialog-title">Check Your Email</h2>
          <p>Password reset instructions sent</p>
        </div>

        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div
            style={{
              fontSize: '3rem',
              marginBottom: '1rem',
            }}
          >
            📧
          </div>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            If this email is associated with an account,
            <br />
            we've sent password reset instructions to <strong>{email}</strong>
          </p>
          <p style={{ color: '#999', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            The link will expire in 1 hour for security reasons.
          </p>
        </div>

        <div className="auth-form-footer">
          <p style={{ textAlign: 'center' }}>
            <button type="button" className="auth-submit-btn" onClick={onClose}>
              Close
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-form-container">
      <div className="auth-form-header">
        <h2 id="auth-dialog-title">Forgot Password?</h2>
        <p>Enter your email to reset your password</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {error && (
          <div className="auth-error">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoComplete="email"
            disabled={isLoading}
          />
        </div>

        <button type="submit" className="auth-submit-btn" disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <div className="auth-form-footer">
        <p>
          Remember your password?{' '}
          <button type="button" className="auth-link-btn" onClick={onBackToLogin}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
