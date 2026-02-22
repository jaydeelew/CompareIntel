/**
 * PWA Install Context
 *
 * Provides PWA installation state and actions across the app.
 * Follows web.dev best practices:
 * - Only show promotion after beforeinstallprompt (Android) or engagement (iOS)
 * - Re-prompt after meaningful engagement (e.g. sign-in)
 * - Install option available in multiple places (banner + footer link)
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

import logger from '../utils/logger'

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

const DISMISSED_KEY = 'pwa-install-dismissed'
const DISMISSAL_DAYS = 7

interface PWAInstallContextValue {
  /** Whether the app can be installed (not already standalone) */
  canInstall: boolean
  /** Whether to show the auto-appearing banner (engagement + criteria met) */
  showInstallBanner: boolean
  /** Whether to show iOS manual instructions modal */
  showIOSInstructions: boolean
  /** Trigger the install flow (native prompt or iOS instructions) */
  triggerInstall: () => Promise<void>
  /** Dismiss the banner and remember preference */
  dismissBanner: () => void
  /** Close iOS instructions modal */
  closeIOSInstructions: () => void
  /** Is iOS (needs manual Add to Home Screen) */
  isIOS: boolean
  /** Is running as installed PWA */
  isStandalone: boolean
  prefersReducedMotion: boolean
}

const PWAInstallContext = createContext<PWAInstallContextValue | undefined>(undefined)

export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const [shouldShowBanner, setShouldShowBanner] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const engagementTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hasShownRef = useRef(false)

  const canInstall = !isStandalone

  // Best practice: On Android, only show after beforeinstallprompt has fired
  // On iOS, beforeinstallprompt never fires, so show based on engagement only
  const showInstallBanner =
    canInstall && !isDismissed && shouldShowBanner && (deferredPrompt !== null || isIOS)

  const checkDismissed = useCallback(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10)
      if (Date.now() - dismissedTime < DISMISSAL_DAYS * 24 * 60 * 60 * 1000) {
        return true
      }
      localStorage.removeItem(DISMISSED_KEY)
    }
    return false
  }, [])

  // Reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // Platform detection and dismissal check
  useEffect(() => {
    const nav = window.navigator as NavigatorStandalone
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      nav.standalone === true ||
      document.referrer.includes('android-app://')
    setIsStandalone(standalone)

    const windowMSStream = window as WindowMSStream
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !windowMSStream.MSStream)

    setIsDismissed(checkDismissed())
  }, [checkDismissed])

  // Listen for auth sign-in (meaningful engagement - clear dismissal per best practice)
  useEffect(() => {
    const handleSignedIn = () => {
      localStorage.removeItem(DISMISSED_KEY)
      setIsDismissed(false)
    }
    window.addEventListener('auth-signed-in', handleSignedIn)
    return () => window.removeEventListener('auth-signed-in', handleSignedIn)
  }, [])

  // Engagement tracking and beforeinstallprompt
  useEffect(() => {
    let engagementCount = 0
    const threshold = 2

    const trackEngagement = () => {
      engagementCount++
      if (engagementCount >= threshold && !hasShownRef.current) {
        hasShownRef.current = true
        setShouldShowBanner(true)
        window.removeEventListener('scroll', trackEngagement)
        window.removeEventListener('click', trackEngagement)
        window.removeEventListener('touchstart', trackEngagement)
        window.removeEventListener('keydown', trackEngagement)
      }
    }

    engagementTimerRef.current = setTimeout(() => {
      if (!hasShownRef.current && engagementCount === 0) {
        hasShownRef.current = true
        setShouldShowBanner(true)
      }
    }, 30000)

    window.addEventListener('scroll', trackEngagement, { passive: true })
    window.addEventListener('click', trackEngagement, { once: true })
    window.addEventListener('touchstart', trackEngagement, { once: true })
    window.addEventListener('keydown', trackEngagement, { once: true })

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsDismissed(true)
      localStorage.setItem(DISMISSED_KEY, Date.now().toString())
      const gtag = (window as WindowGtag).gtag
      if (typeof gtag === 'function') {
        gtag('event', 'pwa_installed', {
          event_category: 'PWA',
          event_label: 'appinstalled',
        })
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      if (engagementTimerRef.current) clearTimeout(engagementTimerRef.current)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('scroll', trackEngagement)
      window.removeEventListener('click', trackEngagement)
      window.removeEventListener('touchstart', trackEngagement)
      window.removeEventListener('keydown', trackEngagement)
    }
  }, [])

  const triggerInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') {
          setDeferredPrompt(null)
          setIsDismissed(true)
          localStorage.setItem(DISMISSED_KEY, Date.now().toString())
          // Analytics tracked via appinstalled event (fires for all install methods)
        } else {
          localStorage.setItem(DISMISSED_KEY, Date.now().toString())
          setIsDismissed(true)
        }
      } catch (error) {
        logger.warn('Install prompt error:', error)
      }
    } else if (isIOS) {
      setShowIOSInstructions(true)
    }
  }, [deferredPrompt, isIOS])

  const dismissBanner = useCallback(() => {
    setIsDismissed(true)
    localStorage.setItem(DISMISSED_KEY, Date.now().toString())
    setShowIOSInstructions(false)
  }, [])

  const closeIOSInstructions = useCallback(() => {
    setShowIOSInstructions(false)
  }, [])

  const value: PWAInstallContextValue = {
    canInstall,
    showInstallBanner,
    showIOSInstructions,
    triggerInstall,
    dismissBanner,
    closeIOSInstructions,
    isIOS,
    isStandalone,
    prefersReducedMotion,
  }

  return <PWAInstallContext.Provider value={value}>{children}</PWAInstallContext.Provider>
}

export function usePWAInstall(): PWAInstallContextValue {
  const context = useContext(PWAInstallContext)
  if (context === undefined) {
    throw new Error('usePWAInstall must be used within PWAInstallProvider')
  }
  return context
}
