import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Authentication Flow
 *
 * Tests the complete user registration → verification → comparison flow
 */

test.describe('Authentication Flow', () => {
  // Generate unique email for each test run
  const timestamp = Date.now()
  const testEmail = `test-${timestamp}@example.com`
  const testPassword = 'TestPassword123!'

  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/')

    // Wait for page to load
    await page.waitForLoadState('networkidle')
  })

  test('User registration → verification → comparison', async ({ page }) => {
    // Step 1: Register a new user
    await test.step('Register new user', async () => {
      // Click sign up button using data-testid
      await page.getByTestId('nav-sign-up-button').click()

      // Wait for auth modal to appear
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      // Fill registration form using data-testid (when RegisterForm has them)
      // For now, using fallback selectors until RegisterForm is updated
      const emailInput = page.locator('input[type="email"]').first()
      await emailInput.fill(testEmail)

      const passwordInput = page.locator('input[type="password"]').first()
      await passwordInput.fill(testPassword)

      // If there's a confirm password field
      const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
      if (await confirmPasswordInput.isVisible({ timeout: 2000 })) {
        await confirmPasswordInput.fill(testPassword)
      }

      // Submit registration
      const submitButton = page.getByTestId('register-submit-button')
      await submitButton.click()

      // Wait for registration to complete
      await page.waitForLoadState('networkidle')

      // Verify user is logged in (check for user email or profile indicator)
      await expect(page.getByText(testEmail, { exact: false })).toBeVisible({ timeout: 10000 })
    })

    // Step 2: Verify email (if verification is required)
    await test.step('Verify email', async () => {
      // Check if verification banner/modal is shown
      const verificationBanner = page.getByText(/verify|verification/i)

      if (await verificationBanner.isVisible({ timeout: 5000 })) {
        // In development, we might need to manually verify or use a test token
        // For now, we'll check if the verification UI is shown
        await expect(verificationBanner).toBeVisible()

        // If there's a way to verify in test mode, do it here
        // For production tests, you'd need to extract the token from email
      }
    })

    // Step 3: Perform a comparison
    await test.step('Perform comparison', async () => {
      // Wait for the comparison form to be visible using data-testid
      const inputField = page.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()

      // Enter test input
      const testInput = 'What is the capital of France?'
      await inputField.fill(testInput)

      // Select at least one model (checkboxes or dropdown)
      // Look for model selection UI
      const modelCheckboxes = page.locator('input[type="checkbox"]')
      const checkboxCount = await modelCheckboxes.count()

      if (checkboxCount > 0) {
        // Select the first available model
        await modelCheckboxes.first().check()
      } else {
        // Try to find model selection buttons or dropdowns
        const modelButton = page.getByRole('button', { name: /model/i }).first()
        if (await modelButton.isVisible({ timeout: 2000 })) {
          await modelButton.click()
          // Select first model from dropdown
          const firstModel = page.getByRole('option').first()
          await firstModel.click()
        }
      }

      // Submit comparison using data-testid
      await page.getByTestId('comparison-submit-button').click()

      // Wait for results
      await page.waitForLoadState('networkidle')

      // Verify results are displayed
      // Look for result cards or response text
      const results = page
        .locator('[data-testid^="result-card-"], .result-card, .model-response')
        .first()
      await expect(results).toBeVisible({ timeout: 30000 })
    })
  })

  test('User login flow', async ({ page }) => {
    // This test assumes a user already exists
    // In a real scenario, you'd create the user first or use a test fixture

    await test.step('Login with credentials', async () => {
      // Click login button using data-testid
      await page.getByTestId('nav-sign-in-button').click()

      // Wait for auth modal to appear
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      // Fill login form using data-testid
      await page.getByTestId('login-email-input').fill(testEmail)
      await page.getByTestId('login-password-input').fill(testPassword)

      // Submit login using data-testid
      await page.getByTestId('login-submit-button').click()

      // Wait for login to complete
      await page.waitForLoadState('networkidle')

      // Verify user is logged in
      await expect(page.getByText(testEmail, { exact: false })).toBeVisible({ timeout: 10000 })
    })
  })

  test('User logout flow', async ({ page }) => {
    // First, login (you might want to use a test fixture for this)
    // For now, we'll assume user is already logged in

    await test.step('Logout', async () => {
      // Find logout button (usually in user menu or header)
      const userMenu = page.getByRole('button', { name: /user|profile|account/i })
      if (await userMenu.isVisible({ timeout: 2000 })) {
        await userMenu.click()
      }

      // Open user menu first
      const userMenuButton = page.getByTestId('user-menu-button')
      await userMenuButton.click()
      await page.waitForTimeout(300)

      // Click logout button
      const logoutButton = page.getByTestId('logout-button')
      await logoutButton.click()

      // Verify user is logged out
      await expect(page.getByRole('button', { name: /login|sign in/i })).toBeVisible({
        timeout: 5000,
      })
    })
  })
})
