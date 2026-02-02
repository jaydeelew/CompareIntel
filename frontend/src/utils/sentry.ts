/**
 * Sentry Error Monitoring Configuration
 *
 * Initializes Sentry for error tracking and performance monitoring in production.
 * Errors are captured automatically and sent to Sentry dashboard.
 *
 * Environment Variables Required:
 * - VITE_SENTRY_DSN: Your Sentry DSN (Data Source Name)
 * - VITE_SENTRY_ENVIRONMENT: Environment name (production, staging, development)
 */

import * as Sentry from '@sentry/react'

/**
 * Initialize Sentry error monitoring
 *
 * Should be called once at application startup, before React renders.
 * Only initializes in production or when VITE_SENTRY_DSN is set.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || 'production'

  // Skip initialization if no DSN is configured
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.debug('[Sentry] DSN not configured, skipping initialization')
    }
    return
  }

  // Skip in development unless explicitly configured
  if (import.meta.env.DEV && environment !== 'development') {
    console.debug('[Sentry] Skipping initialization in development mode')
    return
  }

  Sentry.init({
    dsn,
    environment,

    // Performance Monitoring
    // Capture 10% of transactions for performance monitoring in production
    // Increase this in staging for more visibility
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

    // Session Replay - captures user sessions on errors
    // Only in production to reduce costs
    replaysSessionSampleRate: environment === 'production' ? 0.01 : 0,
    replaysOnErrorSampleRate: environment === 'production' ? 0.1 : 0,

    // Release tracking
    release: import.meta.env.VITE_APP_VERSION || undefined,

    // Filter out noisy errors
    ignoreErrors: [
      // Browser extensions
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network errors users can't control
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      // User navigation
      'AbortError',
      // Third-party script errors
      'Script error.',
      // Google reCAPTCHA errors
      'grecaptcha',
    ],

    // Don't send errors from local development
    denyUrls: [/localhost/i, /127\.0\.0\.1/i, /0\.0\.0\.0/i],

    // Only capture errors from our domain
    allowUrls: [/https?:\/\/compareintel\.com/i, /https?:\/\/www\.compareintel\.com/i],

    // Attach additional context
    beforeSend(event, _hint) {
      // Don't send events if user has opted out (privacy consideration)
      if (typeof window !== 'undefined' && window.localStorage?.getItem('sentry-opt-out')) {
        return null
      }

      // Add custom tags
      event.tags = {
        ...event.tags,
        app_version: import.meta.env.VITE_APP_VERSION || 'unknown',
      }

      return event
    },

    // Integrations
    integrations: [
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration({
        // Only trace API calls
        traceFetch: true,
        traceXHR: true,
      }),
      // Replay integration for session recording on errors
      Sentry.replayIntegration({
        // Mask all text for privacy
        maskAllText: true,
        // Block all media for privacy
        blockAllMedia: true,
      }),
    ],
  })

  if (import.meta.env.DEV) {
    console.debug('[Sentry] Initialized with environment:', environment)
  }
}

/**
 * Capture a custom error with additional context
 */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.withScope(scope => {
      scope.setExtras(context)
      Sentry.captureException(error)
    })
  } else {
    Sentry.captureException(error)
  }
}

/**
 * Capture a custom message for debugging
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  Sentry.captureMessage(message, level)
}

/**
 * Set user context for error tracking
 */
export function setUserContext(user: { id: string; email?: string } | null): void {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
    })
  } else {
    Sentry.setUser(null)
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string = 'user',
  level: Sentry.SeverityLevel = 'info'
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
  })
}

// Re-export Sentry's ErrorBoundary for React components
export { ErrorBoundary as SentryErrorBoundary } from '@sentry/react'
