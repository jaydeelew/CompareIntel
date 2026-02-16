import { useState, useEffect, useRef } from 'react'

import logger from '../../utils/logger'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface NavigatorStandalone extends Navigator {
  standalone?: boolean
}

interface WindowMSStream extends Window {
  MSStream?: unknown
}

interface WindowGtag extends Window {
  gtag?: (...args: unknown[]) => void
}

/**
 * InstallPrompt - Prompts users to install the PWA
 * Follows 2025 best practices:
 * - Waits for user engagement before showing
 * - Respects reduced motion preferences
 * - Uses safe area insets for mobile devices
 * - Better accessibility support
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const [shouldShow, setShouldShow] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const engagementTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hasShownRef = useRef(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const installButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener('change', handleReducedMotionChange)

    return () => {
      mediaQuery.removeEventListener('change', handleReducedMotionChange)
    }
  }, [])

  useEffect(() => {
    // Check if already installed (standalone mode)
    const navigatorStandalone = window.navigator as NavigatorStandalone
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      navigatorStandalone.standalone === true ||
      document.referrer.includes('android-app://')

    setIsStandalone(isStandaloneMode)

    // Check if iOS
    const windowMSStream = window as WindowMSStream
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !windowMSStream.MSStream
    setIsIOS(iOS)

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10)
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true)
        return
      } else {
        // Clear old dismissal after 7 days
        localStorage.removeItem('pwa-install-dismissed')
      }
    }

    // Track user engagement before showing prompt
    // Best practice: Wait for user engagement (scroll, interaction, or time)
    let engagementCount = 0
    const engagementThreshold = 2 // Require 2 interactions

    const trackEngagement = () => {
      engagementCount++
      if (engagementCount >= engagementThreshold && !hasShownRef.current) {
        hasShownRef.current = true
        setShouldShow(true)
        // Remove listeners once threshold is met
        window.removeEventListener('scroll', trackEngagement)
        window.removeEventListener('click', trackEngagement)
        window.removeEventListener('touchstart', trackEngagement)
        window.removeEventListener('keydown', trackEngagement)
      }
    }

    // Also show after 30 seconds of page time (fallback)
    engagementTimerRef.current = setTimeout(() => {
      if (!hasShownRef.current && engagementCount === 0) {
        hasShownRef.current = true
        setShouldShow(true)
      }
    }, 30000) // 30 seconds

    // Listen for user engagement
    window.addEventListener('scroll', trackEngagement, { passive: true })
    window.addEventListener('click', trackEngagement, { once: true })
    window.addEventListener('touchstart', trackEngagement, { once: true })
    window.addEventListener('keydown', trackEngagement, { once: true })

    // Listen for beforeinstallprompt event (Android Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      if (engagementTimerRef.current) {
        clearTimeout(engagementTimerRef.current)
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('scroll', trackEngagement)
      window.removeEventListener('click', trackEngagement)
      window.removeEventListener('touchstart', trackEngagement)
      window.removeEventListener('keydown', trackEngagement)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // iOS - show instructions
      if (isIOS) {
        setShowIOSInstructions(true)
      }
      return
    }

    // Android Chrome - trigger install prompt
    try {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice

      if (outcome === 'accepted') {
        setDeferredPrompt(null)
        setIsDismissed(true)
        // Track successful installation (optional analytics)
        const windowGtag = window as WindowGtag
        if (typeof windowGtag.gtag !== 'undefined') {
          windowGtag.gtag('event', 'pwa_installed', {
            event_category: 'PWA',
            event_label: 'Install Prompt',
          })
        }
      } else {
        // User dismissed, don't show again for 7 days
        localStorage.setItem('pwa-install-dismissed', Date.now().toString())
        setIsDismissed(true)
      }
    } catch (error) {
      logger.warn('Install prompt error:', error)
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
    setShowIOSInstructions(false)
    // Return focus to install button if modal was open
    if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus()
      previousActiveElementRef.current = null
    } else if (installButtonRef.current) {
      installButtonRef.current.focus()
    }
  }

  // Focus trap effect for modal
  useEffect(() => {
    if (!showIOSInstructions || !modalRef.current) return

    // Store the previously focused element
    previousActiveElementRef.current = document.activeElement as HTMLElement

    // Get all focusable elements within the modal
    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusableElements = Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
    )

    if (focusableElements.length === 0) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus the first element
    firstElement.focus()

    // Handle Tab key to trap focus
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const currentFocus = document.activeElement as HTMLElement

      if (e.shiftKey) {
        // Shift + Tab
        if (currentFocus === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab
        if (currentFocus === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    document.addEventListener('keydown', handleTab)

    return () => {
      document.removeEventListener('keydown', handleTab)
    }
  }, [showIOSInstructions])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleDismiss()
    }
    // Allow Enter and Space to activate buttons
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault()
      if (e.currentTarget instanceof HTMLButtonElement) {
        e.currentTarget.click()
      }
    }
  }

  // Don't show if already installed, dismissed, or not engaged yet
  if (isStandalone || isDismissed || !shouldShow) {
    return null
  }

  // Show iOS instructions modal
  if (showIOSInstructions) {
    return (
      <div
        className="install-prompt-overlay"
        onClick={handleDismiss}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-prompt-title"
      >
        <div
          ref={modalRef}
          className="install-prompt-modal"
          onClick={e => e.stopPropagation()}
          onKeyDown={handleKeyDown}
        >
          <button
            className="install-prompt-close"
            onClick={handleDismiss}
            onKeyDown={handleKeyDown}
            aria-label="Close install instructions"
            type="button"
          >
            ×
          </button>
          <div className="install-prompt-modal-content">
            <h3 id="install-prompt-title">Install CompareIntel</h3>
            <p>To install CompareIntel on your iPhone or iPad:</p>
            <ol>
              <li>
                Tap the <strong>Share</strong> button <span className="ios-share-icon">□↑</span> at
                the bottom of your screen
              </li>
              <li>
                Scroll down and tap <strong>"Add to Home Screen"</strong>
              </li>
              <li>
                Tap <strong>"Add"</strong> in the top right corner
              </li>
            </ol>
            <p className="install-prompt-note">
              Once installed, CompareIntel will appear on your home screen like a native app.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show install banner/button
  return (
    <div
      className={`install-prompt-banner ${prefersReducedMotion ? 'no-animation' : ''}`}
      role="banner"
      aria-label="Install CompareIntel app"
    >
      <div className="install-prompt-content">
        <div className="install-prompt-info">
          <span className="install-prompt-icon" aria-hidden="true">
            📱
          </span>
          <div className="install-prompt-text">
            <strong>Install CompareIntel</strong>
            <span>Get quick access and a better experience</span>
          </div>
        </div>
        <div className="install-prompt-actions">
          <button
            ref={installButtonRef}
            className="install-prompt-button"
            onClick={handleInstallClick}
            onKeyDown={handleKeyDown}
            type="button"
            aria-label="Install CompareIntel app"
          >
            Install
          </button>
          <button
            className="install-prompt-dismiss"
            onClick={handleDismiss}
            onKeyDown={handleKeyDown}
            aria-label="Dismiss install prompt"
            type="button"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
