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
 * Helper function to dismiss the tutorial overlay if it appears
 * Tutorial is disabled on mobile layouts (viewport width <= 768px), so we skip dismissal on mobile
 */
async function dismissTutorialOverlay(page: Page) {
  try {
    if (page.isClosed()) {
      return
    }

    // Check if we're on a mobile viewport (tutorial is disabled on mobile - width <= 768px)
    // Only dismiss tutorial overlay on desktop viewports
    const viewport = page.viewportSize()
    const isMobileViewport = viewport && viewport.width <= 768

    if (isMobileViewport) {
      // Tutorial is not available on mobile, so skip dismissal
      return
    }

    await safeWait(page, 500)

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

    const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
    const overlayVisible = await tutorialOverlay.isVisible({ timeout: 2000 }).catch(() => false)

    if (overlayVisible && !page.isClosed()) {
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
    email: process.env.ADMIN_EMAIL || 'jaydeelew@gmail.com',
    password: process.env.ADMIN_PASSWORD || 'sf*88323?ddpdRRl',
  },
  moderator: {
    email: process.env.MODERATOR_EMAIL || 'moderator@test.com',
    password: process.env.MODERATOR_PASSWORD || 'Test12345678/',
  },
}

// Base URL for the application
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Login a user with the given credentials
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

    await loginButton.click()
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
    await loginResponsePromise

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

    // Click sign up button
    const signUpButton = page.getByTestId('nav-sign-up-button')
    if (!(await signUpButton.isVisible({ timeout: 2000 }).catch(() => false))) {
      return false
    }

    await signUpButton.click()
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
 */
async function ensureAuthenticated(page: Page, email: string, password: string): Promise<void> {
  const userMenu = page.getByTestId('user-menu-button')
  const isLoggedIn = await userMenu.isVisible({ timeout: 2000 }).catch(() => false)

  if (!isLoggedIn) {
    // Try login first
    const loginSuccess = await loginUser(page, email, password)
    if (!loginSuccess) {
      // If login fails, try registration
      await registerUser(page, email, password)
    }
  }

  // Verify we're authenticated - user data needs to load after login/registration
  // Check if page is still valid before asserting
  if (page.isClosed()) {
    throw new Error('Page was closed during authentication')
  }
  await expect(userMenu)
    .toBeVisible({ timeout: 20000 })
    .catch(error => {
      if (page.isClosed() || (error instanceof Error && error.message.includes('closed'))) {
        throw new Error('Page was closed while verifying authentication')
      }
      throw error
    })
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
  freeTierPage: async ({ page }, use) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait for load state with fallback
    try {
      await page.waitForLoadState('load', { timeout: 15000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await dismissTutorialOverlay(page)
    await ensureAuthenticated(page, TEST_CREDENTIALS.free.email, TEST_CREDENTIALS.free.password)
    await use(page)
  },

  /**
   * Starter tier user page (already authenticated)
   * Note: User must be upgraded to starter tier in backend/admin
   */
  starterTierPage: async ({ page }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.starter.email,
      TEST_CREDENTIALS.starter.password
    )
    await use(page)
  },

  /**
   * Starter Plus tier user page (already authenticated)
   * Note: User must be upgraded to starter_plus tier in backend/admin
   */
  starterPlusTierPage: async ({ page }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.starterPlus.email,
      TEST_CREDENTIALS.starterPlus.password
    )
    await use(page)
  },

  /**
   * Pro tier user page (already authenticated)
   * Note: User must be upgraded to pro tier in backend/admin
   */
  proTierPage: async ({ page }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await ensureAuthenticated(page, TEST_CREDENTIALS.pro.email, TEST_CREDENTIALS.pro.password)
    await use(page)
  },

  /**
   * Pro Plus tier user page (already authenticated)
   * Note: User must be upgraded to pro_plus tier in backend/admin
   */
  proPlusTierPage: async ({ page }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await ensureAuthenticated(
      page,
      TEST_CREDENTIALS.proPlus.email,
      TEST_CREDENTIALS.proPlus.password
    )
    await use(page)
  },

  // ==========================================================================
  // Authentication Fixtures - User Roles
  // ==========================================================================

  /**
   * Admin user page (already authenticated and on admin panel)
   */
  adminPage: async ({ page }, use) => {
    await page.goto('/')
    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: 10000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await ensureAuthenticated(page, TEST_CREDENTIALS.admin.email, TEST_CREDENTIALS.admin.password)

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

    // Verify admin panel is visible
    const adminPanel = page.locator('[data-testid="admin-panel"], .admin-panel')
    await expect(adminPanel).toBeVisible({ timeout: 15000 })

    await use(page)
  },

  /**
   * Moderator user page (already authenticated)
   * Note: User must have moderator role set in backend/admin
   */
  moderatorPage: async ({ page }, use) => {
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
      TEST_CREDENTIALS.moderator.password
    )
    await use(page)
  },

  /**
   * Generic authenticated user page (free tier, default)
   * Use this when tier doesn't matter
   */
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait for load state with fallback
    try {
      await page.waitForLoadState('load', { timeout: 15000 })
    } catch {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
    }
    await dismissTutorialOverlay(page)
    await ensureAuthenticated(page, TEST_CREDENTIALS.free.email, TEST_CREDENTIALS.free.password)
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
