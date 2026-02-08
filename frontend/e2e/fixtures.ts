/* eslint-disable react-hooks/rules-of-hooks */
// This file uses Playwright's fixture pattern with 'use' parameter,
// which is not related to React hooks. Disabling react-hooks rule for entire file.

import { test as base, expect, Page, BrowserContext } from '@playwright/test'

/**
 * Comprehensive Test Fixtures for CompareIntel E2E Tests
 *
 * This module provides reusable fixtures for:
 * - User authentication (all tiers and roles)
 * - Page navigation (pre-navigated pages)
 * - Test data generation
 * - API mocking and helpers
 * - Common test utilities
 *
 * Usage:
 *   import { test, expect } from './fixtures'
 *
 *   test('My test', async ({ freeTierPage }) => {
 *     // freeTierPage is already logged in as a free tier user
 *   })
 */

/**
 * Helper function to safely wait with page validity check
 */
async function safeWait(page: Page, ms: number) {
  try {
    if (page.isClosed()) {
      return
    }
    await page.waitForTimeout(ms)
  } catch (error) {
    if (error instanceof Error && error.message.includes('closed')) {
      return
    }
    throw error
  }
}

/**
 * Wait for auth state to be determined (auth context initialized)
 * This ensures React has hydrated and auth context has finished loading
 */
async function waitForAuthState(page: Page, timeout: number = 20000): Promise<void> {
  // Check page validity before starting
  if (page.isClosed()) {
    return // Page already closed, nothing to wait for
  }

  // Strategy: Wait for auth context to finish loading by checking React state
  // The auth context sets isLoading to false when done, and isAuthenticated to true/false
  // We can detect this by waiting for either sign-in buttons (unauthenticated) or user menu (authenticated)
  try {
    // First, wait for navigation element (indicates React has rendered)
    const navTimeout = Math.min(timeout, 10000)
    await page.waitForSelector('.navbar, .app-header, nav', {
      timeout: navTimeout,
      state: 'attached', // Just need it in DOM, not necessarily visible
    })

    // Check page validity after navigation wait
    if (page.isClosed()) {
      return
    }

    // Wait for auth state to be determined by checking for auth buttons or user menu
    // Use waitForFunction to check React state directly
    await Promise.race([
      page.waitForFunction(
        () => {
          // Check if navigation exists
          const nav = document.querySelector('.navbar, .app-header, nav')
          if (!nav) return false

          // Check for sign-in button (unauthenticated state)
          const signInButton = document.querySelector('[data-testid="nav-sign-in-button"]')
          // Check for user menu (authenticated state)
          const userMenu = document.querySelector('[data-testid="user-menu-button"]')

          // Auth state is determined when either button is present
          return signInButton !== null || userMenu !== null
        },
        { timeout: Math.min(timeout, 15000) }
      ),
      // Timeout guard to prevent hanging
      new Promise(resolve => setTimeout(resolve, Math.min(timeout, 15000))),
    ])
  } catch (_error) {
    // If page closed, exit gracefully
    if (page.isClosed()) {
      return
    }

    // Fallback: Try waiting for buttons directly with locators
    try {
      const signInButton = page.getByTestId('nav-sign-in-button')
      const userMenu = page.getByTestId('user-menu-button')

      await Promise.race([
        signInButton
          .waitFor({ state: 'attached', timeout: Math.min(timeout, 10000) })
          .catch(() => {}),
        userMenu.waitFor({ state: 'attached', timeout: Math.min(timeout, 10000) }).catch(() => {}),
      ])
    } catch (fallbackError) {
      // If page closed during fallback, exit gracefully
      if (page.isClosed()) {
        return
      }
      // Log but don't throw - auth state might still be loading, test can continue
      console.log(
        `[DEBUG] Auth state wait failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      )
    }
  }
}

/**
 * Wait for React to hydrate and page to be interactive
 */
async function waitForReactHydration(page: Page, timeout: number = 15000): Promise<void> {
  if (page.isClosed()) {
    return
  }

  try {
    // Wait for React to hydrate by checking for React-rendered content
    await page.waitForFunction(
      () => {
        // Check for basic React-rendered elements
        const hasBody = document.body !== null
        const hasContent = document.body && document.body.children.length > 0
        const hasReactRoot =
          document.querySelector('#root, [data-reactroot], [id^="root"]') !== null

        return hasBody && hasContent && (hasReactRoot || document.body.innerHTML.length > 100)
      },
      { timeout }
    )
  } catch (_error) {
    // If function wait fails, check if page closed
    if (page.isClosed()) {
      return
    }
    // Otherwise, just verify body exists as fallback
    // This is a fallback - page might still be loading
    try {
      await page.waitForSelector('body', { timeout: 5000 })
    } catch {
      // Body check also failed, but don't throw - page might be loading
    }
  }
}

/**
 * Retry element detection with exponential backoff
 */
async function retryElementDetection<T>(
  page: Page,
  action: () => Promise<T>,
  options: {
    maxRetries?: number
    retryDelay?: number
    timeout?: number
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 500, timeout = 10000 } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Check page validity before each attempt
    if (page.isClosed()) {
      // If page is closed, check if it's recoverable or if we should fail
      // For now, throw error but with more context
      throw new Error(
        `Page was closed during element detection retry (attempt ${attempt + 1}/${maxRetries})`
      )
    }

    try {
      // Wrap action in a check to catch page closure during execution
      const result = await Promise.race([
        (async () => {
          // Double-check page is still valid right before action
          if (page.isClosed()) {
            throw new Error('Page was closed right before action execution')
          }
          return await action()
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Action timeout')), timeout)
        ),
      ])
      return result
    } catch (error) {
      // Check if page closed during action
      if (page.isClosed()) {
        throw new Error(
          `Page was closed during action execution (attempt ${attempt + 1}/${maxRetries})`
        )
      }

      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        break
      }

      // Wait before retry with exponential backoff
      // Check page validity during wait
      try {
        await safeWait(page, retryDelay * Math.pow(2, attempt))
        // Check again after wait
        if (page.isClosed()) {
          throw new Error(
            `Page was closed during retry delay (attempt ${attempt + 1}/${maxRetries})`
          )
        }
      } catch (_waitError) {
        if (page.isClosed()) {
          throw new Error(
            `Page was closed during retry delay (attempt ${attempt + 1}/${maxRetries})`
          )
        }
        // If wait error is not page closure, continue to next retry
      }
    }
  }

  throw lastError || new Error('Element detection failed after retries')
}

/**
 * Helper function to dismiss the tutorial overlay if it appears
 * Tutorial is disabled on mobile layouts (viewport width <= 768px), so we skip dismissal on mobile
 */
async function dismissTutorialOverlay(page: Page) {
  try {
    if (page.isClosed()) {
      return
    }

    await safeWait(page, 500)

    // First check if tutorial overlay is actually visible, regardless of viewport
    // Sometimes it appears on mobile even though it shouldn't
    const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
    const overlayVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)

    // Check if we're on a mobile viewport (tutorial is disabled on mobile - width <= 768px)
    const viewport = page.viewportSize()
    const isMobileViewport = viewport && viewport.width <= 768

    // If on mobile and overlay is not visible, skip dismissal (tutorial shouldn't appear)
    if (isMobileViewport && !overlayVisible) {
      // Tutorial is not available on mobile and not visible, so skip dismissal
      return
    }

    // If overlay is visible (even on mobile), we need to dismiss it

    const welcomeModal = page.locator('.tutorial-welcome-backdrop')
    const welcomeVisible = await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)

    if (welcomeVisible && !page.isClosed()) {
      const skipButton = page.locator(
        '.tutorial-welcome-button-secondary, button:has-text("Skip for Now")'
      )
      const skipVisible = await skipButton.isVisible({ timeout: 3000 }).catch(() => false)

      if (skipVisible && !page.isClosed()) {
        try {
          await skipButton.waitFor({ state: 'visible', timeout: 5000 })
          await safeWait(page, 300)

          if (!page.isClosed()) {
            await skipButton.click({ timeout: 10000, force: false }).catch(async () => {
              if (!page.isClosed()) {
                await skipButton.click({ timeout: 5000, force: true })
              }
            })
            await welcomeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await safeWait(page, 500)
          }
        } catch (_clickError) {
          if (!page.isClosed()) {
            await page.keyboard.press('Escape').catch(() => {})
            await safeWait(page, 500)
          }
        }
      } else if (!page.isClosed()) {
        await page.keyboard.press('Escape').catch(() => {})
        await safeWait(page, 500)
      }
    }

    if (page.isClosed()) {
      return
    }

    // Re-check overlay visibility (it may have changed)
    const overlayStillVisible = await tutorialOverlay
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    if (overlayStillVisible && !page.isClosed()) {
      const closeButton = page.locator(
        '.tutorial-close-button, button[aria-label*="Skip"], button[aria-label*="skip"]'
      )
      const closeVisible = await closeButton.isVisible({ timeout: 3000 }).catch(() => false)

      if (closeVisible && !page.isClosed()) {
        try {
          await closeButton.waitFor({ state: 'visible', timeout: 5000 })
          await safeWait(page, 300)

          if (!page.isClosed()) {
            await closeButton.click({ timeout: 10000, force: false }).catch(async () => {
              if (!page.isClosed()) {
                await closeButton.click({ timeout: 5000, force: true })
              }
            })
            await tutorialOverlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await safeWait(page, 500)
          }
        } catch (_clickError) {
          if (!page.isClosed()) {
            await page.keyboard.press('Escape').catch(() => {})
            await safeWait(page, 500)
          }
        }
      } else if (!page.isClosed()) {
        await page.keyboard.press('Escape').catch(() => {})
        await safeWait(page, 500)
      }
    }

    if (!page.isClosed()) {
      await safeWait(page, 500)
      const stillVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)
      if (stillVisible && !page.isClosed()) {
        await page.keyboard.press('Escape').catch(() => {})
        await safeWait(page, 500)
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('closed')) {
      return
    }
    console.log(
      'Tutorial overlay dismissal attempted:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

// ============================================================================
// Configuration & Constants
// ============================================================================

// Test credentials (can be overridden via environment variables)
const TEST_CREDENTIALS = {
  free: {
    email: process.env.TEST_FREE_EMAIL || 'free@test.com',
    password: process.env.TEST_FREE_PASSWORD || 'Test12345678/',
  },
  starter: {
    email: process.env.TEST_STARTER_EMAIL || 'starter@test.com',
    password: process.env.TEST_STARTER_PASSWORD || 'Test12345678/',
  },
  starterPlus: {
    email: process.env.TEST_STARTER_PLUS_EMAIL || 'starter_plus@test.com',
    password: process.env.TEST_STARTER_PLUS_PASSWORD || 'Test12345678/',
  },
  pro: {
    email: process.env.TEST_PRO_EMAIL || 'pro@test.com',
    password: process.env.TEST_PRO_PASSWORD || 'Test12345678/',
  },
  proPlus: {
    email: process.env.TEST_PRO_PLUS_EMAIL || 'pro_plus@test.com',
    password: process.env.TEST_PRO_PLUS_PASSWORD || 'Test12345678/',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || 'AdminPassword123!',
  },
  moderator: {
    email: process.env.MODERATOR_EMAIL || 'moderator@test.com',
    password: process.env.MODERATOR_PASSWORD || 'Test12345678/',
  },
}

// Base URL for the application
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * API-based login - much faster than UI login, essential for CI stability
 * This authenticates by calling the login API directly and setting cookies on the browser context
 */
async function apiLogin(
  context: BrowserContext,
  page: Page,
  email: string,
  password: string
): Promise<boolean> {
  try {
    // Clear rate limiting first
    await fetch(`${BACKEND_URL}/api/dev/reset-rate-limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: null }),
    }).catch(() => {})

    // Call login API directly
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      console.log(`API login failed for ${email}: ${response.status}`)
      return false
    }

    const data = await response.json()
    const { access_token, refresh_token } = data

    if (!access_token || !refresh_token) {
      console.log(`API login returned no tokens for ${email}`)
      return false
    }

    // Get the base URL for cookies
    const baseUrl = new URL(BASE_URL)

    // Set cookies on the browser context
    await context.addCookies([
      {
        name: 'access_token',
        value: access_token,
        domain: baseUrl.hostname,
        path: '/',
        httpOnly: true,
        secure: false, // false for localhost
        sameSite: 'Lax',
      },
      {
        name: 'refresh_token',
        value: refresh_token,
        domain: baseUrl.hostname,
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ])

    // Navigate to the app to apply the auth state
    if (!page.isClosed()) {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })

      // Wait for load state with fallback
      try {
        await page.waitForLoadState('load', { timeout: 15000 })
      } catch {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      }

      // Wait for auth/me to complete (this loads the user data)
      await page
        .waitForResponse(resp => resp.url().includes('/auth/me'), { timeout: 10000 })
        .catch(() => {})

      // Give the UI time to render
      await safeWait(page, 500)

      // Dismiss tutorial overlay if present
      await dismissTutorialOverlay(page)

      // Verify login succeeded
      const userMenu = page.getByTestId('user-menu-button')
      const isLoggedIn = await userMenu.isVisible({ timeout: 10000 }).catch(() => false)

      if (isLoggedIn) {
        console.log(`API login successful for ${email}`)
        return true
      }
    }

    return false
  } catch (error) {
    console.log(
      `API login error for ${email}:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

/**
 * Ensure test user exists via API (create if needed)
 * This is critical for CI where the database is fresh
 */
async function ensureTestUserExists(
  email: string,
  password: string,
  isAdmin: boolean = false
): Promise<boolean> {
  try {
    // Try to create/update user via dev endpoint
    const response = await fetch(`${BACKEND_URL}/api/dev/create-test-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role: isAdmin ? 'admin' : 'user',
        is_admin: isAdmin,
        is_verified: true,
        is_active: true,
      }),
    })

    if (response.ok) {
      console.log(`Test user ${email} created/updated via API`)
      return true
    } else {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.log(`Failed to create test user ${email}: ${errorText}`)
      return false
    }
  } catch (error) {
    console.log(
      `Error creating test user ${email}:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

/**
 * Login a user with the given credentials (UI-based fallback)
 */
async function loginUser(
  page: Page,
  email: string,
  password: string,
  options: { waitForNavigation?: boolean } = {}
): Promise<boolean> {
  const { waitForNavigation = true } = options

  try {
    // Check if already logged in
    const userMenu = page.getByTestId('user-menu-button')
    const isLoggedIn = await userMenu.isVisible({ timeout: 2000 }).catch(() => false)
    if (isLoggedIn) {
      return true
    }

    // Clear rate limiting before login attempt (for E2E tests)
    // This prevents rate limiting from blocking test logins
    const backendURL = process.env.BACKEND_URL || 'http://localhost:8000'
    try {
      await fetch(`${backendURL}/api/dev/reset-rate-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: null }),
      }).catch(() => {
        // Ignore errors - endpoint might not be available in all environments
      })
    } catch {
      // Ignore errors - rate limiting clear is best-effort
    }

    // Navigate to home if not already there
    if (page.url() !== BASE_URL + '/' && !page.url().startsWith(BASE_URL)) {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })
      // Wait for load state with fallback
      try {
        await page.waitForLoadState('load', { timeout: 15000 })
      } catch {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      }
    }

    // Dismiss tutorial overlay if present (blocks interactions)
    await dismissTutorialOverlay(page)

    // Click login button
    const loginButton = page.getByTestId('nav-sign-in-button')
    if (!(await loginButton.isVisible({ timeout: 2000 }).catch(() => false))) {
      return false
    }

    // Check if tutorial overlay is blocking before clicking
    const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
    const overlayVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)
    if (overlayVisible) {
      // Dismiss again if it reappeared
      await dismissTutorialOverlay(page)
      await safeWait(page, 500)
    }

    // Try clicking with retry logic for overlay blocking
    try {
      await loginButton.click({ timeout: 10000 })
    } catch (error) {
      if (error instanceof Error && error.message.includes('intercepts pointer events')) {
        // Overlay is still blocking, dismiss it and retry
        await dismissTutorialOverlay(page)
        await safeWait(page, 500)
        await loginButton.click({ timeout: 10000, force: true })
      } else {
        throw error
      }
    }
    await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

    // Fill login form
    await page.getByTestId('login-email-input').fill(email)
    await page.getByTestId('login-password-input').fill(password)

    // Wait for login API response and auth/me response
    const loginResponsePromise = page
      .waitForResponse(
        response => response.url().includes('/auth/login') && response.status() === 200,
        { timeout: 10000 }
      )
      .catch(() => null)

    const authMeResponsePromise = page
      .waitForResponse(
        response => response.url().includes('/auth/me') && response.status() === 200,
        { timeout: 15000 }
      )
      .catch(() => null)

    await page.getByTestId('login-submit-button').click()

    // Wait for login API call to complete
    const loginResponse = await loginResponsePromise

    // Check for login error message
    if (loginResponse && loginResponse.status() !== 200) {
      const errorMessage = page.locator('.auth-error')
      const hasError = await errorMessage.isVisible({ timeout: 3000 }).catch(() => false)
      if (hasError) {
        const errorText = await errorMessage.textContent().catch(() => 'Unknown error')
        console.error(`Login failed for ${email}: ${errorText}`)
        // If login failed, try to create/update user via dev endpoint as fallback
        const backendURL = process.env.BACKEND_URL || 'http://localhost:8000'
        try {
          const createResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email,
              password: password,
              role: 'user',
              is_admin: false,
              is_verified: true,
              is_active: true,
            }),
          })
          if (createResponse.ok) {
            console.log(`User ${email} created/updated via dev endpoint, retrying login...`)
            // Retry login after creating user
            await page.getByTestId('login-submit-button').click()
            await page
              .waitForResponse(
                response => response.url().includes('/auth/login') && response.status() === 200,
                { timeout: 10000 }
              )
              .catch(() => null)
          }
        } catch (_e) {
          // Dev endpoint might not be available - continue with normal flow
        }
      }
    }

    if (waitForNavigation) {
      // Wait for load state with fallback - networkidle can be too strict
      try {
        await page.waitForLoadState('load', { timeout: 10000 })
      } catch {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      }

      // Wait for auth/me API call to complete (user data fetch after login)
      // This ensures the auth state is fully updated
      await authMeResponsePromise

      // Wait for auth modal to close
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 15000,
        })
        .catch(() => {})

      // Wait a bit for React state to update
      await safeWait(page, 500)
    }

    // Verify login succeeded - user data needs to load after login
    const loginSucceeded = await userMenu.isVisible({ timeout: 20000 }).catch(() => false)
    if (!loginSucceeded) {
      // Check for error message one more time
      const errorMessage = page.locator('.auth-error')
      const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)
      if (hasError) {
        const errorText = await errorMessage.textContent().catch(() => 'Unknown error')
        console.error(`Login verification failed for ${email}: ${errorText}`)
      }
    }
    return loginSucceeded
  } catch (error) {
    console.error(`Login failed for ${email}:`, error)
    return false
  }
}

/**
 * Register a new user with the given credentials
 */
async function registerUser(
  page: Page,
  email: string,
  password: string,
  options: { waitForNavigation?: boolean } = {}
): Promise<boolean> {
  const { waitForNavigation = true } = options

  try {
    // Navigate to home if not already there
    if (page.url() !== BASE_URL + '/' && !page.url().startsWith(BASE_URL)) {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })
      // Wait for load state with fallback
      try {
        await page.waitForLoadState('load', { timeout: 15000 })
      } catch {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      }
    }

    // Dismiss tutorial overlay if present (blocks interactions)
    await dismissTutorialOverlay(page)

    // Wait for any existing auth modal overlay to close before clicking sign-up
    // The overlay can block clicks on the sign-up button
    const existingAuthModal = page.locator(
      '.auth-modal-overlay, [data-testid="auth-modal"], .auth-modal'
    )
    const modalVisible = await existingAuthModal.isVisible({ timeout: 2000 }).catch(() => false)
    if (modalVisible && !page.isClosed()) {
      // Close any existing auth modal
      const closeButton = page.locator('.auth-modal-close, button[aria-label="Close"]')
      const closeVisible = await closeButton.isVisible({ timeout: 2000 }).catch(() => false)
      if (closeVisible) {
        await closeButton.click({ timeout: 5000 }).catch(() => {})
      } else {
        // Press Escape to close modal
        await page.keyboard.press('Escape').catch(() => {})
      }
      // Wait for modal to close
      await existingAuthModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
      await safeWait(page, 500)
    }

    // Click sign up button
    const signUpButton = page.getByTestId('nav-sign-up-button')
    if (!(await signUpButton.isVisible({ timeout: 2000 }).catch(() => false))) {
      return false
    }

    // Check if tutorial overlay is blocking before clicking
    const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
    const tutorialVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)
    if (tutorialVisible) {
      // Dismiss tutorial overlay if it reappeared
      await dismissTutorialOverlay(page)
      await safeWait(page, 500)
    }

    // Ensure the button is not blocked by overlay before clicking
    // Retry with force if overlay is still blocking
    try {
      await signUpButton.click({ timeout: 10000 })
    } catch (error) {
      if (error instanceof Error && error.message.includes('intercepts pointer events')) {
        // Overlay is still blocking, wait a bit more and use force
        await safeWait(page, 1000)
        // Check if tutorial overlay is blocking
        const tutorialStillVisible = await tutorialOverlay
          .isVisible({ timeout: 1000 })
          .catch(() => false)
        if (tutorialStillVisible) {
          // Try to dismiss tutorial overlay again
          await dismissTutorialOverlay(page)
          await safeWait(page, 500)
        }
        // Check if auth modal overlay is still visible
        const overlayStillVisible = await existingAuthModal
          .isVisible({ timeout: 1000 })
          .catch(() => false)
        if (overlayStillVisible) {
          // Try to close it again
          await page.keyboard.press('Escape').catch(() => {})
          await safeWait(page, 500)
        }
        // Use force click as last resort
        await signUpButton.click({ timeout: 10000, force: true })
      } else {
        throw error
      }
    }
    await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

    // Fill registration form
    const emailInput = page.locator('input[type="email"]').first()
    await emailInput.fill(email)

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(password)

    const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
    if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmPasswordInput.fill(password)
    }

    // Wait for registration API response and auth/me response
    const registerResponsePromise = page
      .waitForResponse(
        response =>
          response.url().includes('/auth/register') &&
          (response.status() === 201 || response.status() === 200),
        { timeout: 10000 }
      )
      .catch(() => null)

    const authMeResponsePromise = page
      .waitForResponse(
        response => response.url().includes('/auth/me') && response.status() === 200,
        { timeout: 15000 }
      )
      .catch(() => null)

    // Submit registration
    await page.getByTestId('register-submit-button').click()

    // Wait for registration API call to complete
    await registerResponsePromise

    if (waitForNavigation) {
      // Wait for load state with fallback - networkidle can be too strict
      try {
        await page.waitForLoadState('load', { timeout: 10000 })
      } catch {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      }

      // Wait for auth/me API call to complete (user data fetch after registration)
      // This ensures the auth state is fully updated
      await authMeResponsePromise

      // Wait for auth modal to close
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 15000,
        })
        .catch(() => {})

      // Wait a bit for React state to update
      await safeWait(page, 500)
    }

    // Verify registration succeeded (user menu should be visible)
    // User data needs to load after registration
    const userMenu = page.getByTestId('user-menu-button')
    const registrationSucceeded = await userMenu.isVisible({ timeout: 20000 }).catch(() => false)
    return registrationSucceeded
  } catch (error) {
    console.error(`Registration failed for ${email}:`, error)
    return false
  }
}

/**
 * Ensure user is logged in (login or register if needed)
 *
 * Strategy for CI reliability:
 * 1. First, ensure the test user exists via API (critical for fresh CI databases)
 * 2. Try fast API-based login (sets cookies directly)
 * 3. Fall back to UI-based login only if API login fails
 * 4. As last resort, try UI-based registration
 */
async function ensureAuthenticated(
  page: Page,
  email: string,
  password: string,
  context?: BrowserContext,
  isAdmin: boolean = false
): Promise<void> {
  // Check if page is still valid before starting
  if (page.isClosed()) {
    throw new Error('Page was closed before authentication')
  }

  const userMenu = page.getByTestId('user-menu-button')
  const isLoggedIn = await userMenu.isVisible({ timeout: 2000 }).catch(() => false)

  if (!isLoggedIn) {
    // Check if page is still valid before login
    if (page.isClosed()) {
      throw new Error('Page was closed before login attempt')
    }

    // In CI, first ensure the test user exists via API
    // This is critical because CI databases are fresh
    if (process.env.CI) {
      await ensureTestUserExists(email, password, isAdmin)
    }

    let loginSuccess = false

    // Strategy 1: Try fast API-based login (preferred for CI)
    if (context) {
      loginSuccess = await apiLogin(context, page, email, password)

      if (page.isClosed()) {
        throw new Error('Page was closed during API login')
      }
    }

    // Strategy 2: Fall back to UI-based login
    if (!loginSuccess && !page.isClosed()) {
      loginSuccess = await loginUser(page, email, password)

      if (page.isClosed()) {
        throw new Error('Page was closed during login')
      }
    }

    // Strategy 3: If login fails, try registration (user might not exist)
    if (!loginSuccess && !page.isClosed()) {
      await registerUser(page, email, password)

      if (page.isClosed()) {
        throw new Error('Page was closed during registration')
      }
    }

    // Dismiss tutorial overlay after authentication (it may reappear)
    if (!page.isClosed()) {
      await dismissTutorialOverlay(page)
    }
  }

  // Verify we're authenticated - user data needs to load after login/registration
  // Check if page is still valid before asserting
  if (page.isClosed()) {
    throw new Error('Page was closed after authentication')
  }

  // Wait for auth state to update after login/registration
  // This ensures the auth context has processed the login response
  await waitForAuthState(page, 30000)

  // Wait for user menu with retry logic and better error handling
  // Use longer timeout in CI environment
  const authTimeout = process.env.CI ? 30000 : 20000

  // Check page validity before waiting
  if (page.isClosed()) {
    throw new Error('Page was closed before verifying authentication')
  }

  try {
    // Use retry logic for user menu detection with timeout guard
    await Promise.race([
      retryElementDetection(
        page,
        async () => {
          if (page.isClosed()) {
            throw new Error('Page was closed during user menu detection')
          }
          await expect(userMenu).toBeVisible({ timeout: authTimeout })
        },
        {
          maxRetries: 3,
          retryDelay: 1000,
          timeout: authTimeout,
        }
      ),
      // Timeout guard - don't wait forever
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Authentication verification timeout')),
          authTimeout + 5000
        )
      ),
    ])
  } catch (error) {
    // Check if page was closed during the wait
    if (page.isClosed()) {
      throw new Error('Page was closed while verifying authentication')
    }

    // Check if there's an error message visible
    const errorMessage = page.locator('.auth-error')
    const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)
    if (hasError) {
      const errorText = await errorMessage.textContent().catch(() => 'Unknown error')
      throw new Error(`Authentication verification failed: ${errorText}`)
    }

    // If timeout error, check if user menu exists (might have appeared after timeout)
    if (error instanceof Error && error.message.includes('timeout')) {
      const menuExists = await userMenu.isVisible({ timeout: 2000 }).catch(() => false)
      if (menuExists) {
        // Menu exists, authentication succeeded despite timeout
        return
      }
    }

    // Re-throw the original error if it's not a page closure issue
    throw error
  }

  // Final check - dismiss tutorial overlay one more time after verification
  // Tutorial might appear after user menu becomes visible
  if (!page.isClosed()) {
    await dismissTutorialOverlay(page)
  }
}

/**
 * Clear all authentication state
 */
async function clearAuthState(context: BrowserContext): Promise<void> {
  await context.clearCookies()
  await context.clearPermissions()
  // Clear localStorage and sessionStorage
  const pages = context.pages()
  for (const page of pages) {
    try {
      await page.evaluate(() => {
        try {
          localStorage.clear()
          sessionStorage.clear()
        } catch (e) {
          // Ignore SecurityError - may happen on some pages (e.g., about:blank)
          if (e instanceof Error && e.name !== 'SecurityError') {
            throw e
          }
        }
      })
    } catch (e) {
      // Ignore errors when clearing storage - page might be closed or inaccessible
      if (
        e instanceof Error &&
        !e.message.includes('Target page, context or browser has been closed')
      ) {
        console.warn('Warning: Could not clear storage:', e.message)
      }
    }
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

// Types for reference (not currently used but may be needed in future)
// type SubscriptionTier = 'free' | 'starter' | 'starter_plus' | 'pro' | 'pro_plus'
// type UserRole = 'user' | 'moderator' | 'admin' | 'super_admin'

interface TestFixtures {
  // Authentication Fixtures - User Tiers
  freeTierPage: Page
  starterTierPage: Page
  starterPlusTierPage: Page
  proTierPage: Page
  proPlusTierPage: Page

  // Authentication Fixtures - User Roles
  adminPage: Page
  moderatorPage: Page
  authenticatedPage: Page // Generic authenticated user (free tier)

  // Unregistered/Unauthenticated
  unregisteredPage: Page

  // Page Navigation Fixtures
  comparisonPage: Page
  adminPanelPage: Page
  aboutPage: Page
  featuresPage: Page
  faqPage: Page
  privacyPage: Page
  termsPage: Page

  // Test Data Helpers
  testData: {
    generateEmail: (prefix?: string) => string
    generatePassword: () => string
    generateComparisonInput: () => string
  }

  // API Helpers
  apiHelpers: {
    waitForApiCall: (urlPattern: string | RegExp, timeout?: number) => Promise<void>
    mockApiResponse: (urlPattern: string | RegExp, response: unknown) => Promise<void>
  }
}

// ============================================================================
// Fixture Definitions
// ============================================================================

export const test = base.extend<TestFixtures>({
  // ==========================================================================
  // Global setup - inject test environment flag
  // ==========================================================================

  page: async ({ page, context }, use) => {
    // Inject script to mark this as a test environment (disables reCAPTCHA)
    // Use context.addInitScript so it runs for all pages in this context
    await context.addInitScript(() => {
      window.__TEST_ENV__ = true
      window.__PLAYWRIGHT__ = true
      window.__PW_INTERNAL__ = true
    })
    await use(page)
  },

  // ==========================================================================
  // Authentication Fixtures - Subscription Tiers
  // ==========================================================================

  /**
   * Free tier user page (already authenticated)
   */
  freeTierPage: async ({ page, context }, use) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait for load state with fallback
    try {
      await page.waitForLoadState('load', { timeout: 15000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }

    // Wait for React hydration
    await waitForReactHydration(page)

    // Wait for auth state to be determined before authentication
    await waitForAuthState(page)

    await dismissTutorialOverlay(page)
    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.free.email,
      TEST_CREDENTIALS.free.password,
      context
    )
    await use(page)
  },

  /**
   * Starter tier user page (already authenticated)
   * Note: User must be upgraded to starter tier in backend/admin
   */
  starterTierPage: async ({ page, context }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }

    // Wait for React hydration
    await waitForReactHydration(page)

    // Wait for auth state to be determined before authentication
    await waitForAuthState(page)

    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.starter.email,
      TEST_CREDENTIALS.starter.password,
      context
    )
    await use(page)
  },

  /**
   * Starter Plus tier user page (already authenticated)
   * Note: User must be upgraded to starter_plus tier in backend/admin
   */
  starterPlusTierPage: async ({ page, context }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }

    // Wait for React hydration
    await waitForReactHydration(page)

    // Wait for auth state to be determined before authentication
    await waitForAuthState(page)

    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.starterPlus.email,
      TEST_CREDENTIALS.starterPlus.password,
      context
    )
    await use(page)
  },

  /**
   * Pro tier user page (already authenticated)
   * Note: User must be upgraded to pro tier in backend/admin
   */
  proTierPage: async ({ page, context }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }

    // Wait for React hydration
    await waitForReactHydration(page)

    // Wait for auth state to be determined before authentication
    await waitForAuthState(page)

    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.pro.email,
      TEST_CREDENTIALS.pro.password,
      context
    )
    await use(page)
  },

  /**
   * Pro Plus tier user page (already authenticated)
   * Note: User must be upgraded to pro_plus tier in backend/admin
   */
  proPlusTierPage: async ({ page, context }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }

    // Wait for React hydration
    await waitForReactHydration(page)

    // Wait for auth state to be determined before authentication
    await waitForAuthState(page)

    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.proPlus.email,
      TEST_CREDENTIALS.proPlus.password,
      context
    )
    await use(page)
  },

  // ==========================================================================
  // Authentication Fixtures - User Roles
  // ==========================================================================

  /**
   * Admin user page (already authenticated and on admin panel)
   */
  adminPage: async ({ page, context }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }

    // Wait for React hydration
    await waitForReactHydration(page)

    // Wait for auth state to be determined before authentication
    await waitForAuthState(page)

    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.admin.email,
      TEST_CREDENTIALS.admin.password,
      context,
      true
    )

    // Navigate to admin panel
    // Wait for admin button to appear (user data needs to load first)
    const adminButton = page.getByRole('button', { name: /admin|dashboard/i })
    if (await adminButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await adminButton.click()
    } else {
      await page.goto('/admin')
    }
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }

    // Wait a bit for lazy loading of AdminPanel component
    await page.waitForTimeout(500)

    // Verify admin panel is visible - use longer timeout in CI
    const adminPanel = page.locator('[data-testid="admin-panel"], .admin-panel')
    const adminTimeout = process.env.CI ? 20000 : 15000
    await expect(adminPanel).toBeVisible({ timeout: adminTimeout })

    await use(page)
  },

  /**
   * Moderator user page (already authenticated)
   * Note: User must have moderator role set in backend/admin
   */
  moderatorPage: async ({ page, context }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.moderator.email,
      TEST_CREDENTIALS.moderator.password,
      context
    )
    await use(page)
  },

  /**
   * Generic authenticated user page (free tier, default)
   * Use this when tier doesn't matter
   */
  authenticatedPage: async ({ page, context }, use) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait for load state with fallback
    try {
      await page.waitForLoadState('load', { timeout: 15000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await dismissTutorialOverlay(page)
    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.free.email,
      TEST_CREDENTIALS.free.password,
      context
    )
    await use(page)
  },

  // ==========================================================================
  // Unregistered/Unauthenticated Fixtures
  // ==========================================================================

  /**
   * Unregistered (unauthenticated) user page
   * All cookies and storage cleared
   */
  unregisteredPage: async ({ page, context }, use) => {
    await clearAuthState(context)
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait for load state with fallback
    try {
      await page.waitForLoadState('load', { timeout: 15000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await dismissTutorialOverlay(page)

    // Verify we're unregistered (no user menu)
    const userMenu = page.getByTestId('user-menu-button')
    await expect(userMenu).not.toBeVisible({ timeout: 2000 })

    await use(page)
  },

  // ==========================================================================
  // Page Navigation Fixtures
  // ==========================================================================

  /**
   * Comparison page (home page with comparison form ready)
   */
  comparisonPage: async ({ page }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }

    // Wait for comparison form to be visible
    const comparisonInput = page.getByTestId('comparison-input-textarea')
    await expect(comparisonInput).toBeVisible({ timeout: 10000 })

    await use(page)
  },

  /**
   * Admin panel page (authenticated as admin)
   */
  adminPanelPage: async ({ adminPage }, use) => {
    // adminPage fixture already navigates to /admin
    await use(adminPage)
  },

  /**
   * About page
   */
  aboutPage: async ({ page }, use) => {
    await page.goto('/about')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await use(page)
  },

  /**
   * Features page
   */
  featuresPage: async ({ page }, use) => {
    await page.goto('/features')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await use(page)
  },

  /**
   * FAQ page
   */
  faqPage: async ({ page }, use) => {
    await page.goto('/faq')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await use(page)
  },

  /**
   * Privacy Policy page
   */
  privacyPage: async ({ page }, use) => {
    await page.goto('/privacy-policy')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await use(page)
  },

  /**
   * Terms of Service page
   */
  termsPage: async ({ page }, use) => {
    await page.goto('/terms-of-service')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await use(page)
  },

  // ==========================================================================
  // Test Data Helpers
  // ==========================================================================

  /**
   * Test data generation helpers
   */
  // eslint-disable-next-line no-empty-pattern
  testData: async ({}, use) => {
    const generateEmail = (prefix: string = 'test'): string => {
      const timestamp = Date.now()
      const random = Math.floor(Math.random() * 10000)
      return `${prefix}-${timestamp}-${random}@example.com`
    }

    const generatePassword = (): string => {
      return 'TestPassword123!'
    }

    const generateComparisonInput = (): string => {
      const inputs = [
        'Explain quantum computing in simple terms.',
        'What are the benefits of renewable energy?',
        'Compare the pros and cons of remote work.',
        'How does machine learning work?',
        'What is the difference between AI and machine learning?',
      ]
      return inputs[Math.floor(Math.random() * inputs.length)]
    }

    await use({
      generateEmail,
      generatePassword,
      generateComparisonInput,
    })
  },

  // ==========================================================================
  // API Helpers
  // ==========================================================================

  /**
   * API helper utilities
   */
  apiHelpers: async ({ page }, use) => {
    const waitForApiCall = async (
      urlPattern: string | RegExp,
      timeout: number = 30000
    ): Promise<void> => {
      await page.waitForResponse(
        response => {
          const url = response.url()
          if (typeof urlPattern === 'string') {
            return url.includes(urlPattern)
          }
          return urlPattern.test(url)
        },
        { timeout }
      )
    }

    const mockApiResponse = async (
      urlPattern: string | RegExp,
      response: unknown
    ): Promise<void> => {
      await page.route(urlPattern, async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response),
        })
      })
    }

    await use({
      waitForApiCall,
      mockApiResponse,
    })
  },
})

// Re-export expect for convenience
export { expect } from '@playwright/test'

// Export helper functions for use in test files
export {
  waitForAuthState,
  waitForReactHydration,
  retryElementDetection,
  safeWait,
  dismissTutorialOverlay,
}
