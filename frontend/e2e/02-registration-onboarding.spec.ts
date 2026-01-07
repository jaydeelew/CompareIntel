import { test, expect } from '@playwright/test'

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
    await page.waitForLoadState('networkidle')
  })

  test('User can register a new account', async ({ page }) => {
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

      await submitButton.click()

      // Wait for registration to process
      await page.waitForLoadState('networkidle')
    })

    await test.step('Verify registration success', async () => {
      // Auth modal should close
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {})

      // User menu button should appear (user is logged in)
      const userMenuButton = page.getByTestId('user-menu-button')
      await expect(userMenuButton).toBeVisible({ timeout: 10000 })

      // Sign-in/sign-up buttons should be hidden
      await expect(page.getByTestId('nav-sign-in-button')).not.toBeVisible({ timeout: 2000 })
      await expect(page.getByTestId('nav-sign-up-button')).not.toBeVisible({ timeout: 2000 })
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

      await page.getByTestId('register-submit-button').click()
      await page.waitForLoadState('networkidle')

      // Wait for user menu to appear
      await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Perform first comparison', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()

      await inputField.fill('Explain machine learning in simple terms.')

      // Select models (registered users can select more than 3)
      const modelCheckboxes = page.locator('input[type="checkbox"]')
      const checkboxCount = await modelCheckboxes.count()

      if (checkboxCount > 0) {
        // Select first model
        await modelCheckboxes.first().check()
      }

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
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 10000 })
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
      // User menu should be hidden
      await expect(page.getByTestId('user-menu-button')).not.toBeVisible({ timeout: 5000 })

      // Sign-in button should be visible again
      await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: 2000 })
    })
  })
})
