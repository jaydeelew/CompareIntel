/**
 * Login Form Component
 */

import { Eye, EyeClosed } from 'lucide-react'
import React, { useState, useEffect } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import { validateEmail } from '../../utils/validation'
import './AuthForms.css'

interface LoginFormProps {
  onSuccess?: () => void
  onSwitchToRegister?: (email?: string) => void
  onForgotPassword?: (email?: string) => void
  initialEmail?: string
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onSwitchToRegister,
  onForgotPassword,
  initialEmail = '',
}) => {
  const { login } = useAuth()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Update email when initialEmail prop changes (including when it's reset to empty)
  useEffect(() => {
    setEmail(initialEmail)
  }, [initialEmail])

  const handleForgotPasswordClick = () => {
    // Pass the email to the forgot password form if it's been entered
    if (onForgotPassword) {
      onForgotPassword(email)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login({ email, password })
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-form-container">
      <div className="auth-form-header">
        <h2>Welcome Back</h2>
        <p>Sign in to your CompareIntel account</p>
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
            autoFocus
            disabled={isLoading}
            data-testid="login-email-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <div className="password-input-container">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              disabled={isLoading}
              data-testid="login-password-input"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeClosed size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="auth-submit-btn"
          disabled={isLoading}
          data-testid="login-submit-button"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="auth-form-footer">
        <p>
          Don't have an account?{' '}
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => {
              // Transfer email to registration form if it's valid
              const emailToTransfer = validateEmail(email) ? email : undefined
              onSwitchToRegister?.(emailToTransfer)
            }}
          >
            Sign up
          </button>
        </p>
        <p style={{ textAlign: 'center' }}>
          <button type="button" className="auth-link-btn" onClick={handleForgotPasswordClick}>
            Forgot Password?
          </button>
        </p>
      </div>
    </div>
  )
}
