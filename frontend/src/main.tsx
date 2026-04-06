import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
// KaTeX CSS loaded asynchronously to prevent render-blocking
// It will be loaded when LatexRenderer component is first used
import App from './App.tsx'
import { initializeRegistry } from './config/loadModelConfigs'
import logger from './utils/logger'
import { initWebVitals } from './utils/performance'

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
  // Use requestIdleCallback if available, otherwise defer with setTimeout
  const registerSW = () => {
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({
          immediate: false,
          onNeedRefresh: () => {
            // Handle update available
          },
          onOfflineReady: () => {
            // Handle offline ready
          },
        }).catch((error: unknown) => {
          logger.warn('Service worker registration failed:', error)
        })
      })
      .catch(() => {
        // Service worker registration script not available (dev mode or build issue)
      })
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(registerSW, { timeout: 2000 })
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(registerSW, 2000)
  }
}
