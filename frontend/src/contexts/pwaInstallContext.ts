import { createContext } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface NavigatorStandalone extends Navigator {
  standalone?: boolean
}

export interface WindowMSStream extends Window {
  MSStream?: unknown
}

export interface WindowGtag extends Window {
  gtag?: (...args: unknown[]) => void
}

export const DISMISSED_KEY = 'pwa-install-dismissed'
export const DISMISSAL_DAYS = 7

export interface PWAInstallContextValue {
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

export const PWAInstallContext = createContext<PWAInstallContextValue | undefined>(undefined)
