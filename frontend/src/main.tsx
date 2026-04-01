import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
// KaTeX CSS loaded asynchronously to prevent render-blocking
// It will be loaded when LatexRenderer component is first used
import App from './App.tsx'
import { initializeRegistry } from './config/loadModelConfigs'
import { isCancellationError } from './services/api/errors'
import logger from './utils/logger'
import { initWebVitals } from './utils/performance'

// Deduped/aborted API GETs reject with CancellationError; suppress console noise only (does not affect promise handling)
window.addEventListener('unhandledrejection', event => {
  if (isCancellationError(event.reason)) {
    event.preventDefault()
  }
})

// Defer Sentry so @sentry/react is not on the critical path (Lighthouse / main-thread parse).
const scheduleSentryInit = () => {
  void import('./utils/sentry').then(({ initSentry }) => {
    initSentry()
  })
}
if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  requestIdleCallback(scheduleSentryInit, { timeout: 2500 })
} else {
  setTimeout(scheduleSentryInit, 0)
}

// Disable browser scroll restoration before React renders to prevent unwanted scroll restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}
// Force scroll to top on initial load
window.scrollTo(0, 0)

// Initialize model renderer registry before rendering
initializeRegistry().catch(error => {
  logger.error('Failed to initialize model renderer registry:', error)
})

// Initialize performance monitoring
// Track Web Vitals metrics for Core Web Vitals monitoring
initWebVitals(metric => {
  const emoji =
    metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌'
  logger.debug(
    `${emoji} [Web Vitals] ${metric.name}: ${metric.value.toFixed(2)}ms (${metric.rating})`
  )

  // In production, metrics are automatically sent to analytics endpoint if configured
  // via VITE_PERFORMANCE_ENDPOINT environment variable
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)

// Remove the preload class after first paint so CSS transitions can work normally.
// Double rAF ensures the browser has completed the initial render before enabling transitions.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('preload')
  })
})

// Defer service worker registration until after page load to prevent render-blocking
// This improves FCP and LCP by not blocking the main thread during initial render
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  /** Matches vite-plugin-pwa `registerSW` return value (avoids circular inference vs wrong ambient types). */
  type ActivateSw = (reloadPage?: boolean) => Promise<void>

  const registerSW = () => {
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const sw: { activate?: ActivateSw } = {}
        sw.activate = registerSW({
          immediate: false,
          onNeedRefresh: () => {
            void sw.activate?.(true)
          },
          onOfflineReady: () => {
            // App can now work offline
          },
        }) as unknown as ActivateSw
      })
      .catch(() => {
        // Service worker registration script not available (dev mode or build issue)
      })
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(registerSW, { timeout: 2000 })
  } else {
    setTimeout(registerSW, 2000)
  }
}
