/**
 * InstallPrompt - Prompts users to install the PWA
 *
 * Follows web.dev best practices:
 * - Waits for user engagement before showing
 * - Android: Only shows after beforeinstallprompt has fired
 * - iOS: Shows manual Add to Home Screen instructions
 * - Respects reduced motion preferences
 * - Uses safe area insets for mobile devices
 */

import { useEffect, useRef } from 'react'

import { usePWAInstall } from '../../contexts/PWAInstallContext'

export function InstallPrompt() {
  const {
    showInstallBanner,
    showIOSInstructions,
    triggerInstall,
    dismissBanner,
    closeIOSInstructions,
    prefersReducedMotion,
  } = usePWAInstall()

  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const installButtonRef = useRef<HTMLButtonElement>(null)

  // Focus trap for iOS instructions modal
  useEffect(() => {
    if (!showIOSInstructions || !modalRef.current) return

    previousActiveElementRef.current = document.activeElement as HTMLElement
    const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const elements = Array.from(modalRef.current.querySelectorAll<HTMLElement>(focusable))
    if (elements.length > 0) {
      elements[0].focus()
      const first = elements[0]
      const last = elements[elements.length - 1]
      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return
        const current = document.activeElement as HTMLElement
        if (e.shiftKey && current === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && current === last) {
          e.preventDefault()
          first.focus()
        }
      }
      document.addEventListener('keydown', handleTab)
      return () => document.removeEventListener('keydown', handleTab)
    }
  }, [showIOSInstructions])

  const handleDismiss = () => {
    dismissBanner()
    if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus()
      previousActiveElementRef.current = null
    } else if (installButtonRef.current) {
      installButtonRef.current.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleDismiss()
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault()
      if (e.currentTarget instanceof HTMLButtonElement) {
        e.currentTarget.click()
      }
    }
  }

  if (!showInstallBanner && !showIOSInstructions) {
    return null
  }

  // iOS manual instructions modal
  if (showIOSInstructions) {
    return (
      <div
        className="install-prompt-overlay"
        onClick={closeIOSInstructions}
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
            onClick={closeIOSInstructions}
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

  // Install banner
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
            onClick={triggerInstall}
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
