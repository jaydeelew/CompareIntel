import React, { useEffect, useState, useRef } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import './AuthForms.css'

// API base URL with smart fallback
const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'

interface VerifyEmailProps {
  onClose: () => void
  externalToken?: string | null
  suppressVerification?: boolean
}

export const VerifyEmail: React.FC<VerifyEmailProps> = ({
  onClose,
  externalToken,
  suppressVerification = false,
}) => {
  const { refreshUser, user, isLoading: authLoading } = useAuth()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'idle'>('idle')
  const [message, setMessage] = useState('Verifying your email...')
  const [isVisible, setIsVisible] = useState(true)
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false)
  const hasVerified = useRef(false)
  const lastProcessedToken = useRef<string | null>(null)

  useEffect(() => {
    const verifyEmail = async () => {
      // Get token from URL or external prop
      const urlParams = new URLSearchParams(window.location.search)
      const token = externalToken || urlParams.get('token')

      // Check if this is a password reset token (not an email verification token)
      const path = window.location.pathname
      const fullUrl = window.location.href
      const isPasswordReset = path.includes('reset-password') || fullUrl.includes('reset-password')

      // Don't try to verify password reset tokens - let ResetPassword component handle those
      if (isPasswordReset) {
        return
      }

      // If verification is suppressed (new tab checking for existing tabs), don't verify yet
      if (suppressVerification) {
        return
      }

      // If no token, don't show anything
      if (!token) {
        return
      }

      // Wait for auth to finish loading before attempting verification
      // This prevents verification attempts right after sign out
      if (authLoading) {
        return
      }

      // If this is a new external token, allow re-verification
      if (externalToken && externalToken !== lastProcessedToken.current) {
        hasVerified.current = false
        lastProcessedToken.current = externalToken
        // Reset state for new verification (but don't set status to idle yet)
        setIsVisible(true)
        setHasAnimatedIn(false)
      }

      // Prevent double-submission in React StrictMode (dev mode)
      if (hasVerified.current) {
        return
      }
      hasVerified.current = true

      setStatus('verifying')

      try {
        // Use fetch with explicit error handling to prevent service worker from intercepting
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

        const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
          signal: controller.signal,
          // Prevent service worker from caching this request
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          // Refresh user data first to update verification status (triggers orange banner fade-out)
          try {
            await refreshUser()
            // Dispatch event to hide verification banner immediately
            window.dispatchEvent(new CustomEvent('verification-complete'))
          } catch {
            // Silently fail - user data refresh is not critical
          }

          // Small delay before showing success to allow orange banner to start fading
          setTimeout(() => {
            setStatus('success')
            setMessage('Your account is now fully activated. You can begin to compare AI models!')
            // Trigger entrance animation
            setTimeout(() => setHasAnimatedIn(true), 50)
          }, 1000) // Increased delay to 1 second to allow orange banner fade-out to complete
        } else {
          let errorMessage = 'Verification failed. The link may have expired.'
          try {
            const error = await response.json()
            errorMessage = error.detail || errorMessage
          } catch {
            // If response is not JSON, use default message
          }

          // Only show error banner if user is authenticated or auth is still loading
          // If user is signed out, silently clear the token from URL without showing error
          if (user || authLoading) {
            setStatus('error')
            setMessage(errorMessage)
            // Trigger error banner animation
            setTimeout(() => setHasAnimatedIn(true), 50)
          } else {
            // User is signed out - silently clear token and hide banner
            window.history.replaceState({}, document.title, window.location.pathname)
            setIsVisible(false)
            hasVerified.current = false // Reset to allow future verifications
          }
        }
      } catch (error) {
        console.error('Verification error:', error)

        // Check if this is a network error (not just any error)
        const isNetworkError =
          error instanceof TypeError &&
          (error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.name === 'AbortError')

        // Only show error banner if user is authenticated or auth is still loading
        // If user is signed out, silently clear the token from URL without showing error
        if (user || authLoading) {
          setStatus('error')
          setMessage(
            isNetworkError
              ? 'Unable to connect to the server. Please check your internet connection and try again.'
              : 'Failed to verify email. Please try again later.'
          )
          // Trigger error banner animation
          setTimeout(() => setHasAnimatedIn(true), 50)
        } else {
          // User is signed out - silently clear token and hide banner
          window.history.replaceState({}, document.title, window.location.pathname)
          setIsVisible(false)
          hasVerified.current = false // Reset to allow future verifications
        }
      }
    }

    verifyEmail()
  }, [refreshUser, onClose, externalToken, suppressVerification, user, authLoading])

  // Auto-hide success banner after 8 seconds
  useEffect(() => {
    if (status === 'success' && hasAnimatedIn) {
      // Wait 8 seconds, then start fade-out
      const fadeTimer = setTimeout(() => {
        setHasAnimatedIn(false) // Trigger fade-out
      }, 8000)

      // After fade-out completes, remove banner
      const removeTimer = setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname)
        setIsVisible(false)
        onClose()
      }, 8500) // 8000ms wait + 500ms fade-out

      return () => {
        clearTimeout(fadeTimer)
        clearTimeout(removeTimer)
      }
    }
  }, [status, hasAnimatedIn, onClose])

  // Don't show anything if we're idle, verifying, or not visible
  if (!isVisible || status === 'idle' || status === 'verifying') {
    return null
  }

  return (
    <div
      style={{
        background:
          status === 'success'
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        color: 'white',
        padding: hasAnimatedIn ? '1.5rem 1rem' : '0 1rem',
        margin: '0',
        width: '100%',
        boxShadow:
          status === 'success'
            ? '0 4px 15px rgba(16, 185, 129, 0.3)'
            : '0 4px 15px rgba(239, 68, 68, 0.3)',
        position: 'relative',
        opacity: hasAnimatedIn ? 1 : 0,
        maxHeight: hasAnimatedIn ? '500px' : '0',
        overflow: 'hidden',
        transform: hasAnimatedIn ? 'translateY(0)' : 'translateY(-20px)',
        transition:
          'opacity 0.5s ease-out, transform 0.5s ease-out, max-height 0.5s ease-out, padding 0.5s ease-out',
      }}
    >
      {status === 'success' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            maxWidth: '900px',
            margin: '0 auto',
          }}
        >
          {/* Success Icon */}
          <div
            style={{
              flexShrink: 0,
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.25)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M26.6667 8L12 22.6667L5.33334 16"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Text Content */}
          <div style={{ textAlign: 'left', flex: '1' }}>
            <div
              style={{
                fontSize: '1.1rem',
                fontWeight: '600',
                marginBottom: '0.35rem',
                letterSpacing: '0.01em',
              }}
            >
              Email Verified Successfully!
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.95, lineHeight: '1.4' }}>{message}</div>
          </div>

          {/* Decorative Element */}
          <div
            style={{
              flexShrink: 0,
              width: '48px',
              height: '48px',
              opacity: 0.15,
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="24" cy="24" r="20" stroke="white" strokeWidth="2" />
              <path d="M24 14V24L30 30" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: '600',
              marginBottom: '0.5rem',
              textAlign: 'center',
            }}
          >
            ❌ Verification Failed
          </div>

          <div
            style={{
              fontSize: '0.9rem',
              opacity: 0.95,
              marginBottom: '0.75rem',
              textAlign: 'center',
            }}
          >
            {message}
          </div>

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => {
                // Clear the token from URL and reset state
                window.history.replaceState({}, document.title, window.location.pathname)
                hasVerified.current = false // Allow future verifications
                setIsVisible(false)
                onClose()
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                padding: '0.4rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                marginTop: '0.5rem',
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
              }}
            >
              Close
            </button>
          </div>
        </>
      )}
    </div>
  )
}
