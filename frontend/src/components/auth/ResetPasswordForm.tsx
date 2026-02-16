/**
 * Reset Password Form Component
 * Allows users to set a new password using a reset token
 */

import React, { useState } from 'react'

import logger from '../../utils/logger'
import './AuthForms.css'

// API URL with smart fallback
const API_URL = import.meta.env.VITE_API_URL || '/api'

interface ResetPasswordFormProps {
  token: string
  onSuccess?: (email?: string) => void
}

export const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({ token, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const validateForm = (): boolean => {
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long')
      return false
    }

    // Check for uppercase letter
    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter')
      return false
    }

    // Check for lowercase letter
    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter')
      return false
    }

    // Check for number
    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number')
      return false
    }

    // Check for special character
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      setError(
        'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)'
      )
      return false
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          new_password: newPassword,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to reset password')
      }

      const data = await response.json()
      const userEmail = data.email

      setSuccess(true)
      // Redirect to login after success, passing the email
      setTimeout(() => {
        onSuccess?.(userEmail)
      }, 2000)
    } catch (err) {
      logger.error('Password reset error:', err)
      if (err instanceof Error) {
        if (err.message.includes('expired')) {
          setError('Reset link has expired. Please request a new one.')
        } else if (err.message.includes('Invalid')) {
          setError('Invalid reset link. Please request a new one.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Failed to reset password. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-form-container">
        <div className="auth-form-header">
          <h2>Password Reset!</h2>
          <p>Your password has been updated</p>
        </div>

        <div className="auth-reset-success">
          <div className="auth-reset-success-icon">✓</div>
          <p className="auth-reset-success-message">Your password has been successfully reset.</p>
          <p className="auth-reset-success-redirect">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-form-container">
      <div className="auth-form-header">
        <h2>Reset Password</h2>
        <p>Enter your new password</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {error && (
          <div className="auth-error">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="newPassword">New Password</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            autoComplete="new-password"
            disabled={isLoading}
            minLength={8}
          />
          <small className="form-hint">
            Min 8 chars: uppercase, lowercase, number & special char
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            autoComplete="new-password"
            disabled={isLoading}
            minLength={8}
          />
        </div>

        <button type="submit" className="auth-submit-btn" disabled={isLoading}>
          {isLoading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </div>
  )
}
