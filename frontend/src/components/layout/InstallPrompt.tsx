import { useState, useEffect } from 'react'

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

/**
 * InstallPrompt - Prompts users to install the PWA
 * Shows a banner/button for Android Chrome (using beforeinstallprompt)
 * Shows instructions for iOS Safari (manual install)
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

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
      }
    }

    // Listen for beforeinstallprompt event (Android Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
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
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setIsDismissed(true)
    } else {
      // User dismissed, don't show again for 7 days
      localStorage.setItem('pwa-install-dismissed', Date.now().toString())
      setIsDismissed(true)
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
    setShowIOSInstructions(false)
  }

  // Don't show if already installed or dismissed
  if (isStandalone || isDismissed) {
    return null
  }

  // Show iOS instructions modal
  if (showIOSInstructions) {
    return (
      <div className="install-prompt-overlay" onClick={handleDismiss}>
        <div className="install-prompt-modal" onClick={e => e.stopPropagation()}>
          <button className="install-prompt-close" onClick={handleDismiss} aria-label="Close">
            ×
          </button>
          <div className="install-prompt-modal-content">
            <h3>Install CompareIntel</h3>
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
    <div className="install-prompt-banner">
      <div className="install-prompt-content">
        <div className="install-prompt-info">
          <span className="install-prompt-icon">📱</span>
          <div className="install-prompt-text">
            <strong>Install CompareIntel</strong>
            <span>Get quick access and a better experience</span>
          </div>
        </div>
        <div className="install-prompt-actions">
          <button className="install-prompt-button" onClick={handleInstallClick}>
            Install
          </button>
          <button className="install-prompt-dismiss" onClick={handleDismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
