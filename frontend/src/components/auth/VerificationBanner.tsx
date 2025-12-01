import React, { useState, useEffect } from 'react'

import { useAuth } from '../../contexts/AuthContext'

// API base URL with smart fallback
const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'
const RESEND_COOLDOWN_SECONDS = 60 // 1 minute cooldown between requests

export const VerificationBanner: React.FC = () => {
  const { user } = useAuth()
  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false)
  const [permanentlyHidden, setPermanentlyHidden] = useState(false)

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setTimeout(() => {
        setCooldownRemaining(cooldownRemaining - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldownRemaining])

  // Check if banner should be permanently hidden (survives page refresh)
  useEffect(() => {
    const isHidden = sessionStorage.getItem('verification-banner-hidden') === 'true'
    if (isHidden) {
      setPermanentlyHidden(true)
    }
  }, [])

  // Listen for verification events
  useEffect(() => {
    const handleVerificationComplete = () => {
      setPermanentlyHidden(true)
      setIsFadingOut(true)
      sessionStorage.setItem('verification-banner-hidden', 'true')
    }

    window.addEventListener('verification-complete', handleVerificationComplete)
    return () => window.removeEventListener('verification-complete', handleVerificationComplete)
  }, [])

  // Reset state when user changes (new login)
  useEffect(() => {
    if (user) {
      // Only reset if this is a different user
      const lastUserId = sessionStorage.getItem('last-user-id')
      if (lastUserId !== user.id.toString()) {
        sessionStorage.setItem('last-user-id', user.id.toString())
        sessionStorage.removeItem('verification-banner-hidden')
        setPermanentlyHidden(false)
        setIsFadingOut(false)
        setHasAnimatedIn(false)
      }
    }
  }, [user?.id, user])

  // Monitor user verification status
  useEffect(() => {
    if (user?.is_verified) {
      setPermanentlyHidden(true)
      setIsFadingOut(true)
      sessionStorage.setItem('verification-banner-hidden', 'true')
    }
  }, [user?.is_verified])

  // Trigger entrance animation
  useEffect(() => {
    if (user && !user.is_verified && !hasAnimatedIn && !permanentlyHidden) {
      setTimeout(() => setHasAnimatedIn(true), 50)
    }
  }, [user, hasAnimatedIn, permanentlyHidden])

  // Don't show banner if permanently hidden, verified, or fading out
  if (!user || user.is_verified || isFadingOut || permanentlyHidden) {
    return null
  }

  const handleResendVerification = async () => {
    if (cooldownRemaining > 0) {
      return // Still in cooldown
    }

    setIsResending(true)
    setResendMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: user.email }),
      })

      if (response.ok) {
        setResendMessage('✅ Verification email sent! Please check your inbox.')
        setCooldownRemaining(RESEND_COOLDOWN_SECONDS)

        // Clear success message after 5 seconds
        setTimeout(() => {
          setResendMessage('')
        }, 5000)
      } else {
        const errorData = await response.json()
        setResendMessage(
          `❌ ${errorData.detail || 'Failed to send email. Please try again later.'}`
        )

        // Clear error message after 5 seconds
        setTimeout(() => {
          setResendMessage('')
        }, 5000)
      }
    } catch (error) {
      console.error('Resend error:', error)
      setResendMessage('❌ Failed to send email. Please try again later.')

      // Clear error message after 5 seconds
      setTimeout(() => {
        setResendMessage('')
      }, 5000)
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div
      style={{
        background: '#f59e0b',
        color: 'white',
        padding: hasAnimatedIn ? '1rem' : '0 1rem',
        margin: '0',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
        position: 'relative',
        opacity: isFadingOut ? 0 : hasAnimatedIn ? 1 : 0,
        transform: isFadingOut
          ? 'translateY(-100%)'
          : hasAnimatedIn
            ? 'translateY(0)'
            : 'translateY(-20px)',
        transition:
          'opacity 0.5s ease-out, transform 0.5s ease-out, max-height 0.5s ease-out, padding 0.5s ease-out',
        maxHeight: isFadingOut ? '0' : hasAnimatedIn ? '500px' : '0',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
        📧 Please verify your email address
      </div>

      <div style={{ fontSize: '0.9rem', opacity: 0.95, marginBottom: '0.75rem' }}>
        Check your inbox for a verification link from CompareIntel
        <br />
        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
          💡 Don't see it? Check your spam folder!
        </span>
      </div>

      {resendMessage ? (
        <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>{resendMessage}</div>
      ) : (
        <button
          onClick={handleResendVerification}
          disabled={isResending || cooldownRemaining > 0}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            padding: '0.4rem 1rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            cursor: isResending || cooldownRemaining > 0 ? 'not-allowed' : 'pointer',
            opacity: isResending || cooldownRemaining > 0 ? 0.6 : 1,
          }}
          onMouseOver={e => {
            if (!isResending && cooldownRemaining === 0) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'
            }
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
          }}
        >
          {isResending
            ? 'Sending...'
            : cooldownRemaining > 0
              ? `Wait ${cooldownRemaining}s to resend`
              : 'Resend Verification Email'}
        </button>
      )}
    </div>
  )
}
