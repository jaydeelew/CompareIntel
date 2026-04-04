import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { usePWAInstall } from '../../contexts/PWAInstallContext'
import { useTheme } from '../../contexts/ThemeContext'
import { UserMenu } from '../auth'

const INITIAL_SHOW_MS = 5000
const INACTIVITY_HIDE_MS = 5000
/** Scroll offset (px) considered “at top” for arming / scroll-based state. */
const AT_TOP_PX = 12
/**
 * Wheel-based reveal must see scroll this close to 0. Stricter than AT_TOP_PX so elastic
 * overscroll (or bounce) while still mid-page cannot open the bar.
 */
const AT_TOP_WHEEL_REVEAL_PX = 2
/** Wait this long after the last scroll event while at top before arming `ready` (scroll chain settle). */
const AT_TOP_SETTLE_MS = 280
/**
 * No wheel-based reveal until this long after the last scroll/scrollend at top.
 * Short enough for a quick follow-up flick; scrollend keeps overscroll tails from resetting this late.
 */
const MIN_MS_AFTER_LAST_SCROLL_AT_TOP = 420
/**
 * Two-wheel path only: first upward wheel consumes overscroll; second opens after this gap (ms).
 * Skipped when the bar folded while already at top (single upward wheel opens).
 */
const MIN_MS_BETWEEN_WHEEL_INTENTS = 280
/**
 * After scrolling from below the top to the top (fling / overscroll chain), block wheel reveal
 * until this quiet period — separate from “already at top” two-flick open.
 */
const SUPPRESS_WHEEL_MS_AFTER_LANDING_FROM_BELOW = 1650

interface NavigationProps {
  isAuthenticated: boolean
  isAdmin: boolean
  currentView: 'main' | 'admin'
  onViewChange?: (view: 'main' | 'admin') => void // Optional for backward compatibility
  onSignInClick: () => void
  onSignUpClick: () => void
  /**
   * When true, the navbar theme toggle is hidden at max-width 480px because
   * the main page shows it in the Hero instead. Omit on routes without Hero (e.g. admin).
   */
  hideNavThemeToggleOnMobile?: boolean
  /** While the tutorial welcome modal is visible, the bar stays unfolded (no initial fold timer). */
  tutorialWelcomeModalOpen?: boolean
  /** Set true once the welcome modal was shown (unauthenticated flow). */
  welcomeModalEverShown?: boolean
  /** Increment only when the user clicks “Skip for Now” on the welcome modal (fold 5s after skip). */
  welcomeSkipFoldNonce?: number
}

/**
 * Navigation - Main navigation bar with logo, brand, and auth actions
 */
export function Navigation({
  isAuthenticated,
  isAdmin,
  currentView,
  onViewChange,
  onSignInClick,
  onSignUpClick,
  hideNavThemeToggleOnMobile = false,
  tutorialWelcomeModalOpen = false,
  welcomeModalEverShown = false,
  welcomeSkipFoldNonce = 0,
}: NavigationProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isStandalone } = usePWAInstall()
  const { theme, toggleTheme } = useTheme()
  const shellRef = useRef<HTMLDivElement>(null)
  const lastScrollY = useRef(0)
  const foldedRef = useRef(false)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Until the first post-load fold, do not run the 5s inactivity hide (initial 5s is fixed). */
  const initialPhaseRef = useRef(true)
  /** True after user has reached the top (from below) or was already at top when the bar folded. */
  const readyForSecondScrollUpRef = useRef(false)
  /** Timestamp of last scroll event while folded and at top (wheel reveal waits after this). */
  const lastScrollWhileAtTopRef = useRef(0)
  /** First upward wheel after quiet period consumes overscroll; second opens the bar. */
  const firstWheelAtTopConsumedAtRef = useRef<number | null>(null)
  const atTopSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** While folded, user has scrolled with scrollY > AT_TOP_PX at least once (not “always at top”). */
  const hadScrollBelowTopWhileFoldedRef = useRef(false)
  /** Wheel reveal blocked until this time (ms since epoch) after landing from below. */
  const suppressWheelRevealUntilRef = useRef(0)
  /**
   * True when the bar just folded with scroll already at top — one upward wheel may reveal.
   * Cleared after scrolling below top or landing-from-below handling (then two-wheel path applies).
   */
  const singleWheelRevealAtTopRef = useRef(false)
  const initialFoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [folded, setFolded] = useState(false)

  const clearInitialFoldTimer = useCallback(() => {
    if (initialFoldTimerRef.current) {
      clearTimeout(initialFoldTimerRef.current)
      initialFoldTimerRef.current = null
    }
  }, [])

  const clearAtTopSettleTimer = useCallback(() => {
    if (atTopSettleTimerRef.current) {
      clearTimeout(atTopSettleTimerRef.current)
      atTopSettleTimerRef.current = null
    }
  }, [])

  foldedRef.current = folded

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
  }, [])

  const scheduleInactivityHide = useCallback(() => {
    if (isStandalone) return
    clearInactivityTimer()
    inactivityTimerRef.current = setTimeout(() => {
      setFolded(true)
      inactivityTimerRef.current = null
    }, INACTIVITY_HIDE_MS)
  }, [clearInactivityTimer, isStandalone])

  const handleNavActivity = useCallback(() => {
    if (foldedRef.current) return
    if (initialPhaseRef.current) return
    scheduleInactivityHide()
  }, [scheduleInactivityHide])

  /**
   * Initial fold: 5s after load unless the welcome modal is open (stay unfolded until it closes).
   * After “Skip for Now”, fold 5s after the skip. After “Start Tutorial” (or other dismiss without skip),
   * fold immediately.
   */
  useEffect(() => {
    clearInitialFoldTimer()
    setFolded(false)
    initialPhaseRef.current = true

    /** Installed PWA / standalone: keep the bar always visible (no auto-hide). */
    if (isStandalone) {
      initialPhaseRef.current = false
      return () => clearInitialFoldTimer()
    }

    if (tutorialWelcomeModalOpen) {
      return () => clearInitialFoldTimer()
    }

    const skipNonce = welcomeSkipFoldNonce
    if (welcomeModalEverShown && skipNonce === 0) {
      setFolded(true)
      initialPhaseRef.current = false
      return () => clearInitialFoldTimer()
    }

    if (skipNonce > 0) {
      initialFoldTimerRef.current = setTimeout(() => {
        setFolded(true)
        initialPhaseRef.current = false
        initialFoldTimerRef.current = null
      }, INITIAL_SHOW_MS)
      return () => clearInitialFoldTimer()
    }

    initialFoldTimerRef.current = setTimeout(() => {
      setFolded(true)
      initialPhaseRef.current = false
      initialFoldTimerRef.current = null
    }, INITIAL_SHOW_MS)
    return () => clearInitialFoldTimer()
  }, [
    isStandalone,
    tutorialWelcomeModalOpen,
    welcomeModalEverShown,
    welcomeSkipFoldNonce,
    clearInitialFoldTimer,
  ])

  /** When the bar folds: if already at top, arm only after the same settle delay (no instant ready). */
  useEffect(() => {
    if (!folded) return
    const shell = shellRef.current
    if (!shell) return
    const app = shell.closest('.app')
    const getScrollY = () => {
      const winY = window.scrollY ?? document.documentElement.scrollTop ?? 0
      const appY = app instanceof HTMLElement ? app.scrollTop : 0
      return Math.max(winY, appY)
    }
    const y = getScrollY()
    lastScrollY.current = y
    readyForSecondScrollUpRef.current = false
    firstWheelAtTopConsumedAtRef.current = null
    suppressWheelRevealUntilRef.current = 0
    hadScrollBelowTopWhileFoldedRef.current = y > AT_TOP_PX
    singleWheelRevealAtTopRef.current = y <= AT_TOP_PX
    clearAtTopSettleTimer()

    if (y > AT_TOP_PX) return

    atTopSettleTimerRef.current = setTimeout(() => {
      atTopSettleTimerRef.current = null
      if (!foldedRef.current) return
      if (getScrollY() > AT_TOP_PX) return
      readyForSecondScrollUpRef.current = true
      lastScrollWhileAtTopRef.current = performance.now()
    }, AT_TOP_SETTLE_MS)

    return () => clearAtTopSettleTimer()
  }, [folded, clearAtTopSettleTimer])

  /**
   * While folded: do not open on scroll toward the top. After landing at top, the next scroll-up
   * intent (wheel) reveals the bar. Scroll/wheel share the same scroll position helpers.
   */
  useEffect(() => {
    if (isStandalone) return

    const shell = shellRef.current
    if (!shell) return

    const app = shell.closest('.app')

    const getScrollY = () => {
      const winY = window.scrollY ?? document.documentElement.scrollTop ?? 0
      const appY = app instanceof HTMLElement ? app.scrollTop : 0
      return Math.max(winY, appY)
    }

    lastScrollY.current = getScrollY()

    const revealFromFolded = () => {
      setFolded(false)
      clearInactivityTimer()
      scheduleInactivityHide()
      readyForSecondScrollUpRef.current = false
      firstWheelAtTopConsumedAtRef.current = null
      suppressWheelRevealUntilRef.current = 0
    }

    const applyLandingFromBelowSuppress = () => {
      suppressWheelRevealUntilRef.current =
        performance.now() + SUPPRESS_WHEEL_MS_AFTER_LANDING_FROM_BELOW
      firstWheelAtTopConsumedAtRef.current = null
      hadScrollBelowTopWhileFoldedRef.current = false
      singleWheelRevealAtTopRef.current = false
    }

    const onScroll = () => {
      const prev = lastScrollY.current
      const current = getScrollY()
      lastScrollY.current = current

      if (!foldedRef.current) return

      if (current > AT_TOP_PX) {
        hadScrollBelowTopWhileFoldedRef.current = true
        singleWheelRevealAtTopRef.current = false
        readyForSecondScrollUpRef.current = false
        firstWheelAtTopConsumedAtRef.current = null
        clearAtTopSettleTimer()
        return
      }

      // Crossed into “at top” from below in one scroll step — fling/overscroll often ends here.
      if (prev > AT_TOP_PX && current <= AT_TOP_PX) {
        applyLandingFromBelowSuppress()
      }

      lastScrollWhileAtTopRef.current = performance.now()

      // At top: do not arm until scroll motion has settled (debounce). Overscroll keeps firing
      // scroll events; resetting the timer prevents arming until that stops.
      clearAtTopSettleTimer()
      readyForSecondScrollUpRef.current = false

      atTopSettleTimerRef.current = setTimeout(() => {
        atTopSettleTimerRef.current = null
        if (!foldedRef.current) return
        if (getScrollY() > AT_TOP_PX) return
        readyForSecondScrollUpRef.current = true
        lastScrollWhileAtTopRef.current = performance.now()
      }, AT_TOP_SETTLE_MS)
    }

    const onWheel = (e: WheelEvent) => {
      if (!foldedRef.current) return
      if (!readyForSecondScrollUpRef.current) return
      if (e.deltaY >= 0) return
      if (performance.now() < suppressWheelRevealUntilRef.current) {
        firstWheelAtTopConsumedAtRef.current = null
        return
      }

      // Last committed scroll position (from scroll events). If we're not actually at the top
      // according to scroll, ignore wheel — avoids races where overscroll applies before scroll fires.
      if (lastScrollY.current > AT_TOP_PX) {
        firstWheelAtTopConsumedAtRef.current = null
        return
      }

      const y = getScrollY()
      // Stricter than ready/arming: rubber-band can report small scrollTop while still mid-page.
      if (y > AT_TOP_WHEEL_REVEAL_PX) return

      const now = performance.now()
      if (now - lastScrollWhileAtTopRef.current < MIN_MS_AFTER_LAST_SCROLL_AT_TOP) return

      if (singleWheelRevealAtTopRef.current) {
        revealFromFolded()
        return
      }

      if (firstWheelAtTopConsumedAtRef.current === null) {
        firstWheelAtTopConsumedAtRef.current = now
        return
      }
      if (now - firstWheelAtTopConsumedAtRef.current < MIN_MS_BETWEEN_WHEEL_INTENTS) return

      revealFromFolded()
    }

    /** When supported, anchor “last scroll” to when scrolling actually ends (better than last scroll tick). */
    const onScrollEnd = () => {
      if (!foldedRef.current) return
      if (getScrollY() > AT_TOP_PX) return
      // Momentum scroll can land at top without a single scroll event crossing prev>AT_TOP (coarse steps).
      if (hadScrollBelowTopWhileFoldedRef.current) {
        applyLandingFromBelowSuppress()
      }
      lastScrollWhileAtTopRef.current = performance.now()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    // Capture: read scroll before the browser applies wheel delta (reduces false “at top” during overscroll).
    window.addEventListener('wheel', onWheel, { passive: true, capture: true })
    window.addEventListener('scrollend', onScrollEnd, { passive: true })
    if (app) {
      app.addEventListener('scroll', onScroll, { passive: true })
      app.addEventListener('scrollend', onScrollEnd, { passive: true })
    }
    return () => {
      clearAtTopSettleTimer()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('scrollend', onScrollEnd)
      if (app) {
        app.removeEventListener('scroll', onScroll)
        app.removeEventListener('scrollend', onScrollEnd)
      }
    }
  }, [isStandalone, clearInactivityTimer, scheduleInactivityHide, clearAtTopSettleTimer])

  /** Portaled menus/modals (e.g. UserMenu) are outside the shell but still count as navbar activity. */
  useEffect(() => {
    if (folded) return
    const onDocActivity = (e: Event) => {
      if (initialPhaseRef.current) return
      const t = e.target
      if (!(t instanceof Element)) return
      if (shellRef.current?.contains(t)) return
      if (t.closest('.modal-overlay')) scheduleInactivityHide()
    }
    document.addEventListener('pointerdown', onDocActivity, true)
    document.addEventListener('focusin', onDocActivity, true)
    return () => {
      document.removeEventListener('pointerdown', onDocActivity, true)
      document.removeEventListener('focusin', onDocActivity, true)
    }
  }, [folded, scheduleInactivityHide])

  // Use React Router navigation if available, fallback to onViewChange prop
  const handleViewChange = (view: 'main' | 'admin') => {
    if (onViewChange) {
      onViewChange(view)
    } else {
      navigate(view === 'admin' ? '/admin' : '/')
    }
  }

  // Determine current view from location if not provided
  const actualCurrentView = currentView || (location.pathname === '/admin' ? 'admin' : 'main')

  const headerClass = hideNavThemeToggleOnMobile
    ? 'app-header app-header--mobile-theme-toggle-in-hero'
    : 'app-header'

  const shellClass = `app-header-shell${folded ? ' app-header-shell--folded' : ''}`

  return (
    <div
      ref={shellRef}
      className={shellClass}
      aria-hidden={folded ? true : undefined}
      onPointerDown={handleNavActivity}
      onFocus={handleNavActivity}
      onKeyDown={handleNavActivity}
    >
      <header className={headerClass}>
        <nav className="navbar">
          <div className="nav-brand">
            <div className="brand-logo">
              <img
                src="/brand/logo.svg"
                alt="CompareIntel Logo"
                className="logo-icon"
                width="36"
                height="36"
                loading="eager"
              />
              <div className="brand-text">
                <div className="brand-name">CompareIntel</div>
                <span className="brand-tagline">AI Model Comparison Platform</span>
              </div>
            </div>
          </div>

          <div className="nav-actions">
            <div className="nav-theme-toggle-wrapper">
              <button
                className="nav-button theme-toggle"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                data-testid="theme-toggle"
              >
                {theme === 'dark' ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
            </div>
            {isAuthenticated ? (
              <>
                {isAdmin && (
                  <button
                    className="admin-avatar-button"
                    onClick={() =>
                      handleViewChange(actualCurrentView === 'admin' ? 'main' : 'admin')
                    }
                    aria-label={actualCurrentView === 'admin' ? 'Back to Main App' : 'Admin Panel'}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
                      <path d="M14 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6Z" />
                      <path d="M4 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2Z" />
                      <path d="M14 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2Z" />
                    </svg>
                  </button>
                )}
                <UserMenu />
              </>
            ) : (
              <>
                <button
                  className="nav-button-text"
                  onClick={onSignInClick}
                  data-testid="nav-sign-in-button"
                >
                  Sign In
                </button>
                <button
                  className="nav-button-primary"
                  onClick={onSignUpClick}
                  data-testid="nav-sign-up-button"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </nav>
      </header>
    </div>
  )
}
