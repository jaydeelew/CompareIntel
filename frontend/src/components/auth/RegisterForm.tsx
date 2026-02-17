/**
 * Register Form Component
 */

import { Eye, EyeClosed } from 'lucide-react'
import React, { useState, useEffect } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import logger from '../../utils/logger'
import { validateEmail } from '../../utils/validation'
import './AuthForms.css'

// Declare grecaptcha type for TypeScript
declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
  }
}

interface RegisterFormProps {
  onSuccess?: () => void
  onSwitchToLogin?: (email?: string) => void
  initialEmail?: string
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSuccess,
  onSwitchToLogin,
  initialEmail = '',
}) => {
  const { register } = useAuth()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Update email when initialEmail prop changes (including when it's reset to empty)
  useEffect(() => {
    setEmail(initialEmail)
  }, [initialEmail])

  // Load reCAPTCHA script with site key on component mount
  // Skip loading on localhost to avoid 401 errors (site key not configured for dev domain)
  useEffect(() => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

    if (siteKey && !window.grecaptcha && !isLocalhost) {
      // Check if script is already being loaded
      const existingScript = document.querySelector(`script[src*="recaptcha/api.js"]`)
      if (existingScript) {
        return
      }

      const script = document.createElement('script')
      script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  }, [])

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value
    setPassword(newPassword)
  }

  // Monitor password fields for programmatic changes (e.g., password manager autofill)
  // Only sync when the field value changes programmatically without user interaction
  useEffect(() => {
    const passwordField = document.getElementById('register-password') as HTMLInputElement
    const confirmPasswordField = document.getElementById(
      'register-confirm-password'
    ) as HTMLInputElement

    if (passwordField && confirmPasswordField) {
      let lastUserInteraction = 0
      const USER_INTERACTION_TIMEOUT = 500 // ms - ignore programmatic changes within 500ms of user interaction

      // Track user interactions
      const trackInteraction = () => {
        lastUserInteraction = Date.now()
      }

      passwordField.addEventListener('input', trackInteraction)
      passwordField.addEventListener('paste', trackInteraction)
      passwordField.addEventListener('keydown', trackInteraction)
      confirmPasswordField.addEventListener('input', trackInteraction)
      confirmPasswordField.addEventListener('paste', trackInteraction)
      confirmPasswordField.addEventListener('keydown', trackInteraction)

      // Check for programmatic changes (password manager autofill)
      const checkForAutofill = () => {
        const timeSinceInteraction = Date.now() - lastUserInteraction

        // Only sync if it's been more than 500ms since last user interaction
        // This distinguishes password manager autofill from manual typing/pasting
        if (timeSinceInteraction > USER_INTERACTION_TIMEOUT) {
          // If password field has a value but React state doesn't match (programmatic change)
          if (passwordField.value && passwordField.value !== password) {
            setPassword(passwordField.value)
            // Only auto-fill confirm password if it's completely empty (password manager autofill)
            if (!confirmPasswordField.value) {
              setConfirmPassword(passwordField.value)
            }
          }

          // If confirm password field has a value but React state doesn't match (programmatic change)
          if (confirmPasswordField.value && confirmPasswordField.value !== confirmPassword) {
            setConfirmPassword(confirmPasswordField.value)
            // Only auto-fill password if it's completely empty (password manager autofill)
            if (!passwordField.value) {
              setPassword(confirmPasswordField.value)
            }
          }
        }
      }

      // Check periodically for autofill (less frequent than before)
      const interval = setInterval(checkForAutofill, 300)

      // Also use MutationObserver for immediate detection
      const observer = new MutationObserver(checkForAutofill)
      observer.observe(passwordField, { attributes: true, attributeFilter: ['value'] })
      observer.observe(confirmPasswordField, { attributes: true, attributeFilter: ['value'] })

      return () => {
        clearInterval(interval)
        observer.disconnect()
        passwordField.removeEventListener('input', trackInteraction)
        passwordField.removeEventListener('paste', trackInteraction)
        passwordField.removeEventListener('keydown', trackInteraction)
        confirmPasswordField.removeEventListener('input', trackInteraction)
        confirmPasswordField.removeEventListener('paste', trackInteraction)
        confirmPasswordField.removeEventListener('keydown', trackInteraction)
      }
    }
  }, [password, confirmPassword])

  const validateForm = (): boolean => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return false
    }

    // Check for uppercase letter
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter')
      return false
    }

    // Check for lowercase letter
    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter')
      return false
    }

    // Check for number
    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number')
      return false
    }

    // Check for special character
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      setError(
        'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)'
      )
      return false
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }

    return true
  }

  const getRecaptchaToken = async (): Promise<string | null> => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY

    // Skip reCAPTCHA in test environments (Playwright, Jest, etc.)
    // Always skip reCAPTCHA when running on localhost:5173 (test environment)
    // Also check for Playwright-specific indicators
    const isTestEnvironment =
      typeof window !== 'undefined' && // Always skip on localhost:5173 (E2E test server)
      ((window.location.hostname === 'localhost' && window.location.port === '5173') ||
        window.navigator.userAgent.includes('Playwright') ||
        window.navigator.userAgent.includes('HeadlessChrome') ||
        window.navigator.userAgent.includes('Headless') ||
        window.__PLAYWRIGHT__ ||
        window.__TEST_ENV__ ||
        window.__PW_INTERNAL__ ||
        document.__TEST_ENV__ ||
        import.meta.env.MODE === 'test' ||
        // Check if VITE_RECAPTCHA_SITE_KEY is empty or undefined
        !siteKey)

    // If reCAPTCHA is not configured or we're in test environment, skip
    if (!siteKey || isTestEnvironment) {
      if (isTestEnvironment) {
        logger.debug('[reCAPTCHA] Test environment detected, skipping reCAPTCHA')
      } else {
        logger.debug('[reCAPTCHA] Site key not configured, skipping')
      }
      return null
    }

    // Wait for grecaptcha to be available with timeout
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total
    while (!window.grecaptcha && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }

    if (!window.grecaptcha) {
      logger.error('[reCAPTCHA] Failed to load reCAPTCHA script after timeout')
      return null
    }

    try {
      return await new Promise<string | null>(resolve => {
        // Set a timeout for the entire operation
        const timeout = setTimeout(() => {
          logger.error('[reCAPTCHA] Token generation timeout')
          resolve(null)
        }, 10000) // 10 second timeout

        window.grecaptcha.ready(async () => {
          try {
            const token = await window.grecaptcha.execute(siteKey, {
              action: 'register',
            })
            clearTimeout(timeout)
            if (token) {
              logger.debug('[reCAPTCHA] Token generated successfully')
              resolve(token)
            } else {
              logger.error('[reCAPTCHA] Token generation returned empty token')
              resolve(null)
            }
          } catch (error) {
            clearTimeout(timeout)
            logger.error('[reCAPTCHA] Token generation error:', error)
            resolve(null)
          }
        })
      })
    } catch (error) {
      logger.error('[reCAPTCHA] Unexpected error:', error)
      return null
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      // Get reCAPTCHA token if configured
      const recaptchaToken = await getRecaptchaToken()
      const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY

      // Skip reCAPTCHA check in test environments (same detection as getRecaptchaToken)
      // Always skip reCAPTCHA when running on localhost (test environment)
      const isTestEnvironment =
        typeof window !== 'undefined' && // Always skip on localhost (E2E test server) - check hostname and port
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.navigator.userAgent.includes('Playwright') ||
          window.navigator.userAgent.includes('HeadlessChrome') ||
          window.navigator.userAgent.includes('Headless') ||
          window.__PLAYWRIGHT__ ||
          window.__TEST_ENV__ ||
          window.__PW_INTERNAL__ ||
          document.__TEST_ENV__ ||
          import.meta.env.MODE === 'test' ||
          // Check if siteKey is empty, undefined, or falsy
          !siteKey)

      // If reCAPTCHA is configured but we didn't get a token (and not in test), show error
      // Note: In test environment, recaptchaToken will be null and isTestEnvironment will be true, so this check will pass
      if (siteKey && !recaptchaToken && !isTestEnvironment) {
        setError(
          'Failed to verify you are human. Please refresh the page and try again. If the problem persists, check your browser console for details.'
        )
        setIsLoading(false)
        return
      }

      await register({
        email,
        password,
        recaptcha_token: recaptchaToken || undefined,
      })
      onSuccess?.()
    } catch (err) {
      logger.error('Registration error:', err)
      if (err instanceof Error) {
        // Check if it's a network error
        if (err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
          setError(
            'Cannot connect to server. Please make sure the backend is running on http://127.0.0.1:8000'
          )
        } else if (err.message.includes('reCAPTCHA')) {
          // Provide more helpful error message for reCAPTCHA failures
          setError(
            'reCAPTCHA verification failed. This might be due to a domain mismatch or network issue. Please refresh the page and try again.'
          )
        } else {
          setError(err.message)
        }
      } else {
        setError('Registration failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-form-container">
      <div className="auth-form-header">
        <h2 id="auth-dialog-title">Create Account</h2>
        <p>Get 100 daily credits and access to more models</p>
        <p className="trial-highlight">⭐ PLUS 7 days FREE access to ALL premium models! ⭐</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form" autoComplete="off">
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
            name="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoComplete="email"
            autoFocus
            disabled={isLoading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="register-password">Password</label>
          <div className="password-input-container">
            <input
              id="register-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={handlePasswordChange}
              placeholder="••••••••••••"
              required
              autoComplete="new-password"
              disabled={isLoading}
              minLength={8}
              data-lpignore="false"
              data-form-type="register"
              data-1p-ignore="false"
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
          <small className="form-hint">
            Min 8 chars: uppercase, lowercase, number & special char
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="register-confirm-password">Confirm Password</label>
          <div className="password-input-container">
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              autoComplete="new-password"
              disabled={isLoading}
              minLength={8}
              data-lpignore="false"
              data-form-type="register"
              data-1p-ignore="false"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isLoading}
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            >
              {showConfirmPassword ? <EyeClosed size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="auth-submit-btn"
          disabled={isLoading}
          data-testid="register-submit-button"
        >
          {isLoading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <div className="auth-form-footer">
        <p className="terms-text">
          By creating an account, you agree to our{' '}
          <a
            href="/terms-of-service"
            target="_blank"
            rel="noopener noreferrer"
            className="terms-link"
          >
            Terms of Service
          </a>{' '}
          and Privacy Policy
        </p>
        <p>
          Already have an account?{' '}
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => {
              // Transfer email to login form if it's valid
              const emailToTransfer = validateEmail(email) ? email : undefined
              onSwitchToLogin?.(emailToTransfer)
            }}
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
