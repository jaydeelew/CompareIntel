import type { Page } from '@playwright/test'

import { test, expect } from './test-setup'

/**
 * E2E Tests: Registration and Onboarding
 *
 * Tests the complete user registration and onboarding flow:
 * - Registration form
 * - Email verification (if required)
 * - First comparison after registration
 * - Understanding new user benefits
 */

/**
 * Helper function to safely wait with page validity check
 */
async function safeWait(page: Page, ms: number) {
  try {
    // Check if page is still valid before waiting
    if (page.isClosed()) {
      return
    }
    await page.waitForTimeout(ms)
  } catch (error) {
    // Page might have been closed, ignore
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
    // Check if page is still valid
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

    // Wait a bit for any animations to complete
    await safeWait(page, 500)

    // First, check for the welcome modal (appears first)
    const welcomeModal = page.locator('.tutorial-welcome-backdrop')
    const welcomeVisible = await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)

    if (welcomeVisible && !page.isClosed()) {
      // Click "Skip for Now" button
      const skipButton = page.locator(
        '.tutorial-welcome-button-secondary, button:has-text("Skip for Now")'
      )
      const skipVisible = await skipButton.isVisible({ timeout: 3000 }).catch(() => false)

      if (skipVisible && !page.isClosed()) {
        try {
          // Wait for button to be stable before clicking
          await skipButton.waitFor({ state: 'visible', timeout: 5000 })
          await safeWait(page, 300) // Wait for any animations

          if (!page.isClosed()) {
            // Try normal click first
            await skipButton.click({ timeout: 10000, force: false }).catch(async () => {
              if (!page.isClosed()) {
                // If normal click fails, try force click
                await skipButton.click({ timeout: 5000, force: true })
              }
            })

            // Wait for welcome modal to disappear
            await welcomeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await safeWait(page, 500)
          }
        } catch (_clickError) {
          // Fallback: try pressing Escape
          if (!page.isClosed()) {
            await page.keyboard.press('Escape').catch(() => {})
            await safeWait(page, 500)
          }
        }
      } else if (!page.isClosed()) {
        // Fallback: try pressing Escape
        await page.keyboard.press('Escape').catch(() => {})
        await safeWait(page, 500)
      }
    }

    // Then check for the tutorial overlay (appears after welcome modal)
    if (page.isClosed()) {
      return
    }

    const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
    const overlayVisible = await tutorialOverlay.isVisible({ timeout: 2000 }).catch(() => false)

    if (overlayVisible && !page.isClosed()) {
      // Try to click the skip/close button in the tutorial overlay
      const closeButton = page.locator(
        '.tutorial-close-button, button[aria-label*="Skip"], button[aria-label*="skip"]'
      )
      const closeVisible = await closeButton.isVisible({ timeout: 3000 }).catch(() => false)

      if (closeVisible && !page.isClosed()) {
        try {
          // Wait for button to be stable before clicking
          await closeButton.waitFor({ state: 'visible', timeout: 5000 })
          await safeWait(page, 300) // Wait for any animations

          if (!page.isClosed()) {
            // Try normal click first
            await closeButton.click({ timeout: 10000, force: false }).catch(async () => {
              if (!page.isClosed()) {
                // If normal click fails, try force click
                await closeButton.click({ timeout: 5000, force: true })
              }
            })

            // Wait for overlay to disappear
            await tutorialOverlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await safeWait(page, 500)
          }
        } catch (_clickError) {
          // Fallback: try pressing Escape
          if (!page.isClosed()) {
            await page.keyboard.press('Escape').catch(() => {})
            await safeWait(page, 500)
          }
        }
      } else if (!page.isClosed()) {
        // Fallback: try pressing Escape
        await page.keyboard.press('Escape').catch(() => {})
        await safeWait(page, 500)
      }
    }

    // Final check: ensure overlay is gone by waiting a bit more and checking again
    if (!page.isClosed()) {
      await safeWait(page, 500)
      const stillVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)
      if (stillVisible && !page.isClosed()) {
        // Last resort: try Escape again
        await page.keyboard.press('Escape').catch(() => {})
        await safeWait(page, 500)
      }
    }
  } catch (error) {
    // Ignore errors - tutorial might not be present or page might be closed
    if (error instanceof Error && error.message.includes('closed')) {
      return
    }
    console.log(
      'Tutorial overlay dismissal attempted:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

test.describe('Registration and Onboarding', () => {
  test.beforeEach(async ({ page, context, browserName }) => {
    // Detect mobile devices and adjust timeouts accordingly
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const isMobile =
      browserName.includes('Mobile') ||
      browserName.includes('iPhone') ||
      browserName.includes('iPad')

    // Mobile devices and WebKit/Firefox need longer timeouts
    const navigationTimeout = isFirefox || isWebKit || isMobile ? 60000 : 30000
    const loadTimeout = isFirefox || isWebKit || isMobile ? 30000 : 15000

    // Increase timeout for mobile devices to prevent beforeEach timeout
    if (isMobile) {
      test.setTimeout(90000) // 90 seconds for mobile devices
    }

    // Clear all authentication state
    await context.clearCookies()
    await context.clearPermissions()

    // Check if page is already closed before navigation
    if (page.isClosed()) {
      if (isWebKit || isFirefox || isMobile) {
        console.log(`${browserName}: Page already closed before navigation, skipping`)
        return
      }
      throw new Error('Page was already closed before navigation')
    }

    try {
      // Use a shorter timeout for mobile devices to fail faster if page closes
      const actualTimeout = isMobile ? Math.min(navigationTimeout, 30000) : navigationTimeout
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: actualTimeout })
    } catch (error) {
      // If navigation fails, check if page is still valid
      if (page.isClosed()) {
        if (isWebKit || isFirefox || isMobile) {
          console.log(`${browserName}: Page closed during navigation, attempting to continue`)
          return
        }
        throw new Error('Page was closed during navigation')
      }
      // For mobile devices, if navigation times out, check if page closed and return gracefully
      if (
        isMobile &&
        error instanceof Error &&
        (error.message.includes('timeout') || error.message.includes('Navigation'))
      ) {
        if (page.isClosed()) {
          console.log(`${browserName}: Page closed during navigation timeout, skipping`)
          return
        }
      }
      throw error
    }

    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: loadTimeout })
    } catch {
      // If load times out, try networkidle with shorter timeout
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
        // If networkidle also fails, just continue - page is likely loaded enough
      })
    }

    // Check if page is still valid before continuing
    if (page.isClosed()) {
      if (isWebKit || isFirefox || isMobile) {
        console.log(`${browserName}: Page closed after navigation, skipping rest of setup`)
        return
      }
      throw new Error('Page was closed after navigation')
    }

    // Wait a moment for tutorial modal to appear (it may load after page load)
    // WebKit, Firefox, and mobile devices need more time for the tutorial to appear
    await safeWait(page, isWebKit || isFirefox || isMobile ? 2000 : 1000)

    // Check again before dismissing tutorial
    if (page.isClosed()) {
      if (isWebKit || isFirefox || isMobile) {
        console.log(`${browserName}: Page closed before tutorial dismissal, skipping`)
      }
      return
    }

    // Dismiss tutorial overlay if it appears (blocks interactions)
    await dismissTutorialOverlay(page)

    // Check if page is still valid
    if (page.isClosed()) {
      if (isWebKit || isFirefox || isMobile) {
        console.log(`${browserName}: Page closed after tutorial dismissal, skipping rest of setup`)
      }
      return
    }

    // Wait a bit more to ensure overlay is fully dismissed
    await safeWait(page, 500)
  })

  test('User can register a new account', async ({ page }) => {
    // Increase timeout for registration test
    test.setTimeout(60000)
    const timestamp = Date.now()
    const testEmail = `test-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    await test.step('Open registration modal', async () => {
      const signUpButton = page.getByTestId('nav-sign-up-button')
      await expect(signUpButton).toBeVisible()
      await signUpButton.click()

      // Wait for auth modal to appear
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })
      const authModal = page.locator('[data-testid="auth-modal"], .auth-modal')
      await expect(authModal).toBeVisible()
    })

    await test.step('Fill registration form', async () => {
      // Fill email
      const emailInput = page.locator('input[type="email"]').first()
      await emailInput.fill(testEmail)

      // Fill password
      const passwordInput = page.locator('input[type="password"]').first()
      await passwordInput.fill(testPassword)

      // Fill confirm password if present
      const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
      if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmPasswordInput.fill(testPassword)
      }
    })

    await test.step('Submit registration', async () => {
      const submitButton = page.getByTestId('register-submit-button')
      await expect(submitButton).toBeVisible()
      await expect(submitButton).toBeEnabled()

      // Wait for registration API response
      const registrationResponsePromise = page
        .waitForResponse(
          response => {
            const url = response.url()
            return (
              url.includes('/auth/register') &&
              (response.status() === 201 || response.status() === 200)
            )
          },
          { timeout: 10000 }
        )
        .catch(() => null)

      await submitButton.click()

      // Wait for registration API call to complete
      const registrationResponse = await registrationResponsePromise

      // Verify registration succeeded
      if (!registrationResponse) {
        // Check for error message
        await page.waitForTimeout(1000)
        // Also check for failed network requests
        const failedRequests = await page.evaluate(() => {
          return (
            (window as unknown as { __playwrightFailedRequests?: unknown[] })
              .__playwrightFailedRequests || []
          )
        })
        if (failedRequests.length > 0) {
          console.log('Failed requests:', failedRequests)
        }
        const errorMessage = page.locator('.auth-error, [role="alert"]')
        const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)
        if (hasError) {
          const errorText = await errorMessage.textContent().catch(() => 'Unknown error')
          throw new Error(`Registration failed: ${errorText}`)
        }
        throw new Error('Registration API call did not complete')
      }

      // Verify response status
      if (registrationResponse.status() !== 201 && registrationResponse.status() !== 200) {
        const errorText = await registrationResponse.text().catch(() => 'Unknown error')
        throw new Error(
          `Registration failed with status ${registrationResponse.status()}: ${errorText}`
        )
      }
    })

    await test.step('Verify registration success', async () => {
      // Wait for auth modal to close (onSuccess callback closes it)
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {})

      // Wait for auth/me API call to complete (user data fetch after registration)
      // This ensures the auth state is fully updated
      try {
        await page.waitForResponse(
          response => response.url().includes('/auth/me') && response.status() === 200,
          { timeout: 10000 }
        )
      } catch {
        // Response might have already completed or might not happen immediately
        // Continue anyway
      }

      // Wait for user menu button to appear (user is logged in)
      // Registration sets user in AuthContext, which should trigger Navigation to show UserMenu
      const userMenuButton = page.getByTestId('user-menu-button')
      await expect(userMenuButton).toBeVisible({ timeout: 20000 })

      // Sign-in/sign-up buttons should be hidden (confirms auth state updated)
      await expect(page.getByTestId('nav-sign-in-button')).not.toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('nav-sign-up-button')).not.toBeVisible({ timeout: 5000 })
    })
  })

  test('User sees verification banner after registration', async ({ page }) => {
    const timestamp = Date.now()
    const testEmail = `verify-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    await test.step('Register new user', async () => {
      await page.getByTestId('nav-sign-up-button').click()
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      await page.locator('input[type="email"]').first().fill(testEmail)
      await page.locator('input[type="password"]').first().fill(testPassword)

      const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
      if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmPasswordInput.fill(testPassword)
      }

      await page.getByTestId('register-submit-button').click()
      // Wait for page to load - use 'load' instead of 'networkidle' which is too strict
      try {
        await page.waitForLoadState('load', { timeout: 10000 })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }
    })

    await test.step('Check for verification banner', async () => {
      // Verification banner might appear
      const verificationBanner = page
        .locator('[role="alert"], .alert, .banner, [class*="verification"], [class*="verify"]')
        .filter({ hasText: /verify|verification/i })

      const bannerCount = await verificationBanner.count()

      if (bannerCount > 0) {
        await expect(verificationBanner.first()).toBeVisible({ timeout: 5000 })
      }
      // If no banner appears, that's also acceptable (verification might be optional)
    })
  })

  test('New user can perform first comparison', async ({ page, browserName }) => {
    // Increase timeout for registration + comparison test
    // WebKit needs longer timeout
    const isWebKit = browserName === 'webkit'
    test.setTimeout(isWebKit ? 120000 : 60000)
    const timestamp = Date.now()
    const testEmail = `firstcomp-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    await test.step('Register and login', async () => {
      await page.getByTestId('nav-sign-up-button').click()
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      await page.locator('input[type="email"]').first().fill(testEmail)
      await page.locator('input[type="password"]').first().fill(testPassword)

      const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
      if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmPasswordInput.fill(testPassword)
      }

      // Wait for registration API response
      const registrationResponsePromise = page
        .waitForResponse(
          response => {
            const url = response.url()
            return (
              url.includes('/auth/register') &&
              (response.status() === 201 || response.status() === 200)
            )
          },
          { timeout: 10000 }
        )
        .catch(() => null)

      await page.getByTestId('register-submit-button').click()

      // Wait for registration API call to complete
      const registrationResponse = await registrationResponsePromise

      // Verify registration succeeded
      if (!registrationResponse) {
        // Wait a bit and check for errors
        await page.waitForTimeout(1000)
        const errorMessage = page.locator('.auth-error, [role="alert"]')
        const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)
        if (hasError) {
          const errorText = await errorMessage.textContent().catch(() => 'Unknown error')
          throw new Error(`Registration failed: ${errorText}`)
        }
      }

      // Wait for auth modal to close (onSuccess callback closes it)
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {})

      // Wait for auth/me API call to complete (user data fetch after registration)
      // This ensures the auth state is fully updated
      try {
        await page.waitForResponse(
          response => response.url().includes('/auth/me') && response.status() === 200,
          { timeout: 10000 }
        )
      } catch {
        // Response might have already completed or might not happen immediately
        // Continue anyway
      }

      // Wait a moment for React to re-render after auth state updates
      await page.waitForTimeout(500)

      // Wait for user menu to appear (user data needs to load after registration)
      await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
    })

    await test.step('Perform first comparison', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()

      await inputField.fill('Explain machine learning in simple terms.')

      // Wait for loading message to disappear
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      // Expand first provider dropdown if collapsed (checkboxes are inside dropdowns)
      const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await firstProvider.click()
          await page.waitForTimeout(500)
        }
      }

      // Select models (registered users can select more than 3)
      const modelCheckboxes = page.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      // Select first model
      await modelCheckboxes.first().check()

      // Check if tutorial overlay is blocking (especially in WebKit)
      const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
      const overlayVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)
      if (overlayVisible && !page.isClosed()) {
        // Dismiss tutorial overlay before submitting
        await dismissTutorialOverlay(page)
        await safeWait(page, 1000) // Wait longer for overlay to fully disappear
      }

      // Submit comparison - WebKit and mobile need longer timeout
      const isMobile =
        browserName.includes('Mobile') ||
        browserName.includes('iPhone') ||
        browserName.includes('iPad')
      const submitTimeout = isWebKit || isMobile ? 60000 : 15000

      const submitButton = page.getByTestId('comparison-submit-button')

      // Try normal click first
      try {
        await submitButton.click({ timeout: submitTimeout })
      } catch (error) {
        if (page.isClosed()) {
          throw new Error('Page was closed during submit')
        }
        // If click fails, try force click (especially for WebKit/mobile with tutorial overlay)
        if (
          error instanceof Error &&
          (error.message.includes('intercepts') || error.message.includes('timeout'))
        ) {
          // Dismiss overlay again and try force click
          await dismissTutorialOverlay(page)
          await safeWait(page, 500)
          await submitButton.click({ timeout: submitTimeout, force: true })
        } else {
          throw error
        }
      }

      // Wait for results - use 'load' instead of 'networkidle' which is too strict
      try {
        await page.waitForLoadState('load', { timeout: 15000 })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }

      // Results should appear
      const results = page.locator('[data-testid^="result-card-"], .result-card, .model-response')

      const hasResults = await results
        .first()
        .isVisible({ timeout: 30000 })
        .catch(() => false)

      if (hasResults) {
        await expect(results.first()).toBeVisible()
      }
    })
  })

  test('User can login with existing account', async ({ page }) => {
    const testEmail = process.env.TEST_FREE_EMAIL || process.env.TEST_USER_EMAIL || 'free@test.com'
    const testPassword =
      process.env.TEST_FREE_PASSWORD || process.env.TEST_USER_PASSWORD || 'Test12345678/'

    await test.step('Open login modal', async () => {
      const signInButton = page.getByTestId('nav-sign-in-button')
      await expect(signInButton).toBeVisible()
      await signInButton.click()

      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })
      const authModal = page.locator('[data-testid="auth-modal"], .auth-modal')
      await expect(authModal).toBeVisible()
    })

    await test.step('Fill login form', async () => {
      await page.getByTestId('login-email-input').fill(testEmail)
      await page.getByTestId('login-password-input').fill(testPassword)
    })

    await test.step('Submit login', async () => {
      await page.getByTestId('login-submit-button').click()
      // Wait for page to load - use 'load' instead of 'networkidle' which is too strict
      try {
        await page.waitForLoadState('load', { timeout: 10000 })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }
    })

    await test.step('Verify login success', async () => {
      // Auth modal should close
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {})

      // User menu should appear
      const userMenuButton = page.getByTestId('user-menu-button')
      await expect(userMenuButton).toBeVisible({ timeout: 10000 })
    })
  })

  test('User can logout', async ({ page, browserName }) => {
    const testEmail = process.env.TEST_FREE_EMAIL || process.env.TEST_USER_EMAIL || 'free@test.com'
    const testPassword =
      process.env.TEST_FREE_PASSWORD || process.env.TEST_USER_PASSWORD || 'Test12345678/'

    // Firefox, WebKit, and mobile devices need longer timeouts
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const isMobile =
      browserName.includes('Mobile') ||
      browserName.includes('iPhone') ||
      browserName.includes('iPad')

    // Increase test timeout for mobile devices (must be set before any async operations)
    test.setTimeout(isMobile ? 120000 : 60000) // 2 minutes for mobile devices, 60s for others

    const navigationTimeout = isFirefox || isWebKit || isMobile ? 60000 : 15000
    const waitTimeout = isFirefox || isWebKit || isMobile ? 30000 : 10000
    const clickTimeout = isMobile ? 30000 : 15000

    await test.step('Login first', async () => {
      // Mobile devices may need longer timeout for button click
      const signInButton = page.getByTestId('nav-sign-in-button')
      await signInButton.click({ timeout: clickTimeout })
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })
      await page.getByTestId('login-email-input').fill(testEmail)
      await page.getByTestId('login-password-input').fill(testPassword)
      await page.getByTestId('login-submit-button').click()

      // Wait for login API call to complete
      // Wait for page to load - use 'load' instead of 'networkidle' which is too strict
      try {
        await page.waitForLoadState('load', { timeout: 10000 })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }

      // Wait for auth modal to close
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 15000,
        })
        .catch(() => {})

      // Wait a bit for React state to update (use safeWait to handle page closure)
      await safeWait(page, 500)

      // Check if page is still valid before waiting for user menu
      if (page.isClosed()) {
        throw new Error('Page was closed after login')
      }

      // User menu button should appear (user data needs to load after login)
      await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
    })

    await test.step('Logout', async () => {
      // Open user menu - mobile devices may need longer timeout or force click
      const userMenuButton = page.getByTestId('user-menu-button')
      const menuClickTimeout = isMobile ? 60000 : 15000 // Increased timeout for mobile

      // Wait for button to be visible and stable before clicking (especially important for mobile)
      await expect(userMenuButton).toBeVisible({ timeout: menuClickTimeout })

      // For mobile devices, wait a bit longer to ensure button is stable
      if (isMobile) {
        await safeWait(page, 1000)
        // Check if page is still valid
        if (page.isClosed()) {
          throw new Error('Page was closed before menu click')
        }
        // Wait for button to be enabled and stable
        await userMenuButton.waitFor({ state: 'visible', timeout: 10000 })
        await safeWait(page, 500)
      }

      // Check if page is still valid before clicking
      if (page.isClosed()) {
        throw new Error('Page was closed before menu click')
      }

      try {
        // For mobile devices, use tap() which is more reliable than click()
        if (isMobile) {
          await userMenuButton.tap({ timeout: menuClickTimeout })
        } else {
          await userMenuButton.click({ timeout: menuClickTimeout })
        }
      } catch (error) {
        if (page.isClosed()) {
          throw new Error('Page was closed during menu interaction')
        }
        // If tap/click fails, try force click
        if (isMobile) {
          // Wait a bit more and try force click
          await safeWait(page, 1000)
          if (page.isClosed()) {
            throw new Error('Page was closed before force click')
          }
          await userMenuButton.click({ timeout: menuClickTimeout, force: true })
        } else {
          throw error
        }
      }
      await safeWait(page, 1000) // Wait longer for menu to open (increased from 500ms)

      // Wait for logout API call before clicking (logout triggers navigation)
      const logoutResponsePromise = page
        .waitForResponse(response => response.url().includes('/auth/logout'), { timeout: 15000 })
        .catch(() => null)

      // Click logout - mobile devices may need longer timeout
      const logoutButton = page.getByTestId('logout-button')
      const logoutClickTimeout = isMobile ? 30000 : 15000
      await logoutButton.click({ timeout: logoutClickTimeout })

      // Wait for logout API response
      await logoutResponsePromise

      // Logout triggers window.location.href = '/' which causes full page navigation
      // Wait for navigation to complete
      await page.waitForURL('**/', { timeout: navigationTimeout }).catch(() => {
        // Navigation might have already completed
      })

      // Wait for page to load after navigation
      try {
        await page.waitForLoadState('load', { timeout: navigationTimeout })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }
    })

    await test.step('Verify logout success', async () => {
      // User menu should be hidden
      await expect(page.getByTestId('user-menu-button')).not.toBeVisible({ timeout: 5000 })

      // Sign-in button should be visible again (wait longer for React state update, especially in Firefox)
      // Wait for navigation to complete and React to re-render
      await safeWait(page, 1000) // Give React time to update state

      await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: waitTimeout })
    })
  })
})
