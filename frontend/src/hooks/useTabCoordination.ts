import { useState, useEffect } from 'react'

export interface TabCoordinationState {
  verificationToken: string | null
  suppressVerification: boolean
  showPasswordReset: boolean
}

export interface TabCoordinationActions {
  setShowPasswordReset: (show: boolean) => void
  handlePasswordResetClose: (email?: string) => void
}

export interface TabCoordinationConfig {
  onOpenAuthModal: (mode: 'login' | 'signup') => void
  onCloseAuthModal: () => void
  onSetLoginEmail: (email: string) => void
}

// Coordinates verification tokens across browser tabs using BroadcastChannel.
// When user clicks email verification/password reset link, this ensures an existing
// tab handles it rather than opening a new one.
export function useTabCoordination(
  config: TabCoordinationConfig
): TabCoordinationState & TabCoordinationActions {
  const { onOpenAuthModal, onCloseAuthModal, onSetLoginEmail } = config

  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [suppressVerification, setSuppressVerification] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const hasTokenInUrl = urlParams.get('token') !== null
    const isNewTab = window.opener === null
    return hasTokenInUrl && isNewTab
  })
  const [showPasswordReset, setShowPasswordReset] = useState(false)

  // Check for password reset token on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const path = window.location.pathname
    const fullUrl = window.location.href

    if (token && (path.includes('reset-password') || fullUrl.includes('reset-password'))) {
      setShowPasswordReset(true)
    }
  }, [])

  // BroadcastChannel coordination
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      console.error('[useTabCoordination] BroadcastChannel not supported')
      return
    }

    const channel = new BroadcastChannel('compareintel-verification')
    let hasExistingTab = false
    let isChannelClosed = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let closeTimeoutId: ReturnType<typeof setTimeout> | null = null

    // Safe wrapper for postMessage that checks if channel is closed
    const safePostMessage = (message: unknown) => {
      if (isChannelClosed) {
        return
      }
      try {
        channel.postMessage(message)
      } catch (error) {
        // Channel might be closed, ignore the error
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          isChannelClosed = true
        }
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (isChannelClosed) {
        return
      }

      if (event.data.type === 'verify-email' && event.data.token) {
        // Existing tab received verification token from new tab
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('token', event.data.token)
        window.history.pushState({}, '', newUrl)
        setVerificationToken(event.data.token)
        window.focus()
      } else if (event.data.type === 'password-reset' && event.data.token) {
        // Existing tab received password reset token
        onCloseAuthModal()
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('token', event.data.token)
        if (!newUrl.pathname.includes('reset-password')) {
          newUrl.pathname = '/reset-password'
        }
        window.history.pushState({}, '', newUrl)
        setShowPasswordReset(true)
        window.focus()
      } else if (event.data.type === 'ping') {
        hasExistingTab = true
        safePostMessage({ type: 'pong' })
      } else if (event.data.type === 'pong') {
        hasExistingTab = true
      }
    }

    channel.addEventListener('message', handleMessage)

    // Check if this is a verification page opened from email
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const path = window.location.pathname
    const fullUrl = window.location.href
    const isPasswordReset = path.includes('reset-password') || fullUrl.includes('reset-password')

    if (token && window.opener === null) {
      // New tab with token - ping for existing tabs
      safePostMessage({ type: 'ping' })

      timeoutId = setTimeout(() => {
        if (isChannelClosed) {
          return
        }

        if (hasExistingTab) {
          // Send token to existing tab and close
          safePostMessage({
            type: isPasswordReset ? 'password-reset' : 'verify-email',
            token,
          })
          closeTimeoutId = setTimeout(() => {
            if (!isChannelClosed) {
              window.close()
            }
          }, 500)
        } else {
          // No existing tab - handle here
          if (isPasswordReset) {
            setShowPasswordReset(true)
          }
          setSuppressVerification(false)
        }
      }, 200)
    }

    return () => {
      isChannelClosed = true

      // Clear any pending timeouts
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      if (closeTimeoutId !== null) {
        clearTimeout(closeTimeoutId)
      }

      channel.removeEventListener('message', handleMessage)
      try {
        channel.close()
      } catch (_error) {
        // Ignore errors when closing already closed channel
      }
    }
  }, [onCloseAuthModal])

  const handlePasswordResetClose = (email?: string) => {
    setShowPasswordReset(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.pushState({}, '', url)
    if (email) {
      onSetLoginEmail(email)
    }
    onOpenAuthModal('login')
  }

  return {
    verificationToken,
    suppressVerification,
    showPasswordReset,
    setShowPasswordReset,
    handlePasswordResetClose,
  }
}
