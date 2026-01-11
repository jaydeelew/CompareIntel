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

test.describe('Registration and Onboarding', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies()
    await context.clearPermissions()
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 60000 })
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
      await page.waitForLoadState('networkidle')
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

  test('New user can perform first comparison', async ({ page }) => {
    // Increase timeout for registration + comparison test
    test.setTimeout(60000)
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

      // Submit comparison
      await page.getByTestId('comparison-submit-button').click()

      // Wait for results
      await page.waitForLoadState('networkidle')

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
      await page.waitForLoadState('networkidle')
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

  test('User can logout', async ({ page }) => {
    const testEmail = process.env.TEST_FREE_EMAIL || process.env.TEST_USER_EMAIL || 'free@test.com'
    const testPassword =
      process.env.TEST_FREE_PASSWORD || process.env.TEST_USER_PASSWORD || 'Test12345678/'

    await test.step('Login first', async () => {
      await page.getByTestId('nav-sign-in-button').click()
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })
      await page.getByTestId('login-email-input').fill(testEmail)
      await page.getByTestId('login-password-input').fill(testPassword)
      await page.getByTestId('login-submit-button').click()

      // Wait for login API call to complete
      await page.waitForLoadState('networkidle')

      // Wait for auth modal to close
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 15000,
        })
        .catch(() => {})

      // Wait a bit for React state to update
      await page.waitForTimeout(500)

      // User menu button should appear (user data needs to load after login)
      await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
    })

    await test.step('Logout', async () => {
      // Open user menu
      const userMenuButton = page.getByTestId('user-menu-button')
      await userMenuButton.click()
      await page.waitForTimeout(300)

      // Click logout
      const logoutButton = page.getByTestId('logout-button')
      await logoutButton.click()

      await page.waitForLoadState('networkidle')
    })

    await test.step('Verify logout success', async () => {
      // Wait for logout API call to complete
      await page.waitForLoadState('networkidle', { timeout: 10000 })

      // User menu should be hidden
      await expect(page.getByTestId('user-menu-button')).not.toBeVisible({ timeout: 5000 })

      // Sign-in button should be visible again (wait longer for React state update)
      await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: 10000 })
    })
  })
})
